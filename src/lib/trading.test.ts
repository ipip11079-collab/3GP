import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aggregateCandlesFrom1s,
  aggregateCandlesFromTicks,
  analyzeMarketStructure,
  calculateBollingerBands,
  calculateEMA,
  calculateMACD,
  calculateRSI,
  calculateSMA,
  calculateStochRSI,
  computeBroaderMultiTimeframeSentiment,
  summarizeOrderbook,
} from './indicators.ts';
import {
  applyConfidenceGate,
  computeOverallAccuracyReport,
  evaluatePredictionOutcome,
} from './accuracy.ts';
import { TRADING_PAIRS } from './pairs.ts';
import { evaluate1mCloseStrategy } from './strategy1m.ts';
import type { Candle, RecordedPrediction } from '../types/trading.ts';

test('aggregateCandlesFrom1s groups 1s candles into 5s buckets accurately', () => {
  const base = 1700000000000; // aligned to 10s & 5s
  const source: Candle[] = [
    { openTime: base, closeTime: base + 999, open: 100, high: 102, low: 99, close: 101, volume: 10, buyVolume: 6, sellVolume: 4 },
    { openTime: base + 1000, closeTime: base + 1999, open: 101, high: 105, low: 100, close: 104, volume: 15, buyVolume: 10, sellVolume: 5 },
    { openTime: base + 5000, closeTime: base + 5999, open: 104, high: 104, low: 101, close: 102, volume: 8, buyVolume: 2, sellVolume: 6 },
  ];

  const aggregated = aggregateCandlesFrom1s(source, '5s', base + 10000);
  assert.equal(aggregated.length, 2);
  assert.equal(aggregated[0].open, 100);
  assert.equal(aggregated[0].high, 105);
  assert.equal(aggregated[0].low, 99);
  assert.equal(aggregated[0].close, 104);
  assert.equal(aggregated[0].volume, 25);
  assert.equal(aggregated[1].open, 104);
  assert.equal(aggregated[1].close, 102);
});

test('aggregateCandlesFromTicks builds 10s candles from raw trades', () => {
  const base = 1700000000000;
  const ticks = [
    { price: 1.1, volume: 100, timestampMs: base + 500, side: 'b' as const },
    { price: 1.102, volume: 200, timestampMs: base + 3000, side: 'b' as const },
    { price: 1.099, volume: 150, timestampMs: base + 12000, side: 's' as const },
  ];

  const candles = aggregateCandlesFromTicks(ticks, '10s', base + 15000);
  assert.equal(candles.length, 2);
  assert.equal(candles[0].open, 1.1);
  assert.equal(candles[0].high, 1.102);
  assert.equal(candles[0].buyVolume, 300);
  assert.equal(candles[1].close, 1.099);
  assert.equal(candles[1].sellVolume, 150);
});

test('calculateEMA and calculateRSI reflect uptrend correctly', () => {
  const uptrend = Array.from({ length: 25 }, (_, i) => 100 + i * 0.5);
  const ema5 = calculateEMA(uptrend, 5);
  const ema21 = calculateEMA(uptrend, 21);
  assert.ok(ema5[ema5.length - 1] > ema21[ema21.length - 1]);
  const rsi = calculateRSI(uptrend, 14);
  assert.equal(rsi, 100);
});

test('analyzeMarketStructure rejects stale or insufficient data', () => {
  const now = 1700001000000;
  const staleCandles: Candle[] = Array.from({ length: 15 }, (_, i) => ({
    openTime: now - 1000000 + i * 60000,
    closeTime: now - 1000000 + i * 60000 + 59999,
    open: 1.1,
    high: 1.101,
    low: 1.099,
    close: 1.1 + i * 0.0001,
    volume: 100,
  }));

  const res = analyzeMarketStructure(staleCandles, '1m', null, now + 600000);
  assert.equal(res.dataSufficient, false);
  assert.equal(res.quantitativeConfidence, 0);
});

