import type { Candle, SmcAnalysis, ZoneRange } from '../types/trading.ts';

function computeEmaSeries(values: number[], period: number): number[] {
  if (values.length === 0) return [];
  const k = 2 / (period + 1);
  const out: number[] = [values[0]];
  for (let i = 1; i < values.length; i++) {
    out.push(values[i] * k + out[i - 1] * (1 - k));
  }
  return out;
}

interface SwingPoint {
  index: number;
  price: number;
}

function detectSwings(candles: Candle[], lookback: number = 2): {
  highs: SwingPoint[];
  lows: SwingPoint[];
} {
  const highs: SwingPoint[] = [];
  const lows: SwingPoint[] = [];
  if (candles.length < lookback * 2 + 1) return { highs, lows };

  for (let i = lookback; i < candles.length - lookback; i++) {
    const curr = candles[i];
    let isSwingHigh = true;
    let isSwingLow = true;
    for (let j = i - lookback; j <= i + lookback; j++) {
      if (j === i) continue;
      if (candles[j].high >= curr.high) isSwingHigh = false;
      if (candles[j].low <= curr.low) isSwingLow = false;
    }
    if (isSwingHigh) highs.push({ index: i, price: curr.high });
    if (isSwingLow) lows.push({ index: i, price: curr.low });
  }
  return { highs, lows };
}

function classifyCandlestick(latest: Candle, prev?: Candle): {
  pattern: string;
  psychology: string;
  biasScore: number;
} {
  const range = Math.max(latest.high - latest.low, 1e-10);
  const body = latest.close - latest.open;
  const absBody = Math.abs(body);
  const bodyRatio = absBody / range;
  const upperWick = latest.high - Math.max(latest.open, latest.close);
  const lowerWick = Math.min(latest.open, latest.close) - latest.low;
  const upperWickRatio = upperWick / range;
  const lowerWickRatio = lowerWick / range;

  if (prev) {
    const prevBody = prev.close - prev.open;
    if (
      prevBody < 0 &&
      body > 0 &&
      latest.close >= prev.open &&
      latest.open <= prev.close &&
      absBody > Math.abs(prevBody)
    ) {
      return {
        pattern: 'Bullish Engulfing',
        psychology: 'Buyers absorbed prior supply and closed decisively higher',
        biasScore: 14,
      };
    }
    if (
      prevBody > 0 &&
      body < 0 &&
      latest.close <= prev.open &&
      latest.open >= prev.close &&
      absBody > Math.abs(prevBody)
    ) {
      return {
        pattern: 'Bearish Engulfing',
        psychology: 'Sellers overwhelmed prior demand and drove close below open',
        biasScore: -14,
      };
    }
  }

  if (bodyRatio <= 0.14) {
    if (lowerWickRatio >= 0.55) {
      return {
        pattern: 'Dragonfly / Bullish Pin Bar',
        psychology: 'Strong lower-wick demand rejection off session lows',
        biasScore: 10,
      };
    }
    if (upperWickRatio >= 0.55) {
      return {
        pattern: 'Gravestone / Bearish Pin Bar',
        psychology: 'Sharp upper-wick supply rejection off highs',
        biasScore: -10,
      };
    }
    return {
      pattern: 'Doji / Indecision',
      psychology: 'Buyer and seller equilibrium — awaiting breakout confirmation',
      biasScore: 0,
    };
  }

  if (lowerWickRatio >= 0.5 && upperWickRatio <= 0.2) {
    return {
      pattern: body >= 0 ? 'Bullish Hammer' : 'Lower Rejection Pin',
      psychology: 'Buyers defended lows forcefully leaving a long lower shadow',
      biasScore: 11,
    };
  }

  if (upperWickRatio >= 0.5 && lowerWickRatio <= 0.2) {
    return {
      pattern: body <= 0 ? 'Shooting Star' : 'Upper Rejection Wick',
      psychology: 'Sellers rejected higher prices leaving prominent upper supply wick',
      biasScore: -11,
    };
  }

  if (bodyRatio >= 0.72) {
    if (body > 0) {
      return {
        pattern: 'Bullish Marubozu',
        psychology: 'Full-body buyer control from open to close with minimal wicks',
        biasScore: 12,
      };
    }
    return {
      pattern: 'Bearish Marubozu',
      psychology: 'Full-body seller control from open to close with minimal wicks',
      biasScore: -12,
    };
  }

  return body >= 0
    ? {
        pattern: 'Bullish Impulse Bar',
        psychology: 'Net positive close with moderate buyer follow-through',
        biasScore: 5,
      }
    : {
        pattern: 'Bearish Impulse Bar',
        psychology: 'Net negative close with moderate seller follow-through',
        biasScore: -5,
      };
}

