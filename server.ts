import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import {
  applyConfidenceGate,
  computeOverallAccuracyReport,
  evaluatePredictionOutcome,
} from './src/lib/accuracy.ts';
import { analyzeMarketStructure } from './src/lib/indicators.ts';
import { computeLearningProfile, extractIndicatorSignature } from './src/lib/learning.ts';
import {
  getPairById,
  getPairsForMarket,
  getTimeframeSeconds,
  TIMEFRAMES,
} from './src/lib/pairs.ts';
import { settleDemoTradeOutcome, validateDemoStake } from './src/lib/risk.ts';
import { analyzeSmcAndPriceAction } from './src/lib/smc.ts';
import type {
  AccountsSnapshot,
  AssistantLanguage,
  AutoBoardResponse,
  DemoTradeRecord,
  GmailQuotexMessage,
  GmailQuotexVerification,
  LiveMonitorTick,
  MarketMode,
  PredictionResult,
  RecordedPrediction,
  Timeframe,
} from './src/types/trading.ts';
import {
  answerMultilingualAssistantQuestion,
  generateAiCandlePrediction,
  generateAutoBoard1mSignals,
} from './server/aiPredictor.ts';
import { analyzeQuotexScreenFrame } from './server/quotexVision.ts';
import {
  claimOwnerPasscode,
  findDuplicateDemoTradeForCandle,
  findDuplicatePredictionForCandle,
  getDemoAccount,
  getOwnerSettings,
  getQuotexReadiness,
  isOwnerClaimed,
  issueOwnerToken,
  listDemoTrades,
  placeDemoTradeInDb,
  resetDemoAccountInDb,
  saveQuotexReadiness,
  setEmergencyStopState,
  setRuntimeWorkspaceModes,
  settleDemoTradeInDb,
  updateOwnerSettings,
  verifyOwnerPasscode,
  verifyOwnerToken,
} from './server/db.ts';
import {
  fetchActualCloseForExpiry,
  fetchAutoBoard1mCandidates,
  fetchLiveMarketBundle,
  fetchMarketScreener,
  fetchMultiTimeframeContext,
} from './server/marketData.ts';
import {
  appendPrediction,
  clearPredictions,
  loadPredictions,
  savePredictions,
} from './server/store.ts';

const PORT = 3000;

async function settleExpiredPredictions(): Promise<RecordedPrediction[]> {
  const records = loadPredictions();
  const now = Date.now();
  let changed = false;

  for (const rec of records) {
    if (rec.outcome === 'PENDING' && now >= rec.expiryTime + 1500) {
      const pair = getPairById(rec.pairId);
      if (!pair) continue;

      const actualClose = await fetchActualCloseForExpiry(
        pair,
        rec.timeframe,
        rec.candleOpenTime,
        rec.expiryTime,
      );

      if (actualClose !== null) {
        rec.actualClosePrice = Number(actualClose.toFixed(pair.precision));
        rec.outcome = evaluatePredictionOutcome(
          rec.predictedDirection,
          rec.entryPrice,
          rec.actualClosePrice,
        );
        rec.settledAt = Date.now();
        changed = true;
      }
    }
  }

  if (changed) {
    savePredictions(records);
  }
  return loadPredictions();
}

async function settleExpiredDemoTrades(): Promise<void> {
  const trades = listDemoTrades(40);
  const now = Date.now();
  for (const t of trades) {
    if (t.outcome === 'PENDING' && now >= t.expiryTime + 1500) {
      const pair = getPairById(t.pairId);
      if (!pair) continue;
      const actualClose = await fetchActualCloseForExpiry(
        pair,
        t.timeframe,
        t.candleOpenTime,
        t.expiryTime,
      );
      if (actualClose !== null) {
        const roundedClose = Number(actualClose.toFixed(pair.precision));
        const res = settleDemoTradeOutcome(t, roundedClose);
        settleDemoTradeInDb({
          id: t.id,
          outcome: res.outcome,
          pnl: res.pnl,
          totalCredit: res.totalCredit,
          closePrice: roundedClose,
          settledAt: Date.now(),
        });
      }
    }
  }
}

function isValidMarket(val: unknown): val is MarketMode {
  return val === 'LIVE' || val === 'OTC';
}

function isValidTimeframe(val: unknown): val is Timeframe {
  return TIMEFRAMES.some((t) => t.value === val);
}