test('analyzeMarketStructure detects strong bullish confluence with orderbook support', () => {
  const now = 1700000000000;
  const candles: Candle[] = Array.from({ length: 30 }, (_, i) => {
    const open = 100 + i * 0.4;
    const close = open + 0.35;
    return {
      openTime: now - (30 - i) * 60000,
      closeTime: now - (30 - i) * 60000 + 59999,
      open,
      high: close + 0.05,
      low: open - 0.02,
      close,
      volume: 100 + i * 5,
      buyVolume: 85 + i * 4,
      sellVolume: 15 + i,
      tradeCount: 25,
    };
  });

  const book = summarizeOrderbook(
    [[111.9, 500], [111.8, 300]],
    [[112.0, 80], [112.1, 60]],
  );

  const analysis = analyzeMarketStructure(candles, '1m', book, now);
  assert.equal(analysis.dataSufficient, true);
  assert.equal(analysis.emaAlignment, 'BULLISH');
  assert.ok(analysis.bullishProbability > analysis.bearishProbability);
});

test('applyConfidenceGate rejects weak signals and insufficient data', () => {
  const weak = applyConfidenceGate('UP', 54, true, 58);
  assert.equal(weak.direction, 'NO_TRADE');

  const noData = applyConfidenceGate('DOWN', 85, false, 58);
  assert.equal(noData.direction, 'NO_TRADE');
  assert.equal(noData.confidence, 0);

  const valid = applyConfidenceGate('DOWN', 74.6, true, 58);
  assert.equal(valid.direction, 'DOWN');
  assert.equal(valid.confidence, 75);
});

test('evaluatePredictionOutcome and computeOverallAccuracyReport calculate verified per-timeframe metrics', () => {
  assert.equal(evaluatePredictionOutcome('UP', 1.1, 1.1005), 'CORRECT');
  assert.equal(evaluatePredictionOutcome('UP', 1.1, 1.0995), 'FALSE');
  assert.equal(evaluatePredictionOutcome('DOWN', 1.1, 1.0995), 'CORRECT');
  assert.equal(evaluatePredictionOutcome('DOWN', 1.1, 1.1), 'DRAW');

  const records: RecordedPrediction[] = [
    {
      id: '1', market: 'OTC', pairId: 'BTC-USD', pairSymbol: 'BTC/USD', timeframe: '5s',
      predictedDirection: 'UP', confidence: 72, entryPrice: 65000, precision: 2,
      candleOpenTime: 1000, expiryTime: 6000, createdAt: 900, feedSource: 'Binance',
      outcome: 'CORRECT', actualClosePrice: 65010, settledAt: 6100,
    },
    {
      id: '2', market: 'OTC', pairId: 'BTC-USD', pairSymbol: 'BTC/USD', timeframe: '5s',
      predictedDirection: 'DOWN', confidence: 68, entryPrice: 65010, precision: 2,
      candleOpenTime: 6000, expiryTime: 11000, createdAt: 5900, feedSource: 'Binance',
      outcome: 'FALSE', actualClosePrice: 65020, settledAt: 11100,
    },
    {
      id: '3', market: 'LIVE', pairId: 'EUR-USD', pairSymbol: 'EUR/USD', timeframe: '1m',
      predictedDirection: 'UP', confidence: 76, entryPrice: 1.1, precision: 5,
      candleOpenTime: 60000, expiryTime: 120000, createdAt: 59000, feedSource: 'Kraken',
      outcome: 'PENDING', actualClosePrice: null, settledAt: null,
    },
  ];

  const report = computeOverallAccuracyReport(records, 58);
  assert.equal(report.byTimeframe['5s'].correct, 1);
  assert.equal(report.byTimeframe['5s'].falseCount, 1);
  assert.equal(report.byTimeframe['5s'].accuracyPct, 50);
  assert.equal(report.byTimeframe['5s'].sampleReliable, false);
  assert.equal(report.byTimeframe['10s'].accuracyPct, null);
  assert.equal(report.byTimeframe['1m'].pending, 1);
  assert.equal(report.byTimeframe['1m'].accuracyPct, null);
  assert.equal(report.overallAccuracyPct, 50);
});

test('MACD, Bollinger Bands, and StochRSI compute valid multi-factor telemetry', () => {
  const series = Array.from({ length: 40 }, (_, i) => 100 + Math.sin(i / 4) * 2 + i * 0.25);
  const macd = calculateMACD(series);
  assert.ok(['BULLISH', 'BEARISH', 'NEUTRAL'].includes(macd.bias));

  const bb = calculateBollingerBands(series, 20, 2);
  assert.ok(bb.upper >= bb.middle && bb.middle >= bb.lower);
  assert.ok(bb.percentB >= 0 && bb.percentB <= 1);

  const stoch = calculateStochRSI(series, 14);
  assert.ok(stoch >= 0 && stoch <= 100);
});