export function analyzeSmcAndPriceAction(
  candles: Candle[],
  precision: number = 5,
): SmcAnalysis {
  const windowCandles = [...candles]
    .sort((a, b) => a.openTime - b.openTime)
    .slice(-60);

  if (windowCandles.length < 6) {
    const p = windowCandles[windowCandles.length - 1]?.close ?? 0;
    const noneZone: ZoneRange = { type: 'NONE', low: p, high: p, label: 'None detected' };
    return {
      smcBias: 'NEUTRAL',
      marketStructure: 'RANGING',
      bos: 'NONE',
      choch: 'NONE',
      orderBlock: noneZone,
      fvg: noneZone,
      liquiditySweep: 'NONE',
      ema9: p,
      ema21: p,
      ema50: p,
      ema9_21_50Alignment: 'MIXED',
      candlestickPattern: 'Insufficient Bars',
      candlePsychology: 'Awaiting minimum candle history',
      rejectionBreakout: 'Unconfirmed',
      priceActionContext: 'Insufficient candles for SMC structure mapping',
      volumeStatus: 'UNAVAILABLE',
      smcScore: 0,
      smcFactors: ['Awaiting minimum candle history for SMC mapping'],
    };
  }

  const closes = windowCandles.map((c) => c.close);
  const ema9Arr = computeEmaSeries(closes, 9);
  const ema21Arr = computeEmaSeries(closes, 21);
  const ema50Arr = computeEmaSeries(closes, 50);
  const ema9 = ema9Arr[ema9Arr.length - 1];
  const ema21 = ema21Arr[ema21Arr.length - 1];
  const ema50 = ema50Arr[ema50Arr.length - 1];
  const latest = windowCandles[windowCandles.length - 1];
  const prev = windowCandles[windowCandles.length - 2];

  let ema9_21_50Alignment: 'BULLISH' | 'BEARISH' | 'MIXED' = 'MIXED';
  if (latest.close > ema9 && ema9 > ema21 && ema21 >= ema50) {
    ema9_21_50Alignment = 'BULLISH';
  } else if (latest.close < ema9 && ema9 < ema21 && ema21 <= ema50) {
    ema9_21_50Alignment = 'BEARISH';
  }

  // Genuine Volume Check (never invent fake volume)
  const hasRealVolume = windowCandles.slice(-10).some((c) => Number(c.volume) > 0);
  const volumeStatus = hasRealVolume ? 'GENUINE_VOLUME' : 'UNAVAILABLE';

  // Swing Structure (Market Structure, BOS, CHOCH, Liquidity Sweeps)
  const { highs, lows } = detectSwings(windowCandles, 2);
  let marketStructure: 'BULLISH_HH_HL' | 'BEARISH_LH_LL' | 'RANGING' = 'RANGING';
  if (highs.length >= 2 && lows.length >= 2) {
    const h1 = highs[highs.length - 2].price;
    const h2 = highs[highs.length - 1].price;
    const l1 = lows[lows.length - 2].price;
    const l2 = lows[lows.length - 1].price;
    if (h2 > h1 && l2 >= l1) {
      marketStructure = 'BULLISH_HH_HL';
    } else if (h2 <= h1 && l2 < l1) {
      marketStructure = 'BEARISH_LH_LL';
    }
  }

  const lastSwingHigh = highs.length > 0 ? highs[highs.length - 1] : null;
  const lastSwingLow = lows.length > 0 ? lows[lows.length - 1] : null;

  let bos: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';
  let choch: 'BULLISH' | 'BEARISH' | 'NONE' = 'NONE';

  if (lastSwingHigh && latest.close > lastSwingHigh.price) {
    if (marketStructure === 'BEARISH_LH_LL') {
      choch = 'BULLISH';
    } else {
      bos = 'BULLISH';
    }
  } else if (lastSwingLow && latest.close < lastSwingLow.price) {
    if (marketStructure === 'BULLISH_HH_HL') {
      choch = 'BEARISH';
    } else {
      bos = 'BEARISH';
    }
  }

  // Liquidity Sweep (wick pierces prior swing level then closes back inside)
  let liquiditySweep: 'BUY_SIDE_SWEEP' | 'SELL_SIDE_SWEEP' | 'NONE' = 'NONE';
  if (lastSwingHigh && latest.high > lastSwingHigh.price && latest.close < lastSwingHigh.price) {
    liquiditySweep = 'BUY_SIDE_SWEEP'; // Bearish reversal sweep above highs
  } else if (lastSwingLow && latest.low < lastSwingLow.price && latest.close > lastSwingLow.price) {
    liquiditySweep = 'SELL_SIDE_SWEEP'; // Bullish reversal sweep below lows
  }

  // Fair Value Gap (3-candle imbalance in last 10 bars)
  let fvg: ZoneRange = { type: 'NONE', low: latest.close, high: latest.close, label: 'No active FVG' };
  for (let i = windowCandles.length - 1; i >= Math.max(2, windowCandles.length - 10); i--) {
    const c0 = windowCandles[i - 2];
    const c2 = windowCandles[i];
    if (c2.low > c0.high) {
      fvg = {
        type: 'BULLISH',
        low: Number(c0.high.toFixed(precision)),
        high: Number(c2.low.toFixed(precision)),
        label: `Bullish FVG ${c0.high.toFixed(precision)}–${c2.low.toFixed(precision)}`,
      };
      break;
    }
    if (c2.high < c0.low) {
      fvg = {
        type: 'BEARISH',
        low: Number(c2.high.toFixed(precision)),
        high: Number(c0.low.toFixed(precision)),
        label: `Bearish FVG ${c2.high.toFixed(precision)}–${c0.low.toFixed(precision)}`,
      };
      break;
    }
  }

  // Order Block (last opposite candle before impulsive move in last 14 bars)
  let orderBlock: ZoneRange = {
    type: 'NONE',
    low: latest.close,
    high: latest.close,
    label: 'No active OB',
  };
  for (let i = windowCandles.length - 2; i >= Math.max(1, windowCandles.length - 14); i--) {
    const obCandle = windowCandles[i - 1];
    const moveCandle = windowCandles[i];
    const moveBody = moveCandle.close - moveCandle.open;
    const obBody = obCandle.close - obCandle.open;
    const moveRange = Math.max(moveCandle.high - moveCandle.low, 1e-10);
    if (obBody < 0 && moveBody > 0 && Math.abs(moveBody) / moveRange >= 0.55) {
      orderBlock = {
        type: 'BULLISH',
        low: Number(obCandle.low.toFixed(precision)),
        high: Number(obCandle.high.toFixed(precision)),
        label: `Bullish OB ${obCandle.low.toFixed(precision)}–${obCandle.high.toFixed(precision)}`,
      };
      break;
    }
    if (obBody > 0 && moveBody < 0 && Math.abs(moveBody) / moveRange >= 0.55) {
      orderBlock = {
        type: 'BEARISH',
        low: Number(obCandle.low.toFixed(precision)),
        high: Number(obCandle.high.toFixed(precision)),
        label: `Bearish OB ${obCandle.low.toFixed(precision)}–${obCandle.high.toFixed(precision)}`,
      };
      break;
    }
  }

  // Candlestick pattern & psychology
  const candleRead = classifyCandlestick(latest, prev);

  // Rejection / Breakout confirmation
  let rejectionBreakout = 'Range Consolidation';
  if (bos === 'BULLISH' || choch === 'BULLISH') {
    rejectionBreakout = 'Bullish Structure Breakout Confirmed';
  } else if (bos === 'BEARISH' || choch === 'BEARISH') {
    rejectionBreakout = 'Bearish Structure Breakdown Confirmed';
  } else if (liquiditySweep === 'SELL_SIDE_SWEEP') {
    rejectionBreakout = 'Sell-Side Liquidity Sweep + Support Rejection';
  } else if (liquiditySweep === 'BUY_SIDE_SWEEP') {
    rejectionBreakout = 'Buy-Side Liquidity Sweep + Resistance Rejection';
  } else if (candleRead.biasScore >= 10) {
    rejectionBreakout = 'Bullish Candle Rejection Confirmed';
  } else if (candleRead.biasScore <= -10) {
    rejectionBreakout = 'Bearish Candle Rejection Confirmed';
  }

  // Composite SMC Score (-50 to +50)
  let smcScore = 0;
  const smcFactors: string[] = [];

  if (ema9_21_50Alignment === 'BULLISH') {
    smcScore += 12;
    smcFactors.push('EMA 9 > 21 > 50 bullish stack');
  } else if (ema9_21_50Alignment === 'BEARISH') {
    smcScore -= 12;
    smcFactors.push('EMA 9 < 21 < 50 bearish stack');
  }

  if (marketStructure === 'BULLISH_HH_HL') {
    smcScore += 10;
    smcFactors.push('Market Structure: Bullish HH/HL');
  } else if (marketStructure === 'BEARISH_LH_LL') {
    smcScore -= 10;
    smcFactors.push('Market Structure: Bearish LH/LL');
  }

  if (bos === 'BULLISH') {
    smcScore += 10;
    smcFactors.push('Bullish Break of Structure (BOS)');
  } else if (bos === 'BEARISH') {
    smcScore -= 10;
    smcFactors.push('Bearish Break of Structure (BOS)');
  }

  if (choch === 'BULLISH') {
    smcScore += 11;
    smcFactors.push('Bullish Change of Character (CHOCH)');
  } else if (choch === 'BEARISH') {
    smcScore -= 11;
    smcFactors.push('Bearish Change of Character (CHOCH)');
  }

  if (liquiditySweep === 'SELL_SIDE_SWEEP') {
    smcScore += 10;
    smcFactors.push('Sell-side liquidity sweep reversal');
  } else if (liquiditySweep === 'BUY_SIDE_SWEEP') {
    smcScore -= 10;
    smcFactors.push('Buy-side liquidity sweep rejection');
  }

  if (fvg.type === 'BULLISH') {
    smcScore += 6;
    smcFactors.push(fvg.label);
  } else if (fvg.type === 'BEARISH') {
    smcScore -= 6;
    smcFactors.push(fvg.label);
  }

  if (orderBlock.type === 'BULLISH' && latest.close >= orderBlock.low) {
    smcScore += 6;
    smcFactors.push(orderBlock.label);
  } else if (orderBlock.type === 'BEARISH' && latest.close <= orderBlock.high) {
    smcScore -= 6;
    smcFactors.push(orderBlock.label);
  }

  smcScore += candleRead.biasScore;
  smcScore = Math.max(-50, Math.min(50, smcScore));

  let smcBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
  if (smcScore >= 12) smcBias = 'BULLISH';
  else if (smcScore <= -12) smcBias = 'BEARISH';

  const priceActionContext = `${marketStructure.replace(/_/g, ' ')} · ${candleRead.pattern} · ${rejectionBreakout}`;

  return {
    smcBias,
    marketStructure,
    bos,
    choch,
    orderBlock,
    fvg,
    liquiditySweep,
    ema9: Number(ema9.toFixed(precision)),
    ema21: Number(ema21.toFixed(precision)),
    ema50: Number(ema50.toFixed(precision)),
    ema9_21_50Alignment,
    candlestickPattern: candleRead.pattern,
    candlePsychology: candleRead.psychology,
    rejectionBreakout,
    priceActionContext,
    volumeStatus,
    smcScore,
    smcFactors: smcFactors.slice(0, 5),
  };
}
