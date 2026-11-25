import { useState } from 'react';
import {
  BrainCircuit,
  Lock,
  MessageSquare,
  Mic,
  Send,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type {
  AssistantLanguage,
  AssistantResponse,
  LearningProfile,
  MarketMode,
  PredictionResult,
  Timeframe,
  TradingPair,
} from '../types/trading.ts';
import {
  isSpeechRecognitionSupported,
  languageToBcp47,
  speakText,
  stopSpeaking,
} from '../utils/voiceAssistant.ts';

interface LearningAndVoicePanelProps {
  learning: LearningProfile | null;
  language: AssistantLanguage;
  onChangeLanguage: (lang: AssistantLanguage) => void;
  activePair: TradingPair;
  market: MarketMode;
  timeframe: Timeframe;
  activePrediction: PredictionResult | null;
  voiceEnabled: boolean;
}

const QUICK_PROMPTS: Record<AssistantLanguage, string[]> = {
  en: [
    'Which OTC pair is strongest?',
    'What is the next candle prediction?',
    'Why is the signal UP or DOWN?',
    'Show my last 20 signals',
    "Explain today's accuracy",
    'Is the market safe to analyze?',
  ],
  ur: [
    'سب سے مضبوط OTC پیئر کون سا ہے؟',
    'اگلی کینڈل کی پیش گوئی کیا ہے؟',
    'آج کی درستگی (accuracy) بتائیں',
    'کیا مارکیٹ محفوظ ہے؟',
  ],
  hi: [
    'सबसे मजबूत OTC पेयर कौन सा है?',
    'अगली कैंडल की भविष्यवाणी क्या है?',
    'आज की एक्यूरेसी समझाएं',
    'क्या मार्केट विश्लेषण के लिए सुरक्षित है?',
  ],
};

export function LearningAndVoicePanel({
  learning,
  language,
  onChangeLanguage,
  activePair,
  market,
  timeframe,
  activePrediction,
  voiceEnabled,
}: LearningAndVoicePanelProps) {
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [listening, setListening] = useState(false);
  const [response, setResponse] = useState<AssistantResponse | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const sttSupported = isSpeechRecognitionSupported();

  const submitQuestion = async (qText: string) => {
    const clean = qText.trim();
    if (!clean) return;
    setAsking(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/assistant/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          language,
          question: clean,
          activePairId: activePair.id,
          market,
          timeframe,
          latestPrediction: activePrediction
            ? {
                direction: activePrediction.direction,
                confidence: activePrediction.confidence,
                reasoning: activePrediction.reasoning,
              }
            : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Assistant could not process request.');
      }
      const typed = data as AssistantResponse;
      setResponse(typed);
      setQuestion('');
      if (voiceEnabled) {
        speakText(typed.spokenText, true, undefined, undefined, language);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Assistant unavailable.');
    } finally {
      setAsking(false);
    }
  };

  const handleVoiceMic = () => {
    if (!sttSupported) return;
    const w = window as unknown as {
      SpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
      webkitSpeechRecognition?: new () => {
        lang: string;
        interimResults: boolean;
        onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void;
        onerror: () => void;
        onend: () => void;
        start: () => void;
      };
    };
    const Rec = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Rec) return;

    try {
      const recognition = new Rec();
      recognition.lang = languageToBcp47(language);
      recognition.interimResults = false;
      setListening(true);
      recognition.onresult = (event) => {
        const transcript = event.results[0]?.[0]?.transcript ?? '';
        if (transcript.trim()) {
          setQuestion(transcript);
          void submitQuestion(transcript);
        }
      };
      recognition.onerror = () => setListening(false);
      recognition.onend = () => setListening(false);
      recognition.start();
    } catch {
      setListening(false);
    }
  };

  return (
    <section
      aria-label="Self-Learning Intelligence and Multilingual Voice Assistant"
      data-testid="learning-voice-panel"
      className="grid grid-cols-1 gap-4 lg:grid-cols-12"
    >
      {/* 1. SELF-LEARNING INTELLIGENCE DATABASE */}
      <div className="neon-panel rounded-2xl p-4 lg:col-span-5 flex flex-col justify-between gap-3">
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <BrainCircuit className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-white">
                Self-Learning Intelligence DB
              </h3>
            </div>
            <span className="inline-flex items-center gap-1 rounded border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-300">
              <Lock className="h-3 w-3" aria-hidden="true" />
              Settings Protected
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-sky-500/20 bg-[#040B19] p-2.5 text-center font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-400">Settled</div>
              <div className="text-sm font-bold text-white">
                {learning?.totalSettled ?? 0}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Win Rate</div>
              <div className="text-sm font-bold text-emerald-400">
                {learning?.overallWinRatePct !== null && learning?.overallWinRatePct !== undefined
                  ? `${learning.overallWinRatePct}%`
                  : 'N/A'}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">AI Bias Adj</div>
              <div className="text-sm font-bold text-sky-300">
                {learning && learning.advisoryAdjustment !== 0
                  ? `${learning.advisoryAdjustment > 0 ? '+' : ''}${learning.advisoryAdjustment}%`
                  : '0%'}
              </div>
            </div>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="rounded-xl border border-emerald-500/25 bg-emerald-950/20 p-2.5">
              <div className="mb-1 font-mono text-[10px] font-bold uppercase text-emerald-300">
                Detected Strengths
              </div>
              <ul className="space-y-1 text-[11px] text-slate-200">
                {(learning?.strengths ?? ['Collecting verified settlements...']).map((s, i) => (
                  <li key={i}>• {s}</li>
                ))}
              </ul>
            </div>

            <div className="rounded-xl border border-amber-500/25 bg-amber-950/20 p-2.5">
              <div className="mb-1 font-mono text-[10px] font-bold uppercase text-amber-300">
                Detected Weaknesses / Caution
              </div>
              <ul className="space-y-1 text-[11px] text-slate-200">
                {(learning?.weaknesses ?? ['None recorded yet.']).map((w, i) => (
                  <li key={i}>• {w}</li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <p className="text-[11px] text-slate-400">
          Learns from every candle open/close &amp; SMC combo automatically. Never alters owner-locked settings.
        </p>
      </div>

      {/* 2. MULTILINGUAL VOICE AI ASSISTANT (ENGLISH / URDU / HINDI) */}
      <div className="neon-panel rounded-2xl p-4 lg:col-span-7 flex flex-col justify-between gap-3">
        <div>
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-white">
                Multilingual Voice AI Assistant (Urdu · Hindi · English)
              </h3>
            </div>

            <div className="flex items-center gap-1" role="group" aria-label="Assistant Language">
              {(
                [
                  { id: 'en', label: 'English' },
                  { id: 'ur', label: 'اردو' },
                  { id: 'hi', label: 'हिन्दी' },
                ] as const
              ).map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onChangeLanguage(item.id)}
                  className={`min-h-[34px] rounded-lg border px-2.5 text-xs font-bold cursor-pointer ${
                    language === item.id
                      ? 'border-sky-400 bg-sky-500/25 text-white'
                      : 'border-slate-700 bg-slate-900/70 text-slate-400 hover:text-white'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Quick Question Chips */}
          <div className="mb-3 flex flex-wrap gap-1.5">
            {QUICK_PROMPTS[language].map((prompt) => (
              <button
                key={prompt}
                type="button"
                disabled={asking}
                onClick={() => void submitQuestion(prompt)}
                className="min-h-[34px] rounded-lg border border-sky-500/30 bg-[#050E22] px-2.5 py-1 text-[11px] font-medium text-sky-200 hover:border-sky-400 hover:text-white disabled:opacity-50 cursor-pointer"
              >
                {prompt}
              </button>
            ))}
          </div>

          {/* Assistant Grounded Output Box */}
          <div className="rounded-xl border border-sky-500/25 bg-[#040B19] p-3 min-h-[110px]">
            {asking ? (
              <p className="text-xs text-sky-300 font-mono">
                Querying live verified market state &amp; accuracy database...
              </p>
            ) : errorMsg ? (
              <p className="text-xs text-rose-300">{errorMsg}</p>
            ) : response ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span className="truncate">Q: {response.question}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => speakText(response.spokenText, true, undefined, undefined, response.language)}
                      aria-label="Speak Reply"
                      className="rounded border border-sky-500/40 bg-sky-500/15 px-2 py-0.5 text-[10px] font-bold text-sky-200 hover:bg-sky-500/25 cursor-pointer flex items-center gap-1"
                    >
                      <Volume2 className="h-3 w-3" />
                      <span>Speak</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => stopSpeaking()}
                      aria-label="Stop Speaking"
                      className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-[10px] text-slate-300 hover:text-white cursor-pointer flex items-center gap-1"
                    >
                      <VolumeX className="h-3 w-3" />
                    </button>
                  </div>
                </div>
                <p
                  dir={response.language === 'ur' ? 'rtl' : 'ltr'}
                  className="text-sm text-white leading-relaxed"
                >
                  {response.answer}
                </p>
                <div className="flex flex-wrap gap-2 text-[10px] font-mono text-slate-400">
                  {response.groundedFactsUsed.map((fact, idx) => (
                    <span key={idx}>· {fact}</span>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-xs text-slate-400">
                Ask about strongest OTC pair, next candle prediction, reasoning, last 20 signals, today&apos;s verified accuracy, or market safety in English, Urdu, or Hindi.
              </p>
            )}
          </div>
        </div>

        {/* Input + Mic Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submitQuestion(question);
          }}
          className="flex items-center gap-2"
        >
          {sttSupported && (
            <button
              type="button"
              onClick={handleVoiceMic}
              aria-label="Speak Question"
              className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border cursor-pointer ${
                listening
                  ? 'border-emerald-400 bg-emerald-500/25 text-emerald-200'
                  : 'border-sky-500/40 bg-[#050E22] text-sky-300 hover:border-sky-400'
              }`}
            >
              <Mic className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={
              language === 'ur'
                ? 'اپنا سوال لکھیں یا مائیک استعمال کریں...'
                : language === 'hi'
                  ? 'अपना सवाल लिखें या माइक का उपयोग करें...'
                  : 'Ask 3GP Assistant (e.g. Which OTC pair is strongest?)...'
            }
            aria-label="Ask Multilingual AI Assistant"
            className="min-h-[44px] flex-1 rounded-xl border border-sky-500/40 bg-[#030712] px-3.5 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-4 text-xs font-extrabold text-slate-950 disabled:opacity-45 cursor-pointer whitespace-nowrap"
          >
            <Send className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Ask</span>
          </button>
        </form>
      </div>
    </section>
  );
}
