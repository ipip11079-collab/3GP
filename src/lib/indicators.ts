import type {
  BroaderSentiment,
  Candle,
  MarketRegime,
  MultiTimeframeContext,
  OrderbookSnapshot,
  TechnicalAnalysis,
  Timeframe,
} from '../types/trading.ts';
import { getTimeframeSeconds } from './pairs.ts';
import { analyzeSmcAndPriceAction } from './smc.ts';

export interface RawTick {
  price: number;
  volume: number;
  timestampMs: number;
  side: 'b' | 's' | 'u';
}

export function aggregateCandlesFrom1s(
  sourceCandles: Candle[],
  timeframe: Timeframe,
  nowMs: number = Date.now(),
): Candle[] {
  const bucketMs = getTimeframeSeconds(timeframe) * 1000;
  if (timeframe === '1m' && sourceCandles.length > 0) {
    const firstDur = sourceCandles[0].closeTime - sourceCandles[0].openTime;
    if (firstDur >= 55000) {
      return [...sourceCandles].sort((a, b) => a.openTime - b.openTime);
    }
  }

  const buckets = new Map<number, Candle>();
  const sorted = [...sourceCandles].sort((a, b) => a.openTime - b.openTime);

  for (const c of sorted) {
    const bucketOpen = Math.floor(c.openTime / bucketMs) * bucketMs;
    const existing = buckets.get(bucketOpen);
    if (!existing) {
      buckets.set(bucketOpen, {
        openTime: bucketOpen,
        closeTime: bucketOpen + bucketMs - 1,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
        buyVolume: c.buyVolume ?? 0,
        sellVolume: c.sellVolume ?? 0,
        tradeCount: c.tradeCount ?? 1,
      });
    } else {
      existing.high = Math.max(existing.high, c.high);
      existing.low = Math.min(existing.low, c.low);
      existing.close = c.close;
      existing.volume += c.volume;
      existing.buyVolume = (existing.buyVolume ?? 0) + (c.buyVolume ?? 0);
      existing.sellVolume = (existing.sellVolume ?? 0) + (c.sellVolume ?? 0);
      existing.tradeCount = (existing.tradeCount ?? 0) + (c.tradeCount ?? 1);
    }
  }

  return Array.from(buckets.values())
    .filter((c) => c.openTime <= nowMs)
    .sort((a, b) => a.openTime - b.openTime);
}

export function aggregateCandlesFromTicks(
  ticks: RawTick[],
  timeframe: Timeframe,
  nowMs: number = Date.now(),
): Candle[] {
  if (ticks.length === 0) return [];
  const bucketMs = getTimeframeSeconds(timeframe) * 1000;
  const sorted = [...ticks].sort((a, b) => a.timestampMs - b.timestampMs);

  const firstBucket = Math.floor(sorted[0].timestampMs / bucketMs) * bucketMs;
  const currentBucket = Math.floor(nowMs / bucketMs) * bucketMs;

  const grouped = new Map<number, RawTick[]>();
  for (const t of sorted) {
    const b = Math.floor(t.timestampMs / bucketMs) * bucketMs;
    const arr = grouped.get(b);
    if (arr) arr.push(t);
    else grouped.set(b, [t]);
  }

  const candles: Candle[] = [];
  let lastClose = sorted[0].price;
  const startBucket = Math.max(firstBucket, currentBucket - bucketMs * 80);

  for (let b = startBucket; b <= currentBucket; b += bucketMs) {
    const group = grouped.get(b);
    if (!group || group.length === 0) {
      if (candles.length > 0) {
        candles.push({
          openTime: b,
          closeTime: b + bucketMs - 1,
          open: lastClose,
          high: lastClose,
          low: lastClose,
          close: lastClose,
          volume: 0,
          buyVolume: 0,
          sellVolume: 0,
          tradeCount: 0,
        });
      }
      continue;
    }

    const open = group[0].price;
    let high = group[0].price;
    let low = group[0].price;
    const close = group[group.length - 1].price;
    let volume = 0;
    let buyVolume = 0;
    let sellVolume = 0;

    for (const t of group) {
      if (t.price > high) high = t.price;
      if (t.price < low) low = t.price;
      volume += t.volume;
      if (t.side === 'b') buyVolume += t.volume;
      else if (t.side === 's') sellVolume += t.volume;
    }

    lastClose = close;
    candles.push({
      openTime: b,
      closeTime: b + bucketMs - 1,
      open,
      high,
      low,
      close,
      volume,
      buyVolume,
      sellVolume,
      tradeCount: group.length,
    });
  }

  return candles;
}

