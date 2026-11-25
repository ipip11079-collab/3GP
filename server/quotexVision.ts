import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  normalizeQuotexVisionResponse,
  type RawQuotexVisionPayload,
} from '../src/lib/quotexVision.ts';
import type { AssistantLanguage, QuotexVisionSignal } from '../src/types/trading.ts';

function formatGeminiVisionError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: { message?: string; code?: number } };
    if (parsed?.error?.message) {
      return `Gemini Vision API error (${parsed.error.code ?? 'error'}): ${parsed.error.message}`;
    }
  } catch {
    // Plain text message
  }
  return raw;
}

function isTransientVisionError(err: unknown): boolean {
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

async function withTimeout<T>(fn: () => Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new Error(`Vision AI request timed out after ${ms}ms`));
    }, ms);
  });
  try {
    return await Promise.race([fn(), timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

export async function analyzeQuotexScreenFrame(params: {
  imageBase64: string;
  mimeType: string;
  language: AssistantLanguage;
}): Promise<QuotexVisionSignal> {
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

  const cleanBase64 = params.imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
  if (!cleanBase64 || cleanBase64.length < 100) {
    throw new Error('Captured frame is empty or invalid.');
  }

  const mimeType =
    params.mimeType === 'image/png' || params.mimeType === 'image/webp'
      ? params.mimeType
      : 'image/jpeg';

  const systemInstruction = `You are ISRAR AI — Live Quotex Visual Intelligence Assistant.
Analyze ONLY what is visibly shown inside this shared trading screen frame.
CRITICAL HONESTY & SAFETY RULES:
1. Never invent pairs, prices, balances, candlesticks, or confidence values.
2. If this screenshot does NOT show a readable candlestick trading chart (or text/candles are too blurry to read), you MUST set isQuotexChartReadable=false, detectedPair="UNKNOWN", detectedTimeframe="UNKNOWN", direction="NO_CLEAR_SIGNAL", confidence=0, recommendation="NO_CLEAR_SIGNAL".
3. Identify whether the visible UI shows DEMO account or LIVE account ("DEMO", "LIVE", or "UNKNOWN"). Never mix or confuse them.
4. Read the visible asset/pair name (for example "USD/INR", "EUR/USD (OTC)", "BTC/USD"), visible timeframe (especially "1m" / "1 minute"), candlestick direction, body size vs wicks, visible rejection/momentum, and support/resistance zones.
5. Only output direction "UP" or "DOWN" with confidence between 55 and 90 if the visible candles show clear structure; otherwise output "NO_CLEAR_SIGNAL" with confidence 0, or "AVOID_TRADE" if strong reversal/chop risk appears.
6. Write spokenSummaryUrdu (natural conversational Urdu addressing "Israr Bhai", e.g., "Israr Bhai, aapki screen par USD/INR selected hai. Agali candle ke liye DOWN ka signal mil raha hai. Confidence 72% hai. Trade ki guarantee nahi hai." or "Israr Bhai, abhi market reversal ka signal de rahi hai. Filhal trade avoid karein."), spokenSummaryHindi (natural Hindi addressing "इसरार भाई"), and spokenSummaryEnglish — never guaranteeing profits.`;

  const promptText = `Inspect this shared Quotex / trading screen image carefully (preferred language: ${params.language}). Return structured JSON only.`;

  const schema = {
    type: Type.OBJECT,
    properties: {
      isQuotexChartReadable: { type: Type.BOOLEAN },
      detectedAccountMode: { type: Type.STRING, enum: ['DEMO', 'LIVE', 'UNKNOWN'] },
      detectedPair: { type: Type.STRING },
      detectedTimeframe: { type: Type.STRING },
      candleAnalysis: {
        type: Type.OBJECT,
        properties: {
          lastCandleDirection: {
            type: Type.STRING,
            enum: ['BULLISH', 'BEARISH', 'DOJI', 'UNKNOWN'],
          },
          bodyStrength: { type: Type.STRING },
          wicksNote: { type: Type.STRING },
          momentum: { type: Type.STRING },
          supportResistance: { type: Type.STRING },
        },
        required: [
          'lastCandleDirection',
          'bodyStrength',
          'wicksNote',
          'momentum',
          'supportResistance',
        ],
      },
      direction: { type: Type.STRING, enum: ['UP', 'DOWN', 'NO_CLEAR_SIGNAL'] },
      confidence: { type: Type.NUMBER },
      recommendation: {
        type: Type.STRING,
        enum: ['TRADE', 'AVOID_TRADE', 'NO_CLEAR_SIGNAL'],
      },
      shortExplanation: { type: Type.STRING },
      spokenSummaryUrdu: { type: Type.STRING },
      spokenSummaryHindi: { type: Type.STRING },
      spokenSummaryEnglish: { type: Type.STRING },
    },
    required: [
      'isQuotexChartReadable',
      'detectedAccountMode',
      'detectedPair',
      'detectedTimeframe',
      'candleAnalysis',
      'direction',
      'confidence',
      'recommendation',
      'shortExplanation',
      'spokenSummaryUrdu',
      'spokenSummaryHindi',
      'spokenSummaryEnglish',
    ],
  };

  const modelsToTry: Array<{ model: string; thinkingLevel: ThinkingLevel }> = [
    { model: 'gemini-3.1-flash-lite', thinkingLevel: ThinkingLevel.MINIMAL },
    { model: 'gemini-4-hydrogen', thinkingLevel: ThinkingLevel.LOW },
  ];

  let lastError: unknown = null;

  for (const candidate of modelsToTry) {
    try {
      const response = await withTimeout(
        () =>
          ai.models.generateContent({
            model: candidate.model,
            contents: {
              parts: [
                {
                  inlineData: {
                    mimeType,
                    data: cleanBase64,
                  },
                },
                { text: promptText },
              ],
            },
            config: {
              systemInstruction,
              thinkingConfig: { thinkingLevel: candidate.thinkingLevel },
              responseMimeType: 'application/json',
              responseSchema: schema,
            },
          }),
        22_000,
      );

      const text = response.text;
      if (!text) {
        throw new Error(`Empty response from ${candidate.model}`);
      }
      const parsed = JSON.parse(text) as RawQuotexVisionPayload;
      return normalizeQuotexVisionResponse(parsed, Date.now());
    } catch (err) {
      lastError = err;
      if (!isTransientVisionError(err)) {
        break;
      }
    }
  }

  throw new Error(formatGeminiVisionError(lastError));
}