function isValidLanguage(val: unknown): val is AssistantLanguage {
  return val === 'en' || val === 'ur' || val === 'hi';
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '6mb' }));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, timestamp: Date.now() });
  });

  // ── Owner Settings & Lock ────────────────────────────────────────────────
  app.get('/api/settings', (_req, res) => {
    res.json({ settings: getOwnerSettings() });
  });

  app.post('/api/settings/claim-owner', (req, res) => {
    const passcode = String(req.body?.passcode ?? '');
    const result = claimOwnerPasscode(passcode);
    if (!result.ok) {
      res.status(400).json({ error: result.error ?? 'Failed to claim owner lock.' });
      return;
    }
    const { token, expiresAt } = issueOwnerToken();
    res.json({
      settings: getOwnerSettings(),
      token,
      expiresAt,
    });
  });

  app.post('/api/settings/unlock', (req, res) => {
    if (!isOwnerClaimed()) {
      res.status(400).json({ error: 'Owner lock has not been initialized yet.' });
      return;
    }
    const passcode = String(req.body?.passcode ?? '');
    if (!verifyOwnerPasscode(passcode)) {
      res.status(403).json({ error: 'Invalid owner passcode.' });
      return;
    }
    const { token, expiresAt } = issueOwnerToken();
    res.json({
      token,
      expiresAt,
      settings: getOwnerSettings(),
    });
  });

  app.put('/api/settings', (req, res) => {
    const current = getOwnerSettings();
    if (current.ownerLocked && current.lockClaimed) {
      if (!verifyOwnerToken(req.headers.authorization)) {
        res.status(403).json({
          error: 'Owner Settings Lock is active. Unlock with your owner passcode first.',
        });
        return;
      }
    }
    const updated = updateOwnerSettings(req.body ?? {});
    res.json({ settings: updated });
  });

  app.post('/api/settings/emergency-stop', (req, res) => {
    const stopped = Boolean(req.body?.stopped);
    const updated = setEmergencyStopState(stopped);
    res.json({ settings: updated });
  });

  app.post('/api/settings/runtime-modes', (req, res) => {
    const patch: { autoTradingEnabled?: boolean; birthdayTheme?: boolean } = {};
    if (req.body?.autoTradingEnabled !== undefined) {
      patch.autoTradingEnabled = Boolean(req.body.autoTradingEnabled);
    }
    if (req.body?.birthdayTheme !== undefined) {
      patch.birthdayTheme = Boolean(req.body.birthdayTheme);
    }
    const updated = setRuntimeWorkspaceModes(patch);
    res.json({ settings: updated });
  });

  // ── Pairs, Screener & Auto-Board ─────────────────────────────────────────
  app.get('/api/pairs', (req, res) => {
    const market = isValidMarket(req.query.market) ? req.query.market : 'OTC';
    const pairs = getPairsForMarket(market);
    res.json({
      market,
      timeframes: TIMEFRAMES,
      pairs,
      quotexConnected: false,
      feedNote:
        market === 'OTC'
          ? '24/7 Spot Reference Feeds (Kraken / Binance) · Quotex proprietary OTC feed not connected'
          : 'Live Spot & Interbank FX Feeds (Kraken / Binance / Yahoo Finance)',
    });
  });

  app.get('/api/screener', async (req, res) => {
    const market = isValidMarket(req.query.market) ? req.query.market : 'OTC';
    const timeframe = isValidTimeframe(req.query.timeframe)
      ? req.query.timeframe
      : '1m';
    try {
      const rows = await fetchMarketScreener(market, timeframe);
      res.json({
        market,
        timeframe,
        rows,
        updatedAt: Date.now(),
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load live market screener.',
      });
    }
  });

  const autoBoardCache = new Map<
    string,
    { bucketOpenTime: number; payload: AutoBoardResponse }
  >();
  const autoBoardInFlight = new Map<string, Promise<AutoBoardResponse>>();

  app.get('/api/auto-board', async (req, res) => {
    const market = isValidMarket(req.query.market) ? req.query.market : 'OTC';
    const force = req.query.force === '1';
    const now = Date.now();
    const bucketOpenTime = Math.floor(now / 60_000) * 60_000;
    const cached = autoBoardCache.get(market);

    if (!force && cached && cached.bucketOpenTime === bucketOpenTime) {
      res.json(cached.payload);
      return;
    }

    const flightKey = `${market}:${bucketOpenTime}`;
    try {
      let pending = !force ? autoBoardInFlight.get(flightKey) : undefined;
      if (!pending) {
        pending = (async () => {
          const candidates = await fetchAutoBoard1mCandidates(market);
          const signals = await generateAutoBoard1mSignals({ market, candidates });
          const nextCandleOpenTime = bucketOpenTime + 60_000;
          const nextCandleCloseTime = nextCandleOpenTime + 59_999;

          const payload: AutoBoardResponse = {
            market,
            timeframe: '1m',
            candleBucketOpenTime: bucketOpenTime,
            nextCandleOpenTime,
            nextCandleCloseTime,
            generatedAt: Date.now(),
            signals,
          };
          autoBoardCache.set(market, { bucketOpenTime, payload });
          return payload;
        })().finally(() => {
          autoBoardInFlight.delete(flightKey);
        });
        autoBoardInFlight.set(flightKey, pending);
      }

      const payload = await pending;
      res.json(payload);
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to generate 1-minute Auto Signal Board.',
      });
    }
  });

  // ── 1-Second Live Monitor (Non-Finalized Intra-Candle Check) ─────────────
  const monitorCache = new Map<string, { ts: number; data: LiveMonitorTick }>();

  app.get('/api/monitor/1s', async (req, res) => {
    const pairId = String(req.query.pairId ?? 'BTC-USD');
    const timeframe = isValidTimeframe(req.query.timeframe)
      ? req.query.timeframe
      : '1m';
    const market = isValidMarket(req.query.market) ? req.query.market : 'OTC';
    const pair = getPairById(pairId);

    if (!pair) {
      res.status(400).json({ error: `Unsupported currency pair: ${pairId}` });
      return;
    }

    const cacheKey = `${market}:${pair.id}:${timeframe}`;
    const now = Date.now();
    const cached = monitorCache.get(cacheKey);
    const bucketMs = getTimeframeSeconds(timeframe) * 1000;
    const currentCandleOpenTime = Math.floor(now / bucketMs) * bucketMs;
    const currentCandleCloseTime = currentCandleOpenTime + bucketMs - 1;
    const nextCandleOpenTime = currentCandleOpenTime + bucketMs;
    const nextCandleCloseTime = nextCandleOpenTime + bucketMs - 1;

    if (cached && now - cached.ts < 850) {
      const msRemaining = Math.max(0, nextCandleOpenTime - now);
      res.json({
        ...cached.data,
        currentCandleOpenTime,
        currentCandleCloseTime,
        nextCandleOpenTime,
        nextCandleCloseTime,
        msRemaining,
        elapsedPct: Number((((bucketMs - msRemaining) / bucketMs) * 100).toFixed(1)),
      });
      return;
    }

    try {
      const bundle = await fetchLiveMarketBundle(pair, timeframe, market);
      const analysis = analyzeMarketStructure(
        bundle.candles,
        timeframe,
        bundle.orderbook,
        now,
      );
      const latestCandle = bundle.candles[bundle.candles.length - 1] ?? null;
      const msRemaining = Math.max(0, nextCandleOpenTime - now);
      const elapsedPct = Number((((bucketMs - msRemaining) / bucketMs) * 100).toFixed(1));

      const candleRangePct =
        latestCandle && latestCandle.close > 0
          ? ((latestCandle.high - latestCandle.low) / latestCandle.close) * 100
          : 0;
      const suddenVolatility =
        analysis.volatilityPct > 0.35 ||
        (analysis.atrPct > 0 && candleRangePct >= analysis.atrPct * 1.8);

      const tick: LiveMonitorTick = {
        pairId: pair.id,
        symbol: pair.symbol,
        market,
        timeframe,
        precision: pair.precision,
        price: analysis.latestPrice > 0 ? Number(analysis.latestPrice.toFixed(pair.precision)) : null,
        currentCandle: latestCandle,
        currentCandleOpenTime,
        currentCandleCloseTime,
        nextCandleOpenTime,
        nextCandleCloseTime,
        msRemaining,
        elapsedPct,
        candleClosedConfirmed: false, // 1s monitoring observes forming candle; never treated as closed
        liveUpProb: analysis.bullishProbability,
        liveDownProb: analysis.bearishProbability,
        suddenVolatility,
        volatilityNote: suddenVolatility
          ? `Volatility spike (${candleRangePct.toFixed(3)}% bar range vs ${analysis.atrPct.toFixed(3)}% ATR)`
          : `Stable spread · ATR ${analysis.atrPct.toFixed(3)}%`,
        dataStatus: analysis.dataSufficient ? 'CONNECTED' : 'STALE',
        feedSource: bundle.feedSource,
        errorReason: analysis.insufficiencyReason,
        updatedAt: now,
      };

      monitorCache.set(cacheKey, { ts: now, data: tick });
      res.json(tick);
    } catch (err) {
      const msRemaining = Math.max(0, nextCandleOpenTime - now);
      const disconnected: LiveMonitorTick = {
        pairId: pair.id,
        symbol: pair.symbol,
        market,
        timeframe,
        precision: pair.precision,
        price: null,
        currentCandle: null,
        currentCandleOpenTime,
        currentCandleCloseTime,
        nextCandleOpenTime,
        nextCandleCloseTime,
        msRemaining,
        elapsedPct: Number((((bucketMs - msRemaining) / bucketMs) * 100).toFixed(1)),
        candleClosedConfirmed: false,
        liveUpProb: 50,
        liveDownProb: 50,
        suddenVolatility: false,
        volatilityNote: 'Feed connection lost',
        dataStatus: 'DATA_DISCONNECTED',
        feedSource: null,
        errorReason: err instanceof Error ? err.message : 'Live upstream feed disconnected.',
        updatedAt: now,
      };
      res.json(disconnected);
    }
  });

  // ── Market Quote ─────────────────────────────────────────────────────────
  app.get('/api/market/quote', async (req, res) => {
    const pairId = String(req.query.pairId ?? 'BTC-USD');
    const timeframe = isValidTimeframe(req.query.timeframe)
      ? req.query.timeframe
      : '1m';
    const market = isValidMarket(req.query.market) ? req.query.market : 'OTC';

    const pair = getPairById(pairId);
    if (!pair) {
      res.status(400).json({ error: `Unsupported currency pair: ${pairId}` });
      return;
    }

    try {
      const bundle = await fetchLiveMarketBundle(pair, timeframe, market);
      const multiTimeframe = await fetchMultiTimeframeContext(
        pair,
        market,
        timeframe === '1m' ? bundle.candles : undefined,
      );
      const analysis = analyzeMarketStructure(
        bundle.candles,
        timeframe,
        bundle.orderbook,
        Date.now(),
      );
      const smc = analyzeSmcAndPriceAction(bundle.candles, pair.precision);
      const tfSec = getTimeframeSeconds(timeframe);
      const now = Date.now();
      const bucketMs = tfSec * 1000;
      const msUntilClose = Math.max(0, bucketMs - (now % bucketMs));

      res.json({
        pairId: pair.id,
        symbol: pair.symbol,
        market,
        timeframe,
        price: analysis.latestPrice,
        precision: pair.precision,
        candlesAvailable: analysis.candleCount,
        activeCandles: analysis.activeCandleCount,
        dataSufficient: analysis.dataSufficient,
        insufficiencyReason: analysis.insufficiencyReason,
        msUntilClose,
        nextCandleOpenTime: analysis.nextCandleOpenTime,
        nextCandleCloseTime: analysis.nextCandleCloseTime,
        feedSource: bundle.feedSource,
        quotexConnected: bundle.quotexConnected,
        fetchedAt: bundle.fetchedAt,
        candles: bundle.candles.slice(-60),
        chartOverlay: {
          emaFast: analysis.emaFast,
          emaSlow: analysis.emaSlow,
          ema9: smc.ema9,
          ema21: smc.ema21,
          ema50: smc.ema50,
          supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
          resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
          bollingerUpper: analysis.bollingerUpper,
          bollingerLower: analysis.bollingerLower,
        },
        smc,
        multiTimeframe,
        technicalSummary: {
          rsi14: analysis.rsi14,
          stochRsi: analysis.stochRsi,
          emaAlignment: analysis.emaAlignment,
          macdBias: analysis.macdBias,
          bollingerPercentB: analysis.bollingerPercentB,
          marketRegime: analysis.marketRegime,
          volatilityPct: analysis.volatilityPct,
          atrPct: analysis.atrPct,
          supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
          resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
          liquidityBias: analysis.orderbook
            ? analysis.orderbook.imbalanceRatio > 0.08
              ? 'Bid-Dominant'
              : analysis.orderbook.imbalanceRatio < -0.08
                ? 'Ask-Dominant'
                : 'Balanced'
            : 'Unavailable',
          bullishProbability: analysis.bullishProbability,
          bearishProbability: analysis.bearishProbability,
          candlesAnalyzed: analysis.activeCandleCount,
        },
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to retrieve live market quote.',
      });
    }
  });

  // ── Predictions, Verification & Learning ─────────────────────────────────
  app.get('/api/predictions', async (_req, res) => {
    try {
      const settings = getOwnerSettings();
      const records = await settleExpiredPredictions();
      const accuracy = computeOverallAccuracyReport(
        records,
        settings.confidenceThreshold,
      );
      res.json({
        records,
        accuracy,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to load verification history.',
      });
    }
  });

  app.post('/api/predictions/settle', async (_req, res) => {
    try {
      const settings = getOwnerSettings();
      const records = await settleExpiredPredictions();
      await settleExpiredDemoTrades();
      const accuracy = computeOverallAccuracyReport(
        records,
        settings.confidenceThreshold,
      );
      res.json({
        records,
        accuracy,
      });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to settle pending predictions.',
      });
    }
  });

  app.delete('/api/predictions', (_req, res) => {
    const settings = getOwnerSettings();
    clearPredictions();
    const accuracy = computeOverallAccuracyReport([], settings.confidenceThreshold);
    res.json({ records: [], accuracy });
  });

  app.get('/api/learning', async (_req, res) => {
    try {
      const records = await settleExpiredPredictions();
      const profile = computeLearningProfile(records);
      res.json({ profile });
    } catch (err) {
      res.status(500).json({
        error:
          err instanceof Error
            ? err.message
            : 'Failed to compute self-learning statistics.',
      });
    }
  });

  app.post('/api/predict', async (req, res) => {
    const settings = getOwnerSettings();
    if (settings.emergencyStopped) {
      res.status(423).json({
        error: 'Emergency STOP is active. Resume system controls before generating new signals.',
      });
      return;
    }

    const { market, pairId, timeframe } = req.body ?? {};
    if (!isValidMarket(market)) {
      res.status(400).json({ error: 'Invalid market selection. Use LIVE or OTC.' });
      return;
    }
    if (!isValidTimeframe(timeframe)) {
      res.status(400).json({
        error: 'Invalid timeframe. Only 5s, 10s, 30s, and 1m are supported.',
      });
      return;
    }
    const pair = getPairById(String(pairId ?? ''));
    if (!pair) {
      res.status(400).json({ error: 'Invalid or unsupported currency pair.' });
      return;
    }

    try {
      const existingRecords = await settleExpiredPredictions();
      const accuracyReport = computeOverallAccuracyReport(
        existingRecords,
        settings.confidenceThreshold,
      );
      const learningProfile = computeLearningProfile(existingRecords);

      const bundle = await fetchLiveMarketBundle(pair, timeframe, market);
      const multiTimeframe = await fetchMultiTimeframeContext(
        pair,
        market,
        timeframe === '1m' ? bundle.candles : undefined,
      );
      const now = Date.now();
      const analysis = analyzeMarketStructure(
        bundle.candles,
        timeframe,
        bundle.orderbook,
        now,
      );
      const smc = analyzeSmcAndPriceAction(bundle.candles, pair.precision);

      // Deduplicate per candle: never generate conflicting/duplicate directional signals for the same upcoming candle
      const existingForCandle = findDuplicatePredictionForCandle(
        market,
        pair.id,
        timeframe,
        analysis.nextCandleOpenTime,
      );
      if (existingForCandle) {
        const lockedResult: PredictionResult = {
          id: existingForCandle.id,
          market,
          pairId: pair.id,
          pairSymbol: pair.symbol,
          timeframe,
          direction: existingForCandle.predictedDirection,
          confidence: existingForCandle.confidence,
          entryPrice: existingForCandle.entryPrice,
          precision: pair.precision,
          candleOpenTime: existingForCandle.candleOpenTime,
          expiryTime: existingForCandle.expiryTime,
          analyzedAt: existingForCandle.createdAt,
          feedSource: existingForCandle.feedSource,
          quotexConnected: bundle.quotexConnected,
          duplicatePrevented: true,
          learningNote: existingForCandle.smcSummary ?? null,
          reasoning: [
            `Candle lock active: preserving existing ${existingForCandle.predictedDirection} (${existingForCandle.confidence}%) signal for this ${timeframe} candle.`,
            ...(analysis.keyFactors.slice(0, 2)),
          ],
          multiTimeframe,
          candles: bundle.candles.slice(-60),
          chartOverlay: {
            emaFast: analysis.emaFast,
            emaSlow: analysis.emaSlow,
            ema9: smc.ema9,
            ema21: smc.ema21,
            ema50: smc.ema50,
            supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
            resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
            bollingerUpper: analysis.bollingerUpper,
            bollingerLower: analysis.bollingerLower,
          },
          smc,
          technicalSummary: {
            rsi14: analysis.rsi14,
            stochRsi: analysis.stochRsi,
            emaAlignment: analysis.emaAlignment,
            macdBias: analysis.macdBias,
            bollingerPercentB: analysis.bollingerPercentB,
            marketRegime: analysis.marketRegime,
            volatilityPct: analysis.volatilityPct,
            atrPct: analysis.atrPct,
            supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
            resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
            liquidityBias: analysis.orderbook
              ? analysis.orderbook.imbalanceRatio > 0.08
                ? 'Bid-Dominant'
                : analysis.orderbook.imbalanceRatio < -0.08
                  ? 'Ask-Dominant'
                  : 'Balanced'
              : 'Unavailable',
            bullishProbability: analysis.bullishProbability,
            bearishProbability: analysis.bearishProbability,
            candlesAnalyzed: analysis.activeCandleCount,
          },
          recordedForVerification: true,
        };
        res.json({ prediction: lockedResult, accuracy: accuracyReport, learningProfile });
        return;
      }

      if (!analysis.dataSufficient) {
        const result: PredictionResult = {
          id: crypto.randomUUID(),
          market,
          pairId: pair.id,
          pairSymbol: pair.symbol,
          timeframe,
          direction: 'NO_TRADE',
          confidence: 0,
          entryPrice: Number(analysis.latestPrice.toFixed(pair.precision)),
          precision: pair.precision,
          candleOpenTime: analysis.nextCandleOpenTime,
          expiryTime: analysis.nextCandleCloseTime,
          analyzedAt: now,
          feedSource: bundle.feedSource,
          quotexConnected: bundle.quotexConnected,
          reasoning: [
            analysis.insufficiencyReason ??
              'Insufficient real-time market data for confirmation.',
            'Signal withheld until active candle density meets minimum validation threshold.',
          ],
          multiTimeframe,
          candles: bundle.candles.slice(-60),
          chartOverlay: {
            emaFast: analysis.emaFast,
            emaSlow: analysis.emaSlow,
            ema9: smc.ema9,
            ema21: smc.ema21,
            ema50: smc.ema50,
            supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
            resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
            bollingerUpper: analysis.bollingerUpper,
            bollingerLower: analysis.bollingerLower,
          },
          smc,
          technicalSummary: {
            rsi14: analysis.rsi14,
            stochRsi: analysis.stochRsi,
            emaAlignment: analysis.emaAlignment,
            macdBias: analysis.macdBias,
            bollingerPercentB: analysis.bollingerPercentB,
            marketRegime: analysis.marketRegime,
            volatilityPct: analysis.volatilityPct,
            atrPct: analysis.atrPct,
            supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
            resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
            liquidityBias: analysis.orderbook
              ? analysis.orderbook.imbalanceRatio >= 0
                ? 'Bid-Heavy'
                : 'Ask-Heavy'
              : 'Unavailable',
            bullishProbability: analysis.bullishProbability,
            bearishProbability: analysis.bearishProbability,
            candlesAnalyzed: analysis.activeCandleCount,
          },
          recordedForVerification: false,
        };
        res.json({ prediction: result, accuracy: accuracyReport, learningProfile });
        return;
      }

      const aiOutput = await generateAiCandlePrediction({
        market,
        pair,
        timeframe,
        candles: bundle.candles,
        analysis,
        smc,
        multiTimeframe,
        timeframeStats: accuracyReport.byTimeframe[timeframe],
        learningProfile,
        feedSource: bundle.feedSource,
      });

      const gated = applyConfidenceGate(
        aiOutput.direction,
        aiOutput.confidence,
        analysis.dataSufficient,
        settings.confidenceThreshold,
      );

      const entryPrice = Number(analysis.latestPrice.toFixed(pair.precision));
      const predictionId = crypto.randomUUID();
      const reasoning =
        gated.rejectedReason && gated.direction === 'NO_TRADE'
          ? [gated.rejectedReason, ...aiOutput.reasoning].slice(0, 3)
          : aiOutput.reasoning;

      let updatedAccuracy = accuracyReport;
      let recordedForVerification = false;
      const indicatorSignature = extractIndicatorSignature(analysis, smc);

      if (gated.direction === 'UP' || gated.direction === 'DOWN') {
        const newRecord: RecordedPrediction = {
          id: predictionId,
          market,
          pairId: pair.id,
          pairSymbol: pair.symbol,
          timeframe,
          predictedDirection: gated.direction,
          confidence: gated.confidence,
          entryPrice,
          precision: pair.precision,
          candleOpenTime: analysis.nextCandleOpenTime,
          expiryTime: analysis.nextCandleCloseTime,
          createdAt: now,
          feedSource: bundle.feedSource,
          outcome: 'PENDING',
          actualClosePrice: null,
          settledAt: null,
          marketCondition: analysis.marketRegime,
          indicatorSignature,
          smcSummary: smc.priceActionContext,
        };
        const updatedRecords = appendPrediction(newRecord);
        updatedAccuracy = computeOverallAccuracyReport(
          updatedRecords,
          settings.confidenceThreshold,
        );
        recordedForVerification = true;
      }

      const result: PredictionResult = {
        id: predictionId,
        market,
        pairId: pair.id,
        pairSymbol: pair.symbol,
        timeframe,
        direction: gated.direction,
        confidence: gated.confidence,
        entryPrice,
        precision: pair.precision,
        candleOpenTime: analysis.nextCandleOpenTime,
        expiryTime: analysis.nextCandleCloseTime,
        analyzedAt: now,
        feedSource: bundle.feedSource,
        quotexConnected: bundle.quotexConnected,
        learningNote:
          learningProfile.advisoryAdjustment !== 0
            ? `Self-Learning calibration ${learningProfile.advisoryAdjustment > 0 ? '+' : ''}${learningProfile.advisoryAdjustment} applied from ${learningProfile.totalSettled} verified trades`
            : null,
        reasoning,
        multiTimeframe,
        candles: bundle.candles.slice(-60),
        chartOverlay: {
          emaFast: analysis.emaFast,
          emaSlow: analysis.emaSlow,
          ema9: smc.ema9,
          ema21: smc.ema21,
          ema50: smc.ema50,
          supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
          resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
          bollingerUpper: analysis.bollingerUpper,
          bollingerLower: analysis.bollingerLower,
        },
        smc,
        technicalSummary: {
          rsi14: analysis.rsi14,
          stochRsi: analysis.stochRsi,
          emaAlignment: analysis.emaAlignment,
          macdBias: analysis.macdBias,
          bollingerPercentB: analysis.bollingerPercentB,
          marketRegime: analysis.marketRegime,
          volatilityPct: analysis.volatilityPct,
          atrPct: analysis.atrPct,
          supportLevel: Number(analysis.supportLevel.toFixed(pair.precision)),
          resistanceLevel: Number(analysis.resistanceLevel.toFixed(pair.precision)),
          liquidityBias: analysis.orderbook
            ? analysis.orderbook.imbalanceRatio > 0.08
              ? 'Bid-Dominant'
              : analysis.orderbook.imbalanceRatio < -0.08
                ? 'Ask-Dominant'
                : 'Balanced'
            : 'Unavailable',
          bullishProbability: analysis.bullishProbability,
          bearishProbability: analysis.bearishProbability,
          candlesAnalyzed: analysis.activeCandleCount,
        },
        recordedForVerification,
      };

      res.json({
        prediction: result,
        accuracy: updatedAccuracy,
        learningProfile,
      });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Prediction service failed to connect to upstream market or AI provider.';
      res.status(502).json({ error: msg });
    }
  });

  // ── Demo Account Simulator & Live / Quotex Honest Status ───────────────────
  function buildAccountsSnapshot(): AccountsSnapshot {
    return {
      demo: getDemoAccount(),
      demoTrades: listDemoTrades(30),
      live: {
        connected: false,
        provider: 'Official Authorized Broker API Only',
        statusLabel: 'Not Connected',
        verifiedBalance: null,
        note: 'Live broker funds are never fabricated or assumed. Connect an official authorized API only.',
      },
      quotex: {
        status: 'OFFICIAL_API_ONLY_NOT_CONNECTED',
        apiConnected: false,
        platformUrl: 'https://qxbroker.com/en/sign-in',
        autoClickBlocked: true,
        scrapingBlocked: true,
        credentialsStored: false,
        checklistNote:
          'Quotex official API is not connected. Verify Gmail & KYC document readiness below, then execute manually on qxbroker.com. Automated clicking, scraping, and password storage are disabled.',
      },
      quotexProfile: getQuotexReadiness(),
    };
  }

  app.get('/api/accounts', async (_req, res) => {
    try {
      await settleExpiredDemoTrades();
      res.json(buildAccountsSnapshot());
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Failed to load account status.',
      });
    }
  });

  app.get('/api/quotex/profile', (_req, res) => {
    res.json({ profile: getQuotexReadiness() });
  });

  app.put('/api/quotex/profile', (req, res) => {
    const saved = saveQuotexReadiness(req.body ?? {});
    res.json({
      profile: saved,
      accounts: buildAccountsSnapshot(),
    });
  });

  app.get('/api/gmail/quotex-check', async (req, res) => {
    const authHeader = req.headers.authorization ?? '';
    if (!authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Google Gmail sign-in required to check Quotex emails.' });
      return;
    }
    const token = authHeader.slice(7).trim();
    if (!token) {
      res.status(401).json({ error: 'Missing Google OAuth access token.' });
      return;
    }

    try {
      const profileRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/profile',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (profileRes.status === 401 || profileRes.status === 403) {
        res.status(401).json({
          error: 'Google Gmail session expired or permission missing. Please sign in with Google again.',
        });
        return;
      }
      if (!profileRes.ok) {
        res.status(502).json({ error: `Gmail profile request failed (${profileRes.status}).` });
        return;
      }
      const profileJson = (await profileRes.json()) as { emailAddress?: string };
      const gmailAddress = String(profileJson.emailAddress ?? '').trim();

      const listRes = await fetch(
        'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=quotex&maxResults=5',
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (!listRes.ok) {
        res.status(502).json({ error: `Gmail search request failed (${listRes.status}).` });
        return;
      }
      const listJson = (await listRes.json()) as {
        messages?: Array<{ id: string }>;
      };

      const messageIds = (listJson.messages ?? []).slice(0, 5).map((m) => m.id);
      const messages: GmailQuotexMessage[] = [];

      for (const msgId of messageIds) {
        const msgRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(msgId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!msgRes.ok) continue;
        const msgJson = (await msgRes.json()) as {
          id?: string;
          snippet?: string;
          payload?: {
            headers?: Array<{ name?: string; value?: string }>;
          };
        };
        const headers = msgJson.payload?.headers ?? [];
        const getHeader = (target: string) =>
          headers.find((h) => h.name?.toLowerCase() === target.toLowerCase())?.value ?? '';

        messages.push({
          id: String(msgJson.id ?? msgId),
          subject: getHeader('Subject') || '(No Subject)',
          from: getHeader('From') || 'Unknown Sender',
          date: getHeader('Date') || '',
          snippet: String(msgJson.snippet ?? '').slice(0, 140),
        });
      }

      if (gmailAddress) {
        saveQuotexReadiness({
          gmailEmail: gmailAddress,
          gmailVerified: true,
        });
      }

      const payload: GmailQuotexVerification = {
        checkedAt: Date.now(),
        gmailAddress,
        messages,
        foundQuotexEmails: messages.length > 0,
      };
      res.json({
        verification: payload,
        accounts: buildAccountsSnapshot(),
      });
    } catch (err) {
      res.status(502).json({
        error:
          err instanceof Error
            ? err.message
            : 'Unable to reach Gmail API for Quotex email check.',
      });
    }
  });

  app.post('/api/accounts/demo/trade', async (req, res) => {
    const settings = getOwnerSettings();
    if (settings.emergencyStopped) {
      res.status(423).json({
        error: 'Emergency STOP is active. Demo execution halted until resumed.',
      });
      return;
    }

    const { pairId, market, timeframe, direction, stake, source } = req.body ?? {};
    const pair = getPairById(String(pairId ?? ''));
    if (!pair || !isValidMarket(market) || !isValidTimeframe(timeframe)) {
      res.status(400).json({ error: 'Invalid pair, market, or timeframe for demo trade.' });
      return;
    }
    if (direction !== 'UP' && direction !== 'DOWN') {
      res.status(400).json({ error: 'Demo trade direction must be UP or DOWN.' });
      return;
    }

    const account = getDemoAccount();
    const priorTrades = listDemoTrades(5);
    const lastTrade = priorTrades[0];
    const stakeNum = Number(stake ?? settings.demoStakeAmount);
    const validation = validateDemoStake(
      stakeNum,
      account.balance,
      lastTrade?.stake,
      lastTrade?.outcome === 'LOSS',
    );
    if (!validation.valid) {
      res.status(400).json({ error: validation.reason });
      return;
    }

    try {
      const bundle = await fetchLiveMarketBundle(pair, timeframe, market);
      const now = Date.now();
      const analysis = analyzeMarketStructure(bundle.candles, timeframe, bundle.orderbook, now);
      if (!analysis.dataSufficient || analysis.latestPrice <= 0) {
        res.status(400).json({ error: 'Live market price unavailable for virtual demo trade.' });
        return;
      }

      if (source === '3GP_BOT_AUTO') {
        const dup = findDuplicateDemoTradeForCandle(
          market,
          pair.id,
          timeframe,
          analysis.nextCandleOpenTime,
        );
        if (dup) {
          res.status(409).json({
            error: `3GP.bot already executed a paper trade for this ${timeframe} candle.`,
            duplicate: true,
          });
          return;
        }
      }

      const trade: DemoTradeRecord = {
        id: crypto.randomUUID(),
        pairId: pair.id,
        pairSymbol: pair.symbol,
        market,
        timeframe,
        direction,
        stake: Number(stakeNum.toFixed(2)),
        payoutPct: settings.defaultPayoutPct,
        entryPrice: Number(analysis.latestPrice.toFixed(pair.precision)),
        precision: pair.precision,
        candleOpenTime: analysis.nextCandleOpenTime,
        expiryTime: analysis.nextCandleCloseTime,
        outcome: 'PENDING',
        pnl: 0,
        closePrice: null,
        createdAt: now,
        settledAt: null,
      };

      const placed = placeDemoTradeInDb(trade);
      if (!placed.ok) {
        res.status(400).json({ error: placed.error });
        return;
      }
      res.json({
        ...buildAccountsSnapshot(),
        placedTrade: trade,
        martingaleWarning: validation.martingaleWarning ?? null,
      });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'Unable to lock live price for demo trade.',
      });
    }
  });

  app.post('/api/accounts/demo/reset', (_req, res) => {
    resetDemoAccountInDb(10000);
    res.json(buildAccountsSnapshot());
  });

  // ── Multilingual Voice AI Assistant (Urdu / Hindi / English) ─────────────
  app.post('/api/assistant/ask', async (req, res) => {
    const language: AssistantLanguage = isValidLanguage(req.body?.language)
      ? req.body.language
      : getOwnerSettings().assistantLanguage;
    const question = String(req.body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Please enter or speak a question.' });
      return;
    }

    const market: MarketMode = isValidMarket(req.body?.market) ? req.body.market : 'OTC';
    const pairId = String(req.body?.activePairId ?? 'BTC-USD');
    const timeframe: Timeframe = isValidTimeframe(req.body?.timeframe)
      ? req.body.timeframe
      : '1m';
    const latestPrediction = req.body?.latestPrediction ?? null;

    try {
      const settings = getOwnerSettings();
      const records = await settleExpiredPredictions();
      const accuracy = computeOverallAccuracyReport(records, settings.confidenceThreshold);
      const learning = computeLearningProfile(records);
      const cachedBoard = autoBoardCache.get(market)?.payload;
      const strongestOtcPair =
        cachedBoard?.signals.find((s) => s.direction === 'UP' || s.direction === 'DOWN') ?? null;
      const activeMonitor = monitorCache.get(`${market}:${pairId}:${timeframe}`)?.data ?? null;

      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todaySettled = records.filter(
        (r) =>
          (r.outcome === 'CORRECT' || r.outcome === 'FALSE') &&
          r.createdAt >= todayStart.getTime(),
      );
      const todayCorrect = todaySettled.filter((r) => r.outcome === 'CORRECT').length;

      const groundedContext = {
        market,
        timeframe,
        activePair: getPairById(pairId)?.symbol ?? pairId,
        emergencyStopped: settings.emergencyStopped,
        marketSafe:
          !settings.emergencyStopped &&
          (!activeMonitor ||
            (activeMonitor.dataStatus === 'CONNECTED' && !activeMonitor.suddenVolatility)),
        activeMonitor: activeMonitor
          ? {
              price: activeMonitor.price,
              dataStatus: activeMonitor.dataStatus,
              suddenVolatility: activeMonitor.suddenVolatility,
              volatilityNote: activeMonitor.volatilityNote,
              liveUpProb: activeMonitor.liveUpProb,
              liveDownProb: activeMonitor.liveDownProb,
              msRemaining: activeMonitor.msRemaining,
            }
          : null,
        latestSignal: latestPrediction,
        strongestOtcPair,
        overallAccuracyPct: accuracy.overallAccuracyPct,
        totalSettled: accuracy.totalSettled,
        totalCorrect: accuracy.totalCorrect,
        todayStats: {
          settled: todaySettled.length,
          correct: todayCorrect,
          accuracyPct:
            todaySettled.length > 0
              ? Number(((todayCorrect / todaySettled.length) * 100).toFixed(1))
              : null,
        },
        recent20Signals: records.slice(0, 20).map((r) => ({
          pair: r.pairSymbol,
          tf: r.timeframe,
          dir: r.predictedDirection,
          conf: r.confidence,
          outcome: r.outcome,
        })),
        learningStrengths: learning.strengths.slice(0, 2),
        learningWeaknesses: learning.weaknesses.slice(0, 2),
      };

      const reply = await answerMultilingualAssistantQuestion({
        language,
        question,
        groundedContext,
      });

      res.json({
        language,
        question,
        answer: reply.answer,
        spokenText: reply.spokenText,
        generatedAt: Date.now(),
        groundedFactsUsed: [
          `Active: ${groundedContext.activePair} (${timeframe} ${market})`,
          `Settled Signals: ${accuracy.totalSettled}`,
          strongestOtcPair
            ? `Board #1: ${strongestOtcPair.symbol} ${strongestOtcPair.direction} ${strongestOtcPair.confidence}%`
            : 'Board #1: Standby',
        ],
      });
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : 'Assistant service unavailable.',
      });
    }
  });

  // ── Live Quotex Visual Intelligence (Screen Capture -> Gemini Vision) ─────
  app.post('/api/vision/quotex-screen', async (req, res) => {
    const settings = getOwnerSettings();
    if (settings.emergencyStopped) {
      res.status(423).json({
        error: 'Emergency STOP All is active. Live screen analysis is halted.',
      });
      return;
    }

    const imageBase64 = String(req.body?.imageBase64 ?? '').trim();
    const mimeType = String(req.body?.mimeType ?? 'image/jpeg').trim();
    const language: AssistantLanguage = isValidLanguage(req.body?.language)
      ? req.body.language
      : settings.assistantLanguage;

    if (!imageBase64 || imageBase64.length < 100) {
      res.status(400).json({
        error: 'No valid screen capture frame provided. Start screen sharing and capture a chart frame.',
      });
      return;
    }

    try {
      const signal = await analyzeQuotexScreenFrame({
        imageBase64,
        mimeType,
        language,
      });
      res.json({ signal });
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Live Quotex visual reading failed cleanly.';
      const status = msg.includes('429') || msg.includes('RESOURCE_EXHAUSTED') ? 429 : 502;
      res.status(status).json({ error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`3GP — ISRAR AI TRADING MASTER server listening on http://localhost:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