export function calculateEMA(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const ema: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    ema.push(values[i] * k + ema[i - 1] * (1 - k));
  }
  return ema;
}

export function calculateSMA(values: number[], period: number): number {
  if (values.length === 0) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return slice.reduce((acc, v) => acc + v, 0) / slice.length;
}

export function computeBroaderMultiTimeframeSentiment(params: {
  candles1m: Candle[];
  candles5m: Candle[];
  candles15m: Candle[];
}): MultiTimeframeContext | null {
  const closes1m = params.candles1m.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  const closes5m = params.candles5m.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);
  const closes15m = params.candles15m.map((c) => c.close).filter((v) => Number.isFinite(v) && v > 0);

  if (closes1m.length < 10 && closes5m.length < 10) {
    return null;
  }

  const evalTrend = (closes: number[]): { trend: 'BULLISH' | 'BEARISH' | 'MIXED'; rsi14: number } => {
    if (closes.length < 6) return { trend: 'MIXED', rsi14: 50 };
    const ema5 = calculateEMA(closes, 5);
    const ema21 = calculateEMA(closes, 21);
    const rsi14 = calculateRSI(closes, 14);
    const last5 = ema5[ema5.length - 1];
    const last21 = ema21[ema21.length - 1];
    const lastPrice = closes[closes.length - 1];
    if (lastPrice > last5 && last5 > last21 && rsi14 >= 51) {
      return { trend: 'BULLISH', rsi14 };
    }
    if (lastPrice < last5 && last5 < last21 && rsi14 <= 49) {
      return { trend: 'BEARISH', rsi14 };
    }
    return { trend: 'MIXED', rsi14 };
  };

  const tf1m = evalTrend(closes1m.length >= 6 ? closes1m : closes5m);
  const tf5m = evalTrend(closes5m.length >= 6 ? closes5m : closes1m);
  const tf15m = evalTrend(closes15m.length >= 6 ? closes15m : closes5m);

  const smaBase = closes5m.length >= 25 ? closes5m : closes1m;
  const smaFast20 = calculateSMA(smaBase, 20);
  const smaSlow50 = calculateSMA(smaBase, 50);
  const smaSpreadPct =
    smaSlow50 > 0 ? Number((((smaFast20 - smaSlow50) / smaSlow50) * 100).toFixed(4)) : 0;

  let smaCrossover: 'GOLDEN_BULL' | 'DEATH_BEAR' | 'NEUTRAL' = 'NEUTRAL';
  if (smaSpreadPct > 0.015) smaCrossover = 'GOLDEN_BULL';
  else if (smaSpreadPct < -0.015) smaCrossover = 'DEATH_BEAR';

  const lookback1m = closes1m.length >= 6 ? closes1m[closes1m.length - 6] : closes1m[0] ?? 1;
  const latest1m = closes1m[closes1m.length - 1] ?? lookback1m;
  const anchorRocPct =
    lookback1m > 0 ? Number((((latest1m - lookback1m) / lookback1m) * 100).toFixed(4)) : 0;

  let sentimentScore = 0;
  if (smaCrossover === 'GOLDEN_BULL') sentimentScore += 2;
  else if (smaCrossover === 'DEATH_BEAR') sentimentScore -= 2;
  if (tf5m.trend === 'BULLISH') sentimentScore += 1;
  else if (tf5m.trend === 'BEARISH') sentimentScore -= 1;
  if (tf15m.trend === 'BULLISH') sentimentScore += 1;
  else if (tf15m.trend === 'BEARISH') sentimentScore -= 1;
  if (tf5m.rsi14 >= 56) sentimentScore += 1;
  else if (tf5m.rsi14 <= 44) sentimentScore -= 1;

  let broaderSentiment: BroaderSentiment = 'NEUTRAL';
  if (sentimentScore >= 4) broaderSentiment = 'STRONG_BULLISH';
  else if (sentimentScore >= 2) broaderSentiment = 'BULLISH';
  else if (sentimentScore <= -4) broaderSentiment = 'STRONG_BEARISH';
  else if (sentimentScore <= -2) broaderSentiment = 'BEARISH';

  return {
    anchorTimeframe: '1m',
    anchorTrend: tf1m.trend,
    anchorRsi14: tf1m.rsi14,
    anchorRocPct,
    broader5mTrend: tf5m.trend,
    broader5mRsi14: tf5m.rsi14,
    broader15mTrend: tf15m.trend,
    broader15mRsi14: tf15m.rsi14,
    smaFast20,
    smaSlow50,
    smaCrossover,
    smaSpreadPct,
    broaderSentiment,
  };
}