test('TRADING_PAIRS covers FX, COMMODITY, and CRYPTO currencies cleanly', () => {
  const categories = new Set(TRADING_PAIRS.map((p) => p.category));
  assert.ok(categories.has('FX'));
  assert.ok(categories.has('CRYPTO'));
  assert.ok(categories.has('COMMODITY'));
  assert.ok(TRADING_PAIRS.length >= 35);
});

test('evaluate1mCloseStrategy predicts UP on strong bullish 1m close breakout', () => {
  const now = 1700000100000;
  const currentMinute = Math.floor(now / 60_000) * 60_000;
  const candles: Candle[] = Array.from({ length: 28 }, (_, i) => {
    const openTime = currentMinute - (28 - i) * 60_000;
    const open = 100 + i * 0.2;
    const close = open + 0.16;
    return {
      openTime,
      closeTime: openTime + 59_999,
      open,
      high: close + 0.03,
      low: open - 0.02,
      close,
      volume: 120 + i * 3,
      buyVolume: 90 + i * 2,
      sellVolume: 30 + i,
      tradeCount: 20,
    };
  });
  // Add still-forming current minute bar that should be excluded when evaluating closed bar
  candles.push({
    openTime: currentMinute,
    closeTime: currentMinute + 59_999,
    open: 105.5,
    high: 105.6,
    low: 105.1,
    close: 105.2,
    volume: 10,
  });

  const book = summarizeOrderbook([[105.5, 400]], [[105.6, 100]]);
  const res = evaluate1mCloseStrategy(candles, book, now);
  assert.equal(res.direction, 'UP');
  assert.ok(res.confidence >= 58 && res.confidence <= 90);
  assert.equal(res.closedCandleOpenTime, currentMinute - 60_000);
  assert.equal(res.nextCandleOpenTime, currentMinute + 60_000);
});

test('evaluate1mCloseStrategy predicts DOWN on bearish 1m engulfing breakdown', () => {
  const now = 1700000100000;
  const currentMinute = Math.floor(now / 60_000) * 60_000;
  const candles: Candle[] = Array.from({ length: 28 }, (_, i) => {
    const openTime = currentMinute - (28 - i) * 60_000;
    const open = 120 - i * 0.2;
    const close = open - 0.16;
    return {
      openTime,
      closeTime: openTime + 59_999,
      open,
      high: open + 0.02,
      low: close - 0.03,
      close,
      volume: 120 + i * 2,
      buyVolume: 30,
      sellVolume: 90,
      tradeCount: 18,
    };
  });

  const book = summarizeOrderbook([[114.4, 80]], [[114.5, 420]]);
  const res = evaluate1mCloseStrategy(candles, book, now);
  assert.equal(res.direction, 'DOWN');
  assert.ok(res.confidence >= 58);
});

test('evaluate1mCloseStrategy rejects stale/insufficient 1m data with NO_TRADE', () => {
  const now = 1700000100000;
  const res = evaluate1mCloseStrategy([], null, now);
  assert.equal(res.direction, 'NO_TRADE');
  assert.equal(res.confidence, 0);
});

test('computeBroaderMultiTimeframeSentiment computes 5m SMA(20/50) crossover and broader RSI sentiment', () => {
  const now = 1700000000000;
  const makeBars = (count: number, step: number, base: number, stepMs: number): Candle[] =>
    Array.from({ length: count }, (_, i) => {
      const c = base + i * step;
      return {
        openTime: now - (count - i) * stepMs,
        closeTime: now - (count - i) * stepMs + stepMs - 1,
        open: c - step * 0.5,
        high: c + Math.abs(step) * 0.2,
        low: c - Math.abs(step),
        close: c,
        volume: 100,
      };
    });

  const smaVal = calculateSMA([10, 20, 30, 40], 2);
  assert.equal(smaVal, 35);

  const bullContext = computeBroaderMultiTimeframeSentiment({
    candles1m: makeBars(30, 0.2, 100, 60_000),
    candles5m: makeBars(55, 0.5, 100, 300_000),
    candles15m: makeBars(30, 0.8, 100, 900_000),
  });
  assert.ok(bullContext !== null);
  assert.equal(bullContext.smaCrossover, 'GOLDEN_BULL');
  assert.equal(bullContext.broader5mTrend, 'BULLISH');
  assert.equal(bullContext.broaderSentiment, 'STRONG_BULLISH');

  const bearContext = computeBroaderMultiTimeframeSentiment({
    candles1m: makeBars(30, -0.2, 130, 60_000),
    candles5m: makeBars(55, -0.5, 130, 300_000),
    candles15m: makeBars(30, -0.8, 130, 900_000),
  });
  assert.ok(bearContext !== null);
  assert.equal(bearContext.smaCrossover, 'DEATH_BEAR');
  assert.equal(bearContext.broader5mTrend, 'BEARISH');
  assert.equal(bearContext.broaderSentiment, 'STRONG_BEARISH');
});

