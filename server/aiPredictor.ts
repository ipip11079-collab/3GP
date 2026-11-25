import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import type {
  AssistantLanguage,
  AutoBoardSignalItem,
  Candle,
  LearningProfile,
  MarketMode,
  MultiTimeframeContext,
  SignalDirection,
  SmcAnalysis,
  TechnicalAnalysis,
  Timeframe,
  TimeframeAccuracyStats,
  TradingPair,
} from '../src/types/trading.ts';
import type { AutoBoard1mCandidate } from './marketData.ts';

interface GeminiSignalOutput {
  direction: SignalDirection;
  confidence: number;
  reasoning: string[];
}

function formatGeminiError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } };
    if (parsed?.error?.message) {
      return `AI service temporarily unavailable (${parsed.error.code ?? 'error'}): ${parsed.error.message}`;
    }
  } catch {
    // Not raw JSON
  }
  return raw;
}

function isTransientError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes('503') ||
    msg.includes('UNAVAILABLE') ||
    msg.includes('429') ||
    msg.includes('RESOURCE_EXHAUSTED') ||
    msg.includes('fetch failed') ||
    msg.includes('ECONNRESET') ||
    msg.includes('timed out')
  );
}

async function waitMs(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function withAbortTimeout<T>(
  run: (signal: AbortSignal) => Promise<T>,
  ms: number,
): Promise<T> {
  const controller = new AbortController();
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort();
      reject(new Error(`AI request timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([run(controller.signal), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function generateAiCandlePrediction(params: {
  market: MarketMode;
  pair: TradingPair;
  timeframe: Timeframe;
  candles: Candle[];
  analysis: TechnicalAnalysis;
  smc?: SmcAnalysis;
  multiTimeframe: MultiTimeframeContext | null;
  timeframeStats: TimeframeAccuracyStats;
  learningProfile?: LearningProfile;
  feedSource: string;
}): Promise<GeminiSignalOutput> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    throw new Error(
      'GEMINI_API_KEY is not configured. Please add your Gemini API key in Settings > Secrets.',
    );
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const recentBars = params.candles.slice(-14).map((c) => ({
    t: new Date(c.openTime).toISOString(),
    o: Number(c.open.toFixed(params.pair.precision)),
    h: Number(c.high.toFixed(params.pair.precision)),
    l: Number(c.low.toFixed(params.pair.precision)),
    c: Number(c.close.toFixed(params.pair.precision)),
    v: Number(c.volume.toFixed(4)),
    buyV: c.buyVolume !== undefined ? Number(c.buyVolume.toFixed(4)) : null,
    sellV: c.sellVolume !== undefined ? Number(c.sellVolume.toFixed(4)) : null,
  }));

  const smcData = params.smc ?? params.analysis.smc;

  const promptPayload = {
    market: params.market,
    pair: params.pair.symbol,
    timeframe: params.timeframe,
    feedSource: params.feedSource,
    multiTimeframeAnchor: params.multiTimeframe,
    historicalVerifiedAccuracyForTimeframe: {
      settled: params.timeframeStats.settled,
      correct: params.timeframeStats.correct,
      falseCount: params.timeframeStats.falseCount,
      accuracyPct: params.timeframeStats.accuracyPct,
    },
    selfLearningFeedback: params.learningProfile
      ? {
          overallWinRatePct: params.learningProfile.overallWinRatePct,
          strengths: params.learningProfile.strengths.slice(0, 2),
          weaknesses: params.learningProfile.weaknesses.slice(0, 2),
          advisoryAdjustment: params.learningProfile.advisoryAdjustment,
        }
      : null,
    smc18MethodAnalysis: smcData
      ? {
          smcBias: smcData.smcBias,
          marketStructure: smcData.marketStructure,
          bos: smcData.bos,
          choch: smcData.choch,
          orderBlock: smcData.orderBlock.label,
          fvg: smcData.fvg.label,
          liquiditySweep: smcData.liquiditySweep,
          ema9: smcData.ema9,
          ema21: smcData.ema21,
          ema50: smcData.ema50,
          ema9_21_50Alignment: smcData.ema9_21_50Alignment,
          candlestickPattern: smcData.candlestickPattern,
          candlePsychology: smcData.candlePsychology,
          rejectionBreakout: smcData.rejectionBreakout,
          volumeStatus: smcData.volumeStatus,
          smcFactors: smcData.smcFactors,
        }
      : null,
    quantitativeStructure: {
      latestPrice: params.analysis.latestPrice,
      emaAlignment: params.analysis.emaAlignment,
      rsi14: params.analysis.rsi14,
      rsi7: params.analysis.rsi7,
      stochRsi: params.analysis.stochRsi,
      macdLine: params.analysis.macdLine,
      macdSignal: params.analysis.macdSignal,
      macdHistogram: params.analysis.macdHistogram,
      macdBias: params.analysis.macdBias,
      bollingerPercentB: params.analysis.bollingerPercentB,
      marketRegime: params.analysis.marketRegime,
      rocPct: params.analysis.rocPct,
      atrPct: params.analysis.atrPct,
      volatilityPct: params.analysis.volatilityPct,
      supportLevel: params.analysis.supportLevel,
      resistanceLevel: params.analysis.resistanceLevel,
      distanceToSupportPct: params.analysis.distanceToSupportPct,
      distanceToResistancePct: params.analysis.distanceToResistancePct,
      volumeTrendRatio: params.analysis.volumeTrendRatio,
      takerBuyRatio: params.analysis.takerBuyRatio,
      orderbookImbalanceRatio: params.analysis.orderbook?.imbalanceRatio ?? null,
      spreadPct: params.analysis.orderbook?.spreadPct ?? null,
      bullishProbability: params.analysis.bullishProbability,
      bearishProbability: params.analysis.bearishProbability,
      quantitativeConfidence: params.analysis.quantitativeConfidence,
      keyFactors: params.analysis.keyFactors,
    },
    recentCandles: recentBars,
  };

  const contents = `Perform 18-method SMC + multi-timeframe next-candle trade analysis for ${params.pair.symbol} on ${params.timeframe} (${params.market}) and decide UP, DOWN, or NO_TRADE.\n\n${JSON.stringify(promptPayload)}`;
  const systemInstruction = [
    'You are 3GP — ISRAR AI TRADING MASTER, an advanced OTC and live market next-candle analyst.',
    'Analyze ONLY the provided real-time candles, SMC structure (BOS, CHOCH, Order Blocks, FVG, Liquidity Sweeps), EMA 9/21/50 stack, multiTimeframeAnchor, RSI/MACD/ATR/Bollinger %B, candlestick psychology, S/R levels, genuine volume (if GENUINE_VOLUME), and selfLearningFeedback.',
    'Never invent unavailable volume or orderbook metrics.',
    'Output "UP" or "DOWN" only when multiple independent indicators align; output "NO_TRADE" if signals conflict or whipsaw risk is high.',
    'Calibrate confidence honestly between 55 and 92 based on confluence (never claim 100%).',
    'Provide 2 to 3 concise factual bullets citing exact observed levels, SMC structures (BOS/CHOCH/OB/FVG/Sweep), EMA 9/21/50, or RSI/MACD confirmation.',
  ].join(' ');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      direction: {
        type: Type.STRING,
        description: 'Must be UP, DOWN, or NO_TRADE',
      },
      confidence: {
        type: Type.NUMBER,
        description: 'Calibrated directional confidence from 0 to 92',
      },
      reasoning: {
        type: Type.ARRAY,
        items: { type: Type.STRING },
        description: '2 to 3 concise analytical bullets citing observed metrics',
      },
    },
    required: ['direction', 'confidence', 'reasoning'],
  };

  const modelAttempts: Array<{ model: string; level: ThinkingLevel; timeoutMs: number; delayMs: number }> = [
    { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, timeoutMs: 12000, delayMs: 0 },
    { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, timeoutMs: 12000, delayMs: 150 },
  ];

  let responseText = '';
  let lastErr: unknown = null;

  for (const attempt of modelAttempts) {
    if (attempt.delayMs > 0) {
      await waitMs(attempt.delayMs);
    }
    try {
      const response = await withAbortTimeout(
        (abortSignal) =>
          ai.models.generateContent({
            model: attempt.model,
            contents,
            config: {
              abortSignal,
              thinkingConfig: { thinkingLevel: attempt.level },
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        attempt.timeoutMs,
      );
      responseText = (response.text ?? '').trim();
      if (responseText) {
        lastErr = null;
        break;
      }
    } catch (err) {
      lastErr = err;
      if (!isTransientError(err)) {
        throw new Error(formatGeminiError(err));
      }
    }
  }

  if (!responseText) {
    // Graceful deterministic fallback using verified 18-method SMC + Quantitative engine
    // whenever upstream Gemini quota (429) or capacity (503) is temporarily unavailable.
    const a = params.analysis;
    const smc = smcData;
    const edgeSpread = a.bullishProbability - a.bearishProbability;
    const smcScore = smc?.smcScore ?? 0;
    const mtfBonus =
      params.multiTimeframe?.broaderSentiment === 'STRONG_BULLISH'
        ? 6
        : params.multiTimeframe?.broaderSentiment === 'BULLISH'
          ? 3
          : params.multiTimeframe?.broaderSentiment === 'STRONG_BEARISH'
            ? -6
            : params.multiTimeframe?.broaderSentiment === 'BEARISH'
              ? -3
              : 0;
    const compositeBias = edgeSpread + smcScore * 0.45 + mtfBonus;
    const learningOffset = params.learningProfile?.advisoryAdjustment ?? 0;

    let fallbackDirection: SignalDirection = 'NO_TRADE';
    let fallbackConfidence = Math.min(54, Math.round(a.quantitativeConfidence));

    if (a.dataSufficient && Math.abs(compositeBias) >= 12) {
      fallbackDirection = compositeBias > 0 ? 'UP' : 'DOWN';
      const rawConf =
        a.quantitativeConfidence +
        Math.min(10, Math.abs(smcScore) * 0.18) +
        learningOffset * 0.5;
      fallbackConfidence = Math.max(58, Math.min(89, Math.round(rawConf)));
    }

    const fallbackReasoning = [
      `18-Method Quantitative/SMC Synthesis (${params.feedSource}): ${a.bullishProbability}% bull vs ${a.bearishProbability}% bear · RSI ${a.rsi14.toFixed(1)}, MACD ${a.macdBias}.`,
      smc
        ? `SMC ${smc.marketStructure} (${smc.ema9_21_50Alignment} EMA 9/21/50) · ${smc.candlestickPattern}.`
        : a.keyFactors[0] ?? 'Live candlestick & orderbook structure evaluated.',
      lastErr
        ? 'LLM narrative quota reached — signal computed strictly from verified live market indicators.'
        : 'Signal computed strictly from verified live market indicators.',
    ];

    return {
      direction: fallbackDirection,
      confidence: fallbackConfidence,
      reasoning: fallbackReasoning.slice(0, 3),
    };
  }

  const parsed = JSON.parse(responseText) as {
    direction?: string;
    confidence?: number;
    reasoning?: string[];
  };

  const rawDir = (parsed.direction ?? 'NO_TRADE').toUpperCase();
  const direction: SignalDirection =
    rawDir === 'UP' || rawDir === 'DOWN' ? rawDir : 'NO_TRADE';

  const aiConf = Number.isFinite(parsed.confidence) ? Number(parsed.confidence) : 50;
  const learningOffset = params.learningProfile?.advisoryAdjustment ?? 0;
  const blendedConfidence =
    direction === 'NO_TRADE'
      ? Math.min(57, Math.round(aiConf))
      : Math.round(aiConf * 0.6 + params.analysis.quantitativeConfidence * 0.4 + learningOffset * 0.5);

  const reasoning = Array.isArray(parsed.reasoning)
    ? parsed.reasoning.filter((r) => typeof r === 'string' && r.trim().length > 0).slice(0, 3)
    : params.analysis.keyFactors.slice(0, 3);

  return {
    direction,
    confidence: Math.max(0, Math.min(92, blendedConfidence)),
    reasoning,
  };
}

export async function generateAutoBoard1mSignals(params: {
  market: MarketMode;
  candidates: AutoBoard1mCandidate[];
}): Promise<AutoBoardSignalItem[]> {
  if (params.candidates.length === 0) {
    return [];
  }

  // Evaluate 1m closed-candle board deterministically from verified live candles & indicators
  // so 1m board refreshes stay sub-second and never hit LLM timeouts or rate limits.
  return params.candidates.slice(0, 8).map((c): AutoBoardSignalItem => ({
    pairId: c.pair.id,
    symbol: c.pair.symbol,
    category: c.pair.category,
    precision: c.pair.precision,
    direction: c.evaluation.direction,
    confidence: c.evaluation.confidence,
    entryPrice: Number(c.evaluation.entryPrice.toFixed(c.pair.precision)),
    closedCandleClose: Number(
      (c.evaluation.closedCandle?.close ?? c.evaluation.entryPrice).toFixed(c.pair.precision),
    ),
    closedCandleOpenTime: c.evaluation.closedCandleOpenTime,
    nextCandleOpenTime: c.evaluation.nextCandleOpenTime,
    nextCandleCloseTime: c.evaluation.nextCandleCloseTime,
    setupName: c.evaluation.setupName,
    reasoning: c.evaluation.reasoning,
    rsi14: c.evaluation.analysis.rsi14,
    macdBias: c.evaluation.analysis.macdBias,
    emaAlignment: c.evaluation.analysis.emaAlignment,
    bollingerPercentB: c.evaluation.analysis.bollingerPercentB,
    feedSource: c.feedSource,
  }));
}

export async function answerMultilingualAssistantQuestion(params: {
  language: AssistantLanguage;
  question: string;
  groundedContext: Record<string, unknown>;
}): Promise<{ answer: string; spokenText: string }> {
  const langLabel =
    params.language === 'ur'
      ? 'Urdu (natural Urdu script / simple clear trading terms)'
      : params.language === 'hi'
        ? 'Hindi (natural Devanagari Hindi with clear trading terms)'
        : 'English';

  const fallbackSummary = (): { answer: string; spokenText: string } => {
    const ctx = params.groundedContext as {
      activePair?: string;
      latestSignal?: { direction?: string; confidence?: number; reasoning?: string[] } | null;
      strongestOtcPair?: { symbol?: string; direction?: string; confidence?: number } | null;
      overallAccuracyPct?: number | null;
      totalSettled?: number;
      marketSafe?: boolean;
    };
    const pairLabel = ctx.activePair ?? 'BTC/USD';
    const hasSig = Boolean(ctx.latestSignal);
    const sigDir = ctx.latestSignal?.direction ?? 'NO_TRADE';
    const sigConf = ctx.latestSignal?.confidence ?? 0;
    const settled = ctx.totalSettled ?? 0;
    const hasAcc = ctx.overallAccuracyPct !== null && ctx.overallAccuracyPct !== undefined;

    if (params.language === 'ur') {
      const sigText = hasSig
        ? `${pairLabel} کا تازہ سگنل: ${sigDir} (${sigConf}% اعتماد)۔`
        : `${pairLabel} کے لیے ابھی کوئی تصدیق شدہ سگنل فعال نہیں ہے۔`;
      const bestText = ctx.strongestOtcPair
        ? `مضبوط ترین OTC جوڑا: ${ctx.strongestOtcPair.symbol} (${ctx.strongestOtcPair.direction} ${ctx.strongestOtcPair.confidence}%)۔`
        : 'اس وقت OTC بورڈ پر کوئی ہائی کانفیڈنس لیڈر موجود نہیں ہے۔';
      const accText = hasAcc
        ? `تصدیق شدہ درستگی: ${settled} مکمل سگنلز میں ${ctx.overallAccuracyPct}%۔`
        : 'درستگی جانچنے کے لیے مکمل کینڈلز کا انتظار جاری ہے۔';
      const safeText = ctx.marketSafe
        ? 'مارکیٹ لائیو فیڈ مستحکم ہے۔'
        : 'احتیاط: لائیو ڈیٹا یا وولیٹیلٹی چیک کریں۔';
      const text = `${sigText} ${bestText} ${accText} ${safeText}`;
      return { answer: text, spokenText: text };
    }

    if (params.language === 'hi') {
      const sigText = hasSig
        ? `${pairLabel} का वर्तमान सिग्नल: ${sigDir} (${sigConf}% कॉन्फिडेंस)।`
        : `${pairLabel} के लिए अभी कोई पुष्ट सिग्नल सक्रिय नहीं है।`;
      const bestText = ctx.strongestOtcPair
        ? `सबसे मजबूत OTC पेयर: ${ctx.strongestOtcPair.symbol} (${ctx.strongestOtcPair.direction} ${ctx.strongestOtcPair.confidence}%)।`
        : 'अभी OTC बोर्ड पर कोई हाई-कॉन्फिडेंस लीडर उपलब्ध नहीं है।';
      const accText = hasAcc
        ? `सत्यापित सटीकता: ${settled} पूर्ण सिग्नल में से ${ctx.overallAccuracyPct}%।`
        : 'सटीकता की गणना के लिए पूर्ण कैंडल्स की प्रतीक्षा है।';
      const safeText = ctx.marketSafe
        ? 'मार्केट लाइव फीड स्थिर है।'
        : 'सावधानी: लाइव डेटा या अस्थिरता की जांच करें।';
      const text = `${sigText} ${bestText} ${accText} ${safeText}`;
      return { answer: text, spokenText: text };
    }

    const sigText = hasSig
      ? `${pairLabel}: ${sigDir} (${sigConf}%).`
      : `No active confirmed signal for ${pairLabel} yet.`;
    const bestText = ctx.strongestOtcPair
      ? `Strongest OTC setup: ${ctx.strongestOtcPair.symbol} (${ctx.strongestOtcPair.direction} ${ctx.strongestOtcPair.confidence}%).`
      : 'No high-confidence OTC board leader right now.';
    const accText = hasAcc
      ? `Verified accuracy: ${ctx.overallAccuracyPct}% across ${settled} settled signals.`
      : 'Verified accuracy: waiting for settled signals.';
    const text = `${sigText} ${bestText} ${accText} Market status: ${ctx.marketSafe ? 'Live feed stable' : 'Caution / check data status'}.`;
    return { answer: text, spokenText: text };
  };

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return fallbackSummary();
  }

  const ai = new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });

  const systemInstruction = [
    'You are the 3GP — ISRAR AI TRADING MASTER Voice Assistant.',
    `Respond strictly in ${langLabel}.`,
    'Answer the trader question using ONLY the verified numbers and facts in the provided JSON state.',
    'Never invent live prices, balances, or accuracy claims. If data is disconnected or sample count is 0, state that honestly.',
    'Keep answers concise (2 to 4 clear sentences) suitable for both display and voice speech.',
  ].join(' ');

  const responseSchema = {
    type: Type.OBJECT,
    properties: {
      answer: { type: Type.STRING, description: 'Clear answer in the requested language' },
      spokenText: { type: Type.STRING, description: 'Natural spoken version in the same language' },
    },
    required: ['answer', 'spokenText'],
  };

  const assistantAttempts: Array<{ model: string; level: ThinkingLevel; delayMs: number }> = [
    { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, delayMs: 0 },
    { model: 'gemini-3.1-flash-lite', level: ThinkingLevel.MINIMAL, delayMs: 800 },
    { model: 'gemini-4-hydrogen', level: ThinkingLevel.LOW, delayMs: 200 },
  ];

  for (const attempt of assistantAttempts) {
    if (attempt.delayMs > 0) await waitMs(attempt.delayMs);
    try {
      const response = await withAbortTimeout(
        (abortSignal) =>
          ai.models.generateContent({
            model: attempt.model,
            contents: `Question: ${params.question}\n\nVerified Live State:\n${JSON.stringify(params.groundedContext)}`,
            config: {
              abortSignal,
              thinkingConfig: { thinkingLevel: attempt.level },
              systemInstruction,
              responseMimeType: 'application/json',
              responseSchema,
            },
          }),
        22000,
      );
      const text = (response.text ?? '').trim();
      if (!text) continue;
      const parsed = JSON.parse(text) as { answer?: string; spokenText?: string };
      const answer = parsed.answer?.trim() || fallbackSummary().answer;
      const spokenText = parsed.spokenText?.trim() || answer;
      return { answer, spokenText };
    } catch {
      // Try next attempt or fall back cleanly
    }
  }

  return fallbackSummary();
}