export function calculateRSI(closes: number[], period: number = 14): number {
  if (closes.length < 2) return 50;
  const effectivePeriod = Math.min(period, closes.length - 1);
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= effectivePeriod; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses -= diff;
  }

  let avgGain = gains / effectivePeriod;
  let avgLoss = losses / effectivePeriod;

  for (let i = effectivePeriod + 1; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    const gain = diff > 0 ? diff : 0;
    const loss = diff < 0 ? -diff : 0;
    avgGain = (avgGain * (effectivePeriod - 1) + gain) / effectivePeriod;
    avgLoss = (avgLoss * (effectivePeriod - 1) + loss) / effectivePeriod;
  }

  if (avgLoss === 0 && avgGain === 0) return 50;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return Number((100 - 100 / (1 + rs)).toFixed(2));
}

export function calculateMACD(closes: number[]): {
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
} {
  if (closes.length < 10) {
    return { macdLine: 0, macdSignal: 0, macdHistogram: 0, bias: 'NEUTRAL' };
  }
  const ema12 = calculateEMA(closes, 12);
  const ema26 = calculateEMA(closes, 26);
  const macdSeries = closes.map((_, i) => ema12[i] - ema26[i]);
  const signalSeries = calculateEMA(macdSeries, 9);

  const macdLine = macdSeries[macdSeries.length - 1];
  const macdSignal = signalSeries[signalSeries.length - 1];
  const macdHistogram = macdLine - macdSignal;
  const prevHistogram =
    macdSeries.length >= 2
      ? macdSeries[macdSeries.length - 2] - signalSeries[signalSeries.length - 2]
      : macdHistogram;

  let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (macdHistogram > 0 && macdHistogram >= prevHistogram * 0.9) {
    bias = 'BULLISH';
  } else if (macdHistogram < 0 && macdHistogram <= prevHistogram * 0.9) {
    bias = 'BEARISH';
  }

  return {
    macdLine,
    macdSignal,
    macdHistogram,
    bias,
  };
}

export function calculateBollingerBands(
  closes: number[],
  period: number = 20,
  mult: number = 2,
): { upper: number; middle: number; lower: number; percentB: number } {
  if (closes.length === 0) {
    return { upper: 0, middle: 0, lower: 0, percentB: 0.5 };
  }
  const slice = closes.slice(-Math.min(period, closes.length));
  const middle = slice.reduce((a, b) => a + b, 0) / slice.length;
  const variance =
    slice.reduce((acc, v) => acc + (v - middle) ** 2, 0) / slice.length;
  const stdDev = Math.sqrt(variance);
  const upper = middle + mult * stdDev;
  const lower = middle - mult * stdDev;
  const latest = closes[closes.length - 1];
  const bandWidth = upper - lower;
  const percentB = bandWidth > 1e-12 ? (latest - lower) / bandWidth : 0.5;

  return {
    upper,
    middle,
    lower,
    percentB: Number(Math.max(0, Math.min(1, percentB)).toFixed(3)),
  };
}

export function calculateStochRSI(closes: number[], period: number = 14): number {
  if (closes.length < period + 3) return 50;
  const rsiHistory: number[] = [];
  for (let i = period; i <= closes.length; i++) {
    rsiHistory.push(calculateRSI(closes.slice(0, i), period));
  }
  const recent = rsiHistory.slice(-Math.min(period, rsiHistory.length));
  const minRsi = Math.min(...recent);
  const maxRsi = Math.max(...recent);
  if (maxRsi - minRsi < 1e-6) return 50;
  const curr = recent[recent.length - 1];
  return Number((((curr - minRsi) / (maxRsi - minRsi)) * 100).toFixed(1));
}

