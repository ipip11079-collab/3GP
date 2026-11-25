import type {
  QuotexAccountMode,
  QuotexVisionSignal,
  QuotexVisualDirection,
  QuotexVisualRecommendation,
} from '../types/trading.ts';

export const MIN_VISION_CONFIDENCE_THRESHOLD = 55;
export const FRAME_CHANGE_DIFF_THRESHOLD = 0.035;

export interface RawQuotexVisionPayload {
  isQuotexChartReadable?: unknown;
  detectedAccountMode?: unknown;
  detectedPair?: unknown;
  detectedTimeframe?: unknown;
  candleAnalysis?: {
    lastCandleDirection?: unknown;
    bodyStrength?: unknown;
    wicksNote?: unknown;
    momentum?: unknown;
    supportResistance?: unknown;
  };
  direction?: unknown;
  confidence?: unknown;
  recommendation?: unknown;
  shortExplanation?: unknown;
  spokenSummaryUrdu?: unknown;
  spokenSummaryHindi?: unknown;
  spokenSummaryEnglish?: unknown;
}

function normalizeAccountMode(val: unknown): QuotexAccountMode {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'DEMO' || s.includes('DEMO')) return 'DEMO';
  if (s === 'LIVE' || s.includes('LIVE') || s.includes('REAL')) return 'LIVE';
  return 'UNKNOWN';
}

function normalizeDirection(val: unknown): QuotexVisualDirection {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'UP' || s === 'CALL' || s === 'BUY') return 'UP';
  if (s === 'DOWN' || s === 'PUT' || s === 'SELL') return 'DOWN';
  return 'NO_CLEAR_SIGNAL';
}

function normalizeLastCandleDirection(
  val: unknown,
): QuotexVisionSignal['candleAnalysis']['lastCandleDirection'] {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'BULLISH' || s === 'GREEN' || s === 'UP') return 'BULLISH';
  if (s === 'BEARISH' || s === 'RED' || s === 'DOWN') return 'BEARISH';
  if (s === 'DOJI' || s === 'NEUTRAL') return 'DOJI';
  return 'UNKNOWN';
}

function normalizeRecommendation(val: unknown): QuotexVisualRecommendation {
  const s = String(val ?? '').trim().toUpperCase();
  if (s === 'TRADE') return 'TRADE';
  if (s === 'AVOID_TRADE' || s === 'AVOID') return 'AVOID_TRADE';
  return 'NO_CLEAR_SIGNAL';
}

export function resolveVisionSafetyGate(params: {
  isQuotexChartReadable: boolean;
  direction: QuotexVisualDirection;
  confidence: number;
  recommendation: QuotexVisualRecommendation;
}): {
  direction: QuotexVisualDirection;
  confidence: number;
  recommendation: QuotexVisualRecommendation;
} {
  if (!params.isQuotexChartReadable || params.direction === 'NO_CLEAR_SIGNAL') {
    return {
      direction: 'NO_CLEAR_SIGNAL',
      confidence: 0,
      recommendation:
        params.recommendation === 'AVOID_TRADE' ? 'AVOID_TRADE' : 'NO_CLEAR_SIGNAL',
    };
  }

  const boundedConfidence = Math.max(
    0,
    Math.min(92, Math.round(Number.isFinite(params.confidence) ? params.confidence : 0)),
  );

  if (boundedConfidence < MIN_VISION_CONFIDENCE_THRESHOLD) {
    return {
      direction: 'NO_CLEAR_SIGNAL',
      confidence: 0,
      recommendation:
        params.recommendation === 'AVOID_TRADE' ? 'AVOID_TRADE' : 'NO_CLEAR_SIGNAL',
    };
  }

  return {
    direction: params.direction,
    confidence: boundedConfidence,
    recommendation: params.recommendation === 'AVOID_TRADE' ? 'AVOID_TRADE' : 'TRADE',
  };
}