import { analyzeSmcAndPriceAction } from './smc.ts';
import { computeLearningProfile } from './learning.ts';
import {
  calculateDemoPayoutMetrics,
  evaluateQuotexReadinessSummary,
  settleDemoTradeOutcome,
  shouldTriggerBotAutoTrade,
  validateDemoStake,
} from './risk.ts';

test('analyzeSmcAndPriceAction computes EMA 9/21/50, BOS, FVG, Candle Pattern & honest volume status', () => {
  const now = 1700000000000;
  // Create candles with zero volume (FX spot simulation) + impulsive upward FVG
  const candles: Candle[] = Array.from({ length: 55 }, (_, i) => {
    const open = 1.1000 + i * 0.0005;
    const close = open + 0.0004;
    return {
      openTime: now - (55 - i) * 60_000,
      closeTime: now - (55 - i) * 60_000 + 59_999,
      open,
      high: close + 0.0001,
      low: open - 0.0001,
      close,
      volume: 0,
    };
  });
  // Inject a strong bullish candle with FVG gap at end
  const prevHigh = candles[candles.length - 2].high;
  candles[candles.length - 1] = {
    openTime: now,
    closeTime: now + 59_999,
    open: prevHigh + 0.001,
    high: prevHigh + 0.004,
    low: prevHigh + 0.0009,
    close: prevHigh + 0.0038,
    volume: 0,
  };

  const smc = analyzeSmcAndPriceAction(candles, 4);
  assert.equal(smc.ema9_21_50Alignment, 'BULLISH');
  assert.ok(smc.ema9 > smc.ema21 && smc.ema21 > smc.ema50);
  assert.equal(smc.volumeStatus, 'UNAVAILABLE');
  assert.equal(smc.fvg.type, 'BULLISH');
  assert.equal(smc.smcBias, 'BULLISH');
});

test('computeLearningProfile identifies strong and weak setups without mutating records', () => {
  const records: RecordedPrediction[] = [
    {
      id: 'l1', market: 'OTC', pairId: 'BTC-USD', pairSymbol: 'BTC/USD', timeframe: '1m',
      predictedDirection: 'UP', confidence: 76, entryPrice: 65000, precision: 2,
      candleOpenTime: 1000, expiryTime: 61000, createdAt: 900, feedSource: 'Binance',
      outcome: 'CORRECT', actualClosePrice: 65050, settledAt: 62000,
      marketCondition: 'TRENDING_UP', indicatorSignature: 'EMA9/21/50:BULLISH|MACD:BULLISH|BOS:BULLISH',
    },
    {
      id: 'l2', market: 'OTC', pairId: 'BTC-USD', pairSymbol: 'BTC/USD', timeframe: '1m',
      predictedDirection: 'UP', confidence: 74, entryPrice: 65050, precision: 2,
      candleOpenTime: 61000, expiryTime: 121000, createdAt: 60900, feedSource: 'Binance',
      outcome: 'CORRECT', actualClosePrice: 65100, settledAt: 122000,
      marketCondition: 'TRENDING_UP', indicatorSignature: 'EMA9/21/50:BULLISH|MACD:BULLISH|BOS:BULLISH',
    },
    {
      id: 'l3', market: 'OTC', pairId: 'EUR-USD', pairSymbol: 'EUR/USD', timeframe: '1m',
      predictedDirection: 'DOWN', confidence: 62, entryPrice: 1.1, precision: 5,
      candleOpenTime: 121000, expiryTime: 181000, createdAt: 120900, feedSource: 'Yahoo',
      outcome: 'FALSE', actualClosePrice: 1.101, settledAt: 182000,
      marketCondition: 'HIGH_VOLATILITY', indicatorSignature: 'EMA9/21/50:MIXED|MACD:NEUTRAL|SMC:NEUTRAL',
    },
    {
      id: 'l4', market: 'OTC', pairId: 'EUR-USD', pairSymbol: 'EUR/USD', timeframe: '1m',
      predictedDirection: 'DOWN', confidence: 60, entryPrice: 1.101, precision: 5,
      candleOpenTime: 181000, expiryTime: 241000, createdAt: 180900, feedSource: 'Yahoo',
      outcome: 'FALSE', actualClosePrice: 1.102, settledAt: 242000,
      marketCondition: 'HIGH_VOLATILITY', indicatorSignature: 'EMA9/21/50:MIXED|MACD:NEUTRAL|SMC:NEUTRAL',
    },
  ];

  const profile = computeLearningProfile(records);
  assert.equal(profile.totalSettled, 4);
  assert.equal(profile.overallWinRatePct, 50);
  assert.ok(profile.strengths.some((s) => s.includes('100% win rate')));
  assert.ok(profile.weaknesses.some((w) => w.includes('0% win rate')));
});