export function summarizeOrderbook(
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
): OrderbookSnapshot | null {
  if (bids.length === 0 || asks.length === 0) return null;
  const bestBid = bids[0][0];
  const bestAsk = asks[0][0];
  if (bestBid <= 0 || bestAsk <= 0) return null;

  const mid = (bestBid + bestAsk) / 2;
  const spreadPct = ((bestAsk - bestBid) / mid) * 100;

  let bidLiquidity = 0;
  let askLiquidity = 0;
  let maxBidWallSize = 0;
  let nearestSupportWall: number | null = null;
  let maxAskWallSize = 0;
  let nearestResistanceWall: number | null = null;

  for (const [price, size] of bids.slice(0, 20)) {
    const notional = price * size;
    bidLiquidity += notional;
    if (notional > maxBidWallSize) {
      maxBidWallSize = notional;
      nearestSupportWall = price;
    }
  }

  for (const [price, size] of asks.slice(0, 20)) {
    const notional = price * size;
    askLiquidity += notional;
    if (notional > maxAskWallSize) {
      maxAskWallSize = notional;
      nearestResistanceWall = price;
    }
  }

  const totalLiq = bidLiquidity + askLiquidity;
  const imbalanceRatio = totalLiq > 0 ? (bidLiquidity - askLiquidity) / totalLiq : 0;

  return {
    bestBid,
    bestAsk,
    spreadPct: Number(spreadPct.toFixed(5)),
    bidLiquidity: Number(bidLiquidity.toFixed(2)),
    askLiquidity: Number(askLiquidity.toFixed(2)),
    imbalanceRatio: Number(imbalanceRatio.toFixed(4)),
    nearestSupportWall,
    nearestResistanceWall,
  };
}

