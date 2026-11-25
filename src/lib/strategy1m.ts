import type {
  Candle,
  OrderbookSnapshot,
  SignalDirection,
  TechnicalAnalysis,
} from '../types/trading.ts';
import { applyConfidenceGate, DEFAULT_CONFIDENCE_THRESHOLD } from './accuracy.ts';
import { analyzeMarketStructure } from './indicators.ts';

export interface Strategy1mEvaluation {
  direction: SignalDirection;
  confidence: number;
  setupName: string;
  reasoning: string;
  closedCandle: Candle | null;
  closedCandleOpenTime: number;
  nextCandleOpenTime: number;
  nextCandleCloseTime: number;
  entryPrice: number;
  analysis: TechnicalAnalysis;
}

/**
 * Evaluates a 1-minute close-candle -> next-candle strategy using strictly real 1m candles.
 * Separates the most recently closed 1m bar from any still-forming 1m bar when nowMs is mid-minute,
 * inspects close strength, breakout/engulfing, wick rejection, EMA(5/13/21), MACD, RSI, and Bollinger %B.
 */
export function evaluate1mCloseStrategy(
  candles: Candle[],
  orderbook: OrderbookSnapshot | null,
  nowMs: number = Date.now(),
  confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): Strategy1mEvaluation {
  const sorted = [...candles].sort((a, b) => a.openTime - b.openTime);
  const currentMinuteOpen = Math.floor(nowMs / 60_000) * 60_000;

  // Use bars up to the most recently closed 1m candle when a forming current-minute bar exists
  const closedSeries = sorted.filter((c) => c.closeTime <= nowMs || c.openTime < currentMinuteOpen);
  const evalSeries = closedSeries.length >= 12 ? closedSeries : sorted;

  const analysis = analyzeMarketStructure(evalSeries, '1m', orderbook, nowMs);
  const closedCandle = evalSeries[evalSeries.length - 1] ?? null;
  const prevCandle = evalSeries[evalSeries.length - 2] ?? null;

  const nextCandleOpenTime = currentMinuteOpen + 60_000;
  const nextCandleCloseTime = nextCandleOpenTime + 59_999;

  if (!analysis.dataSufficient || !closedCandle) {
    return {
      direction: 'NO_TRADE',
      confidence: 0,
      setupName: 'Insufficient 1m Data',
      reasoning:
        analysis.insufficiencyReason ??
        'Insufficient closed 1m candle history to validate next-candle setup.',
      closedCandle,
      closedCandleOpenTime: closedCandle?.openTime ?? currentMinuteOpen - 60_000,
      nextCandleOpenTime,
      nextCandleCloseTime,
      entryPrice: analysis.latestPrice,
      analysis,
    };
  }

  let score = 0;
  let setupName = 'Mixed Consolidation (Wait)';
  const reasons: string[] = [];

  const range = Math.max(closedCandle.high - closedCandle.low, 1e-10);
  const body = closedCandle.close - closedCandle.open;
  const bodyRatio = body / range;
  const upperWick = closedCandle.high - Math.max(closedCandle.open, closedCandle.close);
  const lowerWick = Math.min(closedCandle.open, closedCandle.close) - closedCandle.low;

  // 1. Closed 1m candle breakout or engulfing relative to previous closed 1m bar
  if (prevCandle) {
    const prevBody = prevCandle.close - prevCandle.open;
    const isBullishEngulfing =
      body > 0 &&
      prevBody < 0 &&
      closedCandle.close >= prevCandle.open &&
      closedCandle.open <= prevCandle.close;
    const isBearishEngulfing =
      body < 0 &&
      prevBody > 0 &&
      closedCandle.close <= prevCandle.open &&
      closedCandle.open >= prevCandle.close;

    if (isBullishEngulfing) {
      score += 24;
      setupName = 'Bullish 1m Engulfing Close';
      reasons.push('1m candle closed engulfing prior bearish body');
    } else if (isBearishEngulfing) {
      score -= 24;
      setupName = 'Bearish 1m Engulfing Close';
      reasons.push('1m candle closed engulfing prior bullish body');
    } else if (closedCandle.close > prevCandle.high && bodyRatio > 0.35) {
      score += 20;
      setupName = '1m High Breakout Close';
      reasons.push('1m candle closed cleanly above previous candle high');
    } else if (closedCandle.close < prevCandle.low && bodyRatio < -0.35) {
      score -= 20;
      setupName = '1m Low Breakdown Close';
      reasons.push('1m candle closed cleanly below previous candle low');
    }
  }

  // 2. Closed 1m candle body dominance & wick rejection
  if (bodyRatio > 0.55) {
    score += 14;
    if (setupName === 'Mixed Consolidation (Wait)') {
      setupName = 'Strong Bullish 1m Close';
    }
    reasons.push(`Strong bullish body (${Math.round(bodyRatio * 100)}% of bar)`);
  } else if (bodyRatio < -0.55) {
    score -= 14;
    if (setupName === 'Mixed Consolidation (Wait)') {
      setupName = 'Strong Bearish 1m Close';
    }
    reasons.push(`Strong bearish body (${Math.round(Math.abs(bodyRatio) * 100)}% of bar)`);
  } else if (lowerWick > range * 0.48 && body >= 0 && analysis.bollingerPercentB <= 0.38) {
    score += 18;
    setupName = '1m Lower-Wick Support Rebound';
    reasons.push('Long lower wick rejection off lower band/support');
  } else if (upperWick > range * 0.48 && body <= 0 && analysis.bollingerPercentB >= 0.62) {
    score -= 18;
    setupName = '1m Upper-Wick Resistance Rejection';
    reasons.push('Long upper wick rejection near upper band/resistance');
  }

  // 3. Multi-indicator 1m close confluence (EMA + MACD + RSI/Bollinger + Orderflow)
  if (analysis.emaAlignment === 'BULLISH') {
    score += 18;
    if (setupName === 'Mixed Consolidation (Wait)') {
      setupName = 'EMA + MACD Bullish 1m Close';
    }
    reasons.push('EMA 5/13/21 stacked bullish');
  } else if (analysis.emaAlignment === 'BEARISH') {
    score -= 18;
    if (setupName === 'Mixed Consolidation (Wait)') {
      setupName = 'EMA + MACD Bearish 1m Close';
    }
    reasons.push('EMA 5/13/21 stacked bearish');
  }

  if (analysis.macdBias === 'BULLISH') {
    score += 12;
    reasons.push('MACD histogram expanding positive');
  } else if (analysis.macdBias === 'BEARISH') {
    score -= 12;
    reasons.push('MACD histogram expanding negative');
  }

  // Exhaustion / Reversal guard against chasing overextended 1m extremes
  if (analysis.rsi14 > 74 && analysis.bollingerPercentB > 0.92 && score > 0) {
    score -= 14;
    reasons.push(`Overbought exhaustion risk (RSI ${analysis.rsi14.toFixed(0)})`);
  } else if (analysis.rsi14 < 26 && analysis.bollingerPercentB < 0.08 && score < 0) {
    score += 14;
    reasons.push(`Oversold bounce risk (RSI ${analysis.rsi14.toFixed(0)})`);
  } else if (analysis.rsi14 >= 53 && analysis.rsi14 <= 70) {
    score += 8;
  } else if (analysis.rsi14 <= 47 && analysis.rsi14 >= 30) {
    score -= 8;
  }

  if (analysis.orderbook) {
    if (analysis.orderbook.imbalanceRatio > 0.14) {
      score += 8;
      reasons.push(`Bid depth +${Math.round(analysis.orderbook.imbalanceRatio * 100)}%`);
    } else if (analysis.orderbook.imbalanceRatio < -0.14) {
      score -= 8;
      reasons.push(`Ask depth ${Math.round(analysis.orderbook.imbalanceRatio * 100)}%`);
    }
  }

  const clamped = Math.max(-95, Math.min(95, score));
  const rawConfidence = Math.min(90, Math.round(50 + Math.abs(clamped) * 0.44));
  const rawDirection: SignalDirection =
    clamped > 0 ? 'UP' : clamped < 0 ? 'DOWN' : 'NO_TRADE';

  const gated = applyConfidenceGate(
    rawDirection,
    rawConfidence,
    analysis.dataSufficient,
    confidenceThreshold,
  );

  if (gated.direction === 'NO_TRADE') {
    setupName = 'Balanced 1m Close (Wait)';
  }

  return {
    direction: gated.direction,
    confidence: gated.confidence,
    setupName,
    reasoning:
      reasons.slice(0, 2).join(' · ') ||
      '1m candle closed without decisive directional edge.',
    closedCandle,
    closedCandleOpenTime: closedCandle.openTime,
    nextCandleOpenTime,
    nextCandleCloseTime,
    entryPrice: closedCandle.close,
    analysis,
  };
}