test('demo risk helper enforces balance bounds, warns on martingale doubling, and settles WIN/LOSS', () => {
  const metrics = calculateDemoPayoutMetrics(100, 85);
  assert.equal(metrics.potentialProfit, 85);
  assert.equal(metrics.maxRiskLoss, 100);

  const overBalance = validateDemoStake(500, 200);
  assert.equal(overBalance.valid, false);

  const martingale = validateDemoStake(200, 1000, 100, true);
  assert.equal(martingale.valid, true);
  assert.ok(martingale.martingaleWarning?.includes('Anti-Martingale'));

  const settledWin = settleDemoTradeOutcome(
    {
      id: 't1', pairId: 'BTC-USD', pairSymbol: 'BTC/USD', market: 'OTC', timeframe: '1m',
      direction: 'UP', stake: 100, payoutPct: 85, entryPrice: 65000, precision: 2,
      candleOpenTime: 1000, expiryTime: 61000, outcome: 'PENDING', pnl: 0,
      closePrice: null, createdAt: 900, settledAt: null,
    },
    65025,
  );
  assert.equal(settledWin.outcome, 'WIN');
  assert.equal(settledWin.pnl, 85);
  assert.equal(settledWin.totalCredit, 185);
});

test('evaluateQuotexReadinessSummary and shouldTriggerBotAutoTrade validate readiness and deduplication', () => {
  const partial = evaluateQuotexReadinessSummary({
    fullName: 'Sam Khan',
    gmailEmail: 'ipip11079@gmail.com',
    country: 'Pakistan',
    accountCurrency: 'USD',
    idDocumentReady: true,
    addressProofReady: false,
    gmailVerified: true,
  });
  assert.equal(partial.completedSteps, 6);
  assert.equal(partial.totalSteps, 7);
  assert.equal(partial.readyToOpenQuotex, false);

  const ready = evaluateQuotexReadinessSummary({
    fullName: 'Sam Khan',
    gmailEmail: 'ipip11079@gmail.com',
    country: 'Pakistan',
    accountCurrency: 'USD',
    idDocumentReady: true,
    addressProofReady: true,
    gmailVerified: true,
  });
  assert.equal(ready.pct, 100);
  assert.equal(ready.readyToOpenQuotex, true);

  assert.equal(
    shouldTriggerBotAutoTrade({
      autoTradingEnabled: true,
      tradingSessionActive: true,
      emergencyStopped: false,
      direction: 'UP',
      confidence: 72,
      confidenceThreshold: 58,
      candleKey: 'OTC:BTC-USD:1m:1700000100000',
      alreadyTradedKey: null,
    }),
    true,
  );

  assert.equal(
    shouldTriggerBotAutoTrade({
      autoTradingEnabled: true,
      tradingSessionActive: true,
      emergencyStopped: false,
      direction: 'NO_TRADE',
      confidence: 80,
      confidenceThreshold: 58,
      candleKey: 'OTC:BTC-USD:1m:1700000100000',
      alreadyTradedKey: null,
    }),
    false,
  );

  assert.equal(
    shouldTriggerBotAutoTrade({
      autoTradingEnabled: true,
      tradingSessionActive: true,
      emergencyStopped: false,
      direction: 'DOWN',
      confidence: 74,
      confidenceThreshold: 58,
      candleKey: 'OTC:BTC-USD:1m:1700000100000',
      alreadyTradedKey: 'OTC:BTC-USD:1m:1700000100000',
    }),
    false,
  );
});

