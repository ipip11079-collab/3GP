import type {
  AssistantLanguage,
  MarketMode,
  QuotexAccountMode,
  QuotexVisionSignal,
  SignalDirection,
} from '../types/trading.ts';

export function isSpeechSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

export function isSpeechRecognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as {
    SpeechRecognition?: unknown;
    webkitSpeechRecognition?: unknown;
  };
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export function languageToBcp47(lang: AssistantLanguage): string {
  if (lang === 'ur') return 'ur-PK';
  if (lang === 'hi') return 'hi-IN';
  return 'en-US';
}

export function stopSpeaking(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // Ignore speech synthesis cancellation errors on older Android WebViews
  }
}

export function speakText(
  text: string,
  enabled: boolean,
  onStart?: () => void,
  onEnd?: () => void,
  language: AssistantLanguage = 'en',
): void {
  if (!enabled || !isSpeechSupported() || !text.trim()) {
    onEnd?.();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = languageToBcp47(language);
    utterance.onstart = () => onStart?.();
    utterance.onend = () => onEnd?.();
    utterance.onerror = () => onEnd?.();
    window.speechSynthesis.speak(utterance);
  } catch {
    onEnd?.();
  }
}

export function buildPairSelectedSpeech(
  pairSymbol: string,
  market: MarketMode,
  language: AssistantLanguage = 'en',
): string {
  const marketLabel = market === 'OTC' ? 'OTC' : 'live';
  if (language === 'ur') {
    return `السلام علیکم! میں آپ کا 3GP ٹریڈنگ اسسٹنٹ ہوں۔ ${marketLabel} پیئر ${pairSymbol} تیار ہے۔ میں اگلی کینڈل کا تجزیہ کر رہا ہوں۔`;
  }
  if (language === 'hi') {
    return `नमस्ते! मैं आपका 3GP ट्रेडिंग असिस्टेंट हूँ। ${marketLabel} पेयर ${pairSymbol} तैयार है। मैं अगली कैंडल का विश्लेषण कर रहा हूँ।`;
  }
  return `Hello! I am your 3GP Trading Assistant. Your selected ${marketLabel} pair ${pairSymbol} is ready. I am analyzing the next candle. Please wait for confirmation.`;
}

export function buildPredictionSpeech(
  direction: SignalDirection,
  confidence: number,
  language: AssistantLanguage = 'en',
): string {
  if (language === 'ur') {
    if (direction === 'NO_TRADE') {
      return 'فی الحال کوئی ٹریڈ سگنل نہیں ہے۔ تصدیق کا انتظار کریں۔';
    }
    const dirUr = direction === 'UP' ? 'اوپر یعنی اپ' : 'نیچے یعنی ڈاؤن';
    return `اگلی کینڈل کی پیش گوئی ${dirUr} ہے۔ اعتماد ${confidence} فیصد ہے۔`;
  }
  if (language === 'hi') {
    if (direction === 'NO_TRADE') {
      return 'अभी कोई ट्रेड सिग्नल नहीं है। कन्फर्मेशन का इंतज़ार करें।';
    }
    const dirHi = direction === 'UP' ? 'ऊपर यानी अप' : 'नीचे यानी डाउन';
    return `अगली कैंडल का अनुमान ${dirHi} है। कॉन्फिडेंस ${confidence} प्रतिशत है।`;
  }
  if (direction === 'NO_TRADE') {
    return 'No trade signal. Insufficient confirmation. Please wait for the next candle setup.';
  }
  return `The next candle prediction is ${direction}. Confidence: ${confidence} percent.`;
}

export function buildQuotexVisionPairSpeech(
  pair: string,
  accountMode: QuotexAccountMode,
  language: AssistantLanguage = 'ur',
): string {
  const cleanPair = pair !== 'UNKNOWN' ? pair : 'Quotex chart';
  const modeNote =
    accountMode === 'DEMO'
      ? 'Demo account'
      : accountMode === 'LIVE'
        ? 'Live account'
        : '';

  if (language === 'hi') {
    return `इसरार भाई, आपकी स्क्रीन पर ${cleanPair}${modeNote ? ` (${modeNote})` : ''} चयनित है। मैं अभी चार्ट का विश्लेषण कर रहा हूँ।`;
  }
  if (language === 'en') {
    return `Israr Bhai, ${cleanPair}${modeNote ? ` on ${modeNote}` : ''} is visible on your screen. I am analyzing the chart now.`;
  }
  return `Israr Bhai, aapki screen par ${cleanPair}${modeNote ? ` (${modeNote})` : ''} selected hai. Main abhi chart analyze kar raha hoon.`;
}

export function buildQuotexVisionSignalSpeech(
  signal: QuotexVisionSignal,
  language: AssistantLanguage = 'ur',
): string {
  if (language === 'hi') {
    return signal.spokenSummaryHindi;
  }
  if (language === 'en') {
    return signal.spokenSummaryEnglish;
  }
  return signal.spokenSummaryUrdu;
}