export function normalizeQuotexVisionResponse(
  raw: RawQuotexVisionPayload,
  analyzedAt: number = Date.now(),
): QuotexVisionSignal {
  const isQuotexChartReadable = Boolean(raw.isQuotexChartReadable);
  const detectedAccountMode = normalizeAccountMode(raw.detectedAccountMode);
  const rawPair = String(raw.detectedPair ?? '').trim();
  const detectedPair =
    !isQuotexChartReadable || !rawPair || rawPair.toUpperCase() === 'NONE'
      ? 'UNKNOWN'
      : rawPair.slice(0, 40);

  const rawTf = String(raw.detectedTimeframe ?? '').trim();
  const detectedTimeframe =
    !isQuotexChartReadable || !rawTf || rawTf.toUpperCase() === 'NONE'
      ? 'UNKNOWN'
      : rawTf.slice(0, 16);

  const gated = resolveVisionSafetyGate({
    isQuotexChartReadable,
    direction: normalizeDirection(raw.direction),
    confidence: Number(raw.confidence ?? 0),
    recommendation: normalizeRecommendation(raw.recommendation),
  });

  const shortExplanation = String(raw.shortExplanation ?? '').trim() ||
    (isQuotexChartReadable
      ? 'Visible candlestick structure is mixed or awaiting clearer confirmation.'
      : 'NO CLEAR SIGNAL: Quotex candlestick chart is not clearly readable in the shared frame.');

  const defaultPairLabel = detectedPair !== 'UNKNOWN' ? detectedPair : 'chart';

  const fallbackUrdu =
    gated.direction === 'NO_CLEAR_SIGNAL'
      ? `Israr Bhai, abhi ${defaultPairLabel} par clear signal nahi mil raha. Filhal trade avoid karein.`
      : gated.recommendation === 'AVOID_TRADE'
        ? `Israr Bhai, ${defaultPairLabel} par reversal ya volatility risk dikh raha hai. Filhal trade avoid karein.`
        : `Israr Bhai, aapki screen par ${defaultPairLabel} selected hai. Agali candle ke liye ${gated.direction} ka signal mil raha hai. Confidence ${gated.confidence}% hai. Trade ki guarantee nahi hai.`;

  const fallbackHindi =
    gated.direction === 'NO_CLEAR_SIGNAL'
      ? `इसरार भाई, अभी ${defaultPairLabel} पर स्पष्ट सिग्नल नहीं मिल रहा है। फिलहाल ट्रेड से बचें।`
      : gated.recommendation === 'AVOID_TRADE'
        ? `इसरार भाई, ${defaultPairLabel} पर रिवर्सल का जोखिम दिख रहा है। फिलहाल ट्रेड से बचें।`
        : `इसरार भाई, आपकी स्क्रीन पर ${defaultPairLabel} चयनित है। अगली कैंडल के लिए ${gated.direction} का सिग्नल मिल रहा है। कॉन्फिडेंस ${gated.confidence}% है। ट्रेड की गारंटी नहीं है।`;

  const fallbackEnglish =
    gated.direction === 'NO_CLEAR_SIGNAL'
      ? `No clear signal on ${defaultPairLabel}. Hold off until candle structure becomes clear.`
      : gated.recommendation === 'AVOID_TRADE'
        ? `Caution on ${defaultPairLabel}: reversal risk detected. Avoid trading right now.`
        : `${defaultPairLabel} (${detectedTimeframe}) shows ${gated.direction} bias at ${gated.confidence}% confidence. Manual confirmation required; no trade is guaranteed.`;

  return {
    isQuotexChartReadable,
    detectedAccountMode,
    detectedPair,
    detectedTimeframe,
    candleAnalysis: {
      lastCandleDirection: normalizeLastCandleDirection(raw.candleAnalysis?.lastCandleDirection),
      bodyStrength: String(raw.candleAnalysis?.bodyStrength ?? 'Not readable').trim().slice(0, 100),
      wicksNote: String(raw.candleAnalysis?.wicksNote ?? 'Not readable').trim().slice(0, 100),
      momentum: String(raw.candleAnalysis?.momentum ?? 'Unclear').trim().slice(0, 100),
      supportResistance: String(raw.candleAnalysis?.supportResistance ?? 'Not visible').trim().slice(0, 120),
    },
    direction: gated.direction,
    confidence: gated.confidence,
    recommendation: gated.recommendation,
    shortExplanation,
    spokenSummaryUrdu: String(raw.spokenSummaryUrdu ?? '').trim() || fallbackUrdu,
    spokenSummaryHindi: String(raw.spokenSummaryHindi ?? '').trim() || fallbackHindi,
    spokenSummaryEnglish: String(raw.spokenSummaryEnglish ?? '').trim() || fallbackEnglish,
    analyzedAt,
  };
}

export function computeFrameDiffRatio(
  prevPixels: Uint8ClampedArray | number[],
  nextPixels: Uint8ClampedArray | number[],
): number {
  const len = Math.min(prevPixels.length, nextPixels.length);
  if (len < 4) return 1;

  let totalDiff = 0;
  let samples = 0;
  // RGBA stride = 4; sample every pixel in downscaled thumbnail (e.g. 96x54)
  for (let i = 0; i + 2 < len; i += 4) {
    const lumaA = 0.299 * prevPixels[i] + 0.587 * prevPixels[i + 1] + 0.114 * prevPixels[i + 2];
    const lumaB = 0.299 * nextPixels[i] + 0.587 * nextPixels[i + 1] + 0.114 * nextPixels[i + 2];
    totalDiff += Math.abs(lumaA - lumaB) / 255;
    samples += 1;
  }

  return samples > 0 ? Number((totalDiff / samples).toFixed(4)) : 1;
}

export function shouldAnalyzeNewFrame(params: {
  emergencyStopped: boolean;
  isSharing: boolean;
  isAnalyzing: boolean;
  diffRatio: number;
  msSinceLastAnalyze: number;
  minIntervalMs?: number;
  periodicRefreshMs?: number;
}): boolean {
  if (params.emergencyStopped || !params.isSharing || params.isAnalyzing) {
    return false;
  }
  const minInterval = params.minIntervalMs ?? 3500;
  if (params.msSinceLastAnalyze < minInterval) {
    return false;
  }
  const periodicRefresh = params.periodicRefreshMs ?? 9000;
  return (
    params.diffRatio >= FRAME_CHANGE_DIFF_THRESHOLD ||
    params.msSinceLastAnalyze >= periodicRefresh
  );
}