import {
  computeFrameDiffRatio,
  normalizeQuotexVisionResponse,
  resolveVisionSafetyGate,
  shouldAnalyzeNewFrame,
} from './quotexVision.ts';
import {
  buildQuotexVisionPairSpeech,
  buildQuotexVisionSignalSpeech,
} from '../utils/voiceAssistant.ts';

test('Quotex Vision safety gate forces NO_CLEAR_SIGNAL when chart unreadable or confidence too low', () => {
  const unreadable = normalizeQuotexVisionResponse({
    isQuotexChartReadable: false,
    detectedAccountMode: 'DEMO',
    detectedPair: 'USD/INR',
    detectedTimeframe: '1m',
    direction: 'UP',
    confidence: 88,
    recommendation: 'TRADE',
  });
  assert.equal(unreadable.isQuotexChartReadable, false);
  assert.equal(unreadable.detectedPair, 'UNKNOWN');
  assert.equal(unreadable.direction, 'NO_CLEAR_SIGNAL');
  assert.equal(unreadable.confidence, 0);

  const lowConf = resolveVisionSafetyGate({
    isQuotexChartReadable: true,
    direction: 'DOWN',
    confidence: 42,
    recommendation: 'TRADE',
  });
  assert.equal(lowConf.direction, 'NO_CLEAR_SIGNAL');
  assert.equal(lowConf.confidence, 0);

  const valid = normalizeQuotexVisionResponse({
    isQuotexChartReadable: true,
    detectedAccountMode: 'LIVE',
    detectedPair: 'USD/INR',
    detectedTimeframe: '1m',
    direction: 'DOWN',
    confidence: 72,
    recommendation: 'TRADE',
    candleAnalysis: {
      lastCandleDirection: 'BEARISH',
      bodyStrength: 'Strong red engulfing',
      wicksNote: 'Upper rejection wick',
      momentum: 'Bearish acceleration',
      supportResistance: 'Rejected below resistance',
    },
  });
  assert.equal(valid.detectedAccountMode, 'LIVE');
  assert.equal(valid.detectedPair, 'USD/INR');
  assert.equal(valid.direction, 'DOWN');
  assert.equal(valid.confidence, 72);
  assert.ok(valid.spokenSummaryUrdu.includes('Israr Bhai'));
  assert.ok(valid.spokenSummaryUrdu.includes('72%'));
});

test('computeFrameDiffRatio and shouldAnalyzeNewFrame gate frame polling cleanly', () => {
  const frameA = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255]);
  const frameSame = new Uint8ClampedArray([10, 10, 10, 255, 10, 10, 10, 255]);
  const frameChanged = new Uint8ClampedArray([220, 220, 220, 255, 220, 220, 220, 255]);

  assert.equal(computeFrameDiffRatio(frameA, frameSame), 0);
  assert.ok(computeFrameDiffRatio(frameA, frameChanged) > 0.7);

  assert.equal(
    shouldAnalyzeNewFrame({
      emergencyStopped: true,
      isSharing: true,
      isAnalyzing: false,
      diffRatio: 0.5,
      msSinceLastAnalyze: 5000,
    }),
    false,
  );

  assert.equal(
    shouldAnalyzeNewFrame({
      emergencyStopped: false,
      isSharing: true,
      isAnalyzing: false,
      diffRatio: 0.2,
      msSinceLastAnalyze: 4000,
    }),
    true,
  );
});

test('Quotex Vision voice builders address Israr Bhai naturally in Urdu, Hindi, and English', () => {
  const urPair = buildQuotexVisionPairSpeech('USD/INR', 'DEMO', 'ur');
  assert.ok(urPair.includes('Israr Bhai'));
  assert.ok(urPair.includes('USD/INR'));

  const hiPair = buildQuotexVisionPairSpeech('EUR/USD (OTC)', 'LIVE', 'hi');
  assert.ok(hiPair.includes('इसरार भाई'));

  const signal = normalizeQuotexVisionResponse({
    isQuotexChartReadable: true,
    detectedAccountMode: 'DEMO',
    detectedPair: 'USD/INR',
    detectedTimeframe: '1m',
    direction: 'DOWN',
    confidence: 72,
    recommendation: 'TRADE',
  });
  const spokenUr = buildQuotexVisionSignalSpeech(signal, 'ur');
  assert.ok(spokenUr.includes('DOWN'));
  assert.ok(spokenUr.includes('72%'));
});