export function analyzeMarketStructure(
  candles: Candle[],
  timeframe: Timeframe,
  orderbook: OrderbookSnapshot | null,
  nowMs: number = Date.now(),
): TechnicalAnalysis {
  const bucketMs = getTimeframeSeconds(timeframe) * 1000;
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);

  const windowCandles = sorted.slice(-60);
  const activeCandles = windowCandles.filter(
    (c) => c.high !== c.low || c.open !== c.close || c.volume > 0 || (c.tradeCount ?? 0) > 0,
  );

  const latest = windowCandles[windowCandles.length - 1];
  const latestPrice = latest?.close ?? 0;
  const currentBucketOpen = Math.floor(nowMs / bucketMs) * bucketMs;
  const nextCandleOpenTime = currentBucketOpen + bucketMs;
  const nextCandleCloseTime = nextCandleOpenTime + bucketMs - 1;

  const maxStalenessMs = Math.max(bucketMs * 5, 180_000);
  const isStale = !latest || nowMs - latest.closeTime > maxStalenessMs;
  const minRequiredActive = timeframe === '1m' ? 12 : 6;
  const closes = windowCandles.map((c) => c.close);
  const uniqueCloses = new Set(closes.slice(-15));

  if (
    windowCandles.length < 10 ||
    activeCandles.length < minRequiredActive ||
    uniqueCloses.size < 3 ||
    isStale ||
    latestPrice <= 0
  ) {
    const reason = isStale
      ? 'Market feed appears stale or inactive (market may be closed or delayed).'
      : `Insufficient active ${timeframe} price movement (${activeCandles.length} active candles, ${uniqueCloses.size} distinct closes).`;

    return {
      candleCount: windowCandles.length,
      activeCandleCount: activeCandles.length,
      latestPrice,
      latestCandleOpenTime: latest?.openTime ?? currentBucketOpen,
      latestCandleCloseTime: latest?.closeTime ?? currentBucketOpen + bucketMs - 1,
      nextCandleOpenTime,
      nextCandleCloseTime,
      emaFast: latestPrice,
      emaMid: latestPrice,
      emaSlow: latestPrice,
      emaAlignment: 'MIXED',
      rsi14: 50,
      rsi7: 50,
      stochRsi: 50,
      macdLine: 0,
      macdSignal: 0,
      macdHistogram: 0,
      macdBias: 'NEUTRAL',
      bollingerUpper: latestPrice,
      bollingerMiddle: latestPrice,
      bollingerLower: latestPrice,
      bollingerPercentB: 0.5,
      marketRegime: 'RANGING',
      rocPct: 0,
      atrPct: 0,
      volatilityPct: 0,
      supportLevel: latestPrice,
      resistanceLevel: latestPrice,
      distanceToSupportPct: 0,
      distanceToResistancePct: 0,
      volumeTrendRatio: 1,
      takerBuyRatio: null,
      orderbook,
      bullishProbability: 50,
      bearishProbability: 50,
      quantitativeConfidence: 0,
      dataSufficient: false,
      insufficiencyReason: reason,
      keyFactors: [reason],
    };
  }

  // EMAs
  const ema5Arr = calculateEMA(closes, 5);
  const ema13Arr = calculateEMA(closes, 13);
  const ema21Arr = calculateEMA(closes, 21);
  const emaFast = ema5Arr[ema5Arr.length - 1];
  const emaMid = ema13Arr[ema13Arr.length - 1];
  const emaSlow = ema21Arr[ema21Arr.length - 1];
  const emaFastPrev = ema5Arr[Math.max(0, ema5Arr.length - 3)];

  let emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED';
  if (emaFast > emaMid && emaMid > emaSlow && emaFast > emaFastPrev) {
    emaAlignment = 'BULLISH';
  } else if (emaFast < emaMid && emaMid < emaSlow && emaFast < emaFastPrev) {
    emaAlignment = 'BEARISH';
  }

  const rsi14 = calculateRSI(closes, 14);
  const rsi7 = calculateRSI(closes, 7);
  const stochRsi = calculateStochRSI(closes, 14);
  const macd = calculateMACD(closes);
  const bb = calculateBollingerBands(closes, 20, 2);

  const lookbackIdx = Math.max(0, closes.length - 6);
  const rocPct = ((latestPrice - closes[lookbackIdx]) / closes[lookbackIdx]) * 100;

  const trueRanges: number[] = [];
  const returns: number[] = [];
  for (let i = 1; i < windowCandles.length; i++) {
    const curr = windowCandles[i];
    const prev = windowCandles[i - 1];
    const tr = Math.max(
      curr.high - curr.low,
      Math.abs(curr.high - prev.close),
      Math.abs(curr.low - prev.close),
    );
    trueRanges.push(tr / curr.close);
    returns.push((curr.close - prev.close) / prev.close);
  }
  const recentTR = trueRanges.slice(-14);
  const atrPct =
    recentTR.length > 0
      ? (recentTR.reduce((a, b) => a + b, 0) / recentTR.length) * 100
      : 0;

  const meanRet = returns.reduce((a, b) => a + b, 0) / Math.max(1, returns.length);
  const variance =
    returns.reduce((acc, r) => acc + (r - meanRet) ** 2, 0) /
    Math.max(1, returns.length);
  const volatilityPct = Math.sqrt(variance) * 100;

  let marketRegime: MarketRegime = 'RANGING';
  if (volatilityPct > 0.35) {
    marketRegime = 'HIGH_VOLATILITY';
  } else if (emaAlignment === 'BULLISH') {
    marketRegime = 'TRENDING_UP';
  } else if (emaAlignment === 'BEARISH') {
    marketRegime = 'TRENDING_DOWN';
  }

  const recentWindow = windowCandles.slice(-30);
  let supportLevel = Math.min(...recentWindow.map((c) => c.low));
  let resistanceLevel = Math.max(...recentWindow.map((c) => c.high));

  if (orderbook?.nearestSupportWall && orderbook.nearestSupportWall < latestPrice) {
    supportLevel = (supportLevel + orderbook.nearestSupportWall) / 2;
  }
  if (
    orderbook?.nearestResistanceWall &&
    orderbook.nearestResistanceWall > latestPrice
  ) {
    resistanceLevel = (resistanceLevel + orderbook.nearestResistanceWall) / 2;
  }

  const distanceToSupportPct = ((latestPrice - supportLevel) / latestPrice) * 100;
  const distanceToResistancePct = ((resistanceLevel - latestPrice) / latestPrice) * 100;

  const recentVols = windowCandles.slice(-5).map((c) => c.volume);
  const baseVols = windowCandles.slice(-20, -5).map((c) => c.volume);
  const avgRecentVol = recentVols.reduce((a, b) => a + b, 0) / Math.max(1, recentVols.length);
  const avgBaseVol = baseVols.reduce((a, b) => a + b, 0) / Math.max(1, baseVols.length);
  const volumeTrendRatio = avgBaseVol > 0 ? avgRecentVol / avgBaseVol : 1;

  const last5Buy = windowCandles
    .slice(-5)
    .reduce((acc, c) => acc + (c.buyVolume ?? 0), 0);
  const last5Sell = windowCandles
    .slice(-5)
    .reduce((acc, c) => acc + (c.sellVolume ?? 0), 0);
  const takerTotal = last5Buy + last5Sell;
  const takerBuyRatio = takerTotal > 0 ? last5Buy / takerTotal : null;

  let score = 0;
  const factors: string[] = [];

  // 1. EMA alignment
  if (emaAlignment === 'BULLISH') {
    score += 24;
    factors.push('Bullish EMA(5/13/21) alignment with upward slope');
  } else if (emaAlignment === 'BEARISH') {
    score -= 24;
    factors.push('Bearish EMA(5/13/21) alignment with downward slope');
  } else if (latestPrice > emaFast && emaFast > emaMid) {
    score += 12;
    factors.push('Short-term EMA(5/13) bullish crossover');
  } else if (latestPrice < emaFast && emaFast < emaMid) {
    score -= 12;
    factors.push('Short-term EMA(5/13) bearish crossover');
  }

  // 2. MACD momentum confirmation
  if (macd.bias === 'BULLISH') {
    score += 11;
    factors.push('MACD histogram positive momentum');
  } else if (macd.bias === 'BEARISH') {
    score -= 11;
    factors.push('MACD histogram negative momentum');
  }

  // 3. Price action (body dominance, wick rejection, engulfing, 3-candle impulse)
  const prev = windowCandles[windowCandles.length - 2];
  const prev2 = windowCandles[windowCandles.length - 3];
  const lastRange = Math.max(latest.high - latest.low, 1e-10);
  const lastBody = latest.close - latest.open;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;

  if (lastBody / lastRange > 0.52) {
    score += 14;
    factors.push('Strong bullish candle body close near high');
  } else if (lastBody / lastRange < -0.52) {
    score -= 14;
    factors.push('Strong bearish candle body close near low');
  } else if (lowerWick > lastRange * 0.5 && lastBody >= 0) {
    score += 12;
    factors.push('Lower wick rejection indicating buyer defense');
  } else if (upperWick > lastRange * 0.5 && lastBody <= 0) {
    score -= 12;
    factors.push('Upper wick rejection indicating seller pressure');
  }

  if (
    prev &&
    prev2 &&
    latest.close > latest.open &&
    prev.close > prev.open &&
    prev2.close > prev2.open
  ) {
    score += 9;
    factors.push('3-candle consecutive bullish impulse');
  } else if (
    prev &&
    prev2 &&
    latest.close < latest.open &&
    prev.close < prev.open &&
    prev2.close < prev2.open
  ) {
    score -= 9;
    factors.push('3-candle consecutive bearish impulse');
  }

  // 4. RSI + Bollinger Band %B + StochRSI confluence
  if (rsi7 > 78 && bb.percentB > 0.92 && stochRsi > 85) {
    score -= 13;
    factors.push(`Upper Bollinger exhaustion (RSI7 ${rsi7.toFixed(1)}, %B ${(bb.percentB * 100).toFixed(0)}%)`);
  } else if (rsi7 < 22 && bb.percentB < 0.08 && stochRsi < 15) {
    score += 13;
    factors.push(`Lower Bollinger rebound zone (RSI7 ${rsi7.toFixed(1)}, %B ${(bb.percentB * 100).toFixed(0)}%)`);
  } else if (rsi14 >= 53 && rsi14 <= 70) {
    score += 9;
  } else if (rsi14 <= 47 && rsi14 >= 30) {
    score -= 9;
  }

  // 5. Support / Resistance & Orderbook / Taker Flow
  const rangeSpan = Math.max(resistanceLevel - supportLevel, 1e-10);
  const posInRange = (latestPrice - supportLevel) / rangeSpan;
  if (posInRange <= 0.18 && takerBuyRatio !== null && takerBuyRatio > 0.52) {
    score += 10;
    factors.push('Price holding near support with positive bid absorption');
  } else if (posInRange >= 0.82 && takerBuyRatio !== null && takerBuyRatio < 0.48) {
    score -= 10;
    factors.push('Price testing resistance with active supply');
  }

  if (orderbook) {
    if (orderbook.imbalanceRatio > 0.15) {
      score += 11;
      factors.push(`Orderbook bid dominance (+${(orderbook.imbalanceRatio * 100).toFixed(0)}%)`);
    } else if (orderbook.imbalanceRatio < -0.15) {
      score -= 11;
      factors.push(`Orderbook ask dominance (${(orderbook.imbalanceRatio * 100).toFixed(0)}%)`);
    }
  }

  if (takerBuyRatio !== null) {
    if (takerBuyRatio > 0.56) {
      score += 10;
      factors.push(`Aggressive taker buying (${(takerBuyRatio * 100).toFixed(0)}% buy flow)`);
    } else if (takerBuyRatio < 0.44) {
      score -= 10;
      factors.push(`Aggressive taker selling (${((1 - takerBuyRatio) * 100).toFixed(0)}% sell flow)`);
    }
  }

  // 6. 18-Method SMC (BOS / CHOCH / OB / FVG / Liquidity Sweep / EMA 9-21-50 / Patterns)
  const smc = analyzeSmcAndPriceAction(windowCandles);
  score += Math.round(smc.smcScore * 0.28);
  for (const smcFactor of smc.smcFactors.slice(0, 2)) {
    if (!factors.includes(smcFactor)) {
      factors.push(smcFactor);
    }
  }

  const clampedScore = Math.max(-95, Math.min(95, score));
  const edge = Math.abs(clampedScore) * 0.42;
  const bullishProbability =
    clampedScore >= 0 ? Number((50 + edge).toFixed(1)) : Number((50 - edge).toFixed(1));
  const bearishProbability = Number((100 - bullishProbability).toFixed(1));
  const quantitativeConfidence = Number(Math.max(bullishProbability, bearishProbability).toFixed(1));

  if (factors.length === 0) {
    factors.push('Mixed short-term structure without clear directional confluence');
  }

  return {
    candleCount: windowCandles.length,
    activeCandleCount: activeCandles.length,
    latestPrice,
    latestCandleOpenTime: latest.openTime,
    latestCandleCloseTime: latest.closeTime,
    nextCandleOpenTime,
    nextCandleCloseTime,
    emaFast,
    emaMid,
    emaSlow,
    emaAlignment,
    rsi14,
    rsi7,
    stochRsi,
    macdLine: Number(macd.macdLine.toFixed(6)),
    macdSignal: Number(macd.macdSignal.toFixed(6)),
    macdHistogram: Number(macd.macdHistogram.toFixed(6)),
    macdBias: macd.bias,
    bollingerUpper: bb.upper,
    bollingerMiddle: bb.middle,
    bollingerLower: bb.lower,
    bollingerPercentB: bb.percentB,
    marketRegime,
    rocPct: Number(rocPct.toFixed(4)),
    atrPct: Number(atrPct.toFixed(4)),
    volatilityPct: Number(volatilityPct.toFixed(4)),
    supportLevel,
    resistanceLevel,
    distanceToSupportPct: Number(distanceToSupportPct.toFixed(4)),
    distanceToResistancePct: Number(distanceToResistancePct.toFixed(4)),
    volumeTrendRatio: Number(volumeTrendRatio.toFixed(2)),
    takerBuyRatio: takerBuyRatio !== null ? Number(takerBuyRatio.toFixed(3)) : null,
    orderbook,
    bullishProbability,
    bearishProbability,
    quantitativeConfidence,
    dataSufficient: true,
    insufficiencyReason: null,
    keyFactors: factors.slice(0, 5),
    smc,
  };
}
