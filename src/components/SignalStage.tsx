import { useEffect, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  Crown,
  OctagonAlert,
  PauseCircle,
  RefreshCw,
  ShieldAlert,
  WifiOff,
} from 'lucide-react';
import { getTimeframeSeconds } from '../lib/pairs.ts';
import type {
  LiveMonitorTick,
  MarketMode,
  PredictionResult,
  Timeframe,
  TradingPair,
} from '../types/trading.ts';

export interface LoadingStepState {
  stepIndex: number;
  label: string;
  waitMsRemaining: number;
}

interface SignalStageProps {
  market: MarketMode;
  pair: TradingPair;
  timeframe: Timeframe;
  isAnalyzing: boolean;
  loadingState: LoadingStepState | null;
  prediction: PredictionResult | null;
  errorMessage: string | null;
  liveQuotePrice: number | null;
  liveMonitor: LiveMonitorTick | null;
  emergencyStopped: boolean;
  birthdayTheme?: boolean;
  autoSelectedNotice?: string | null;
  onStartAnalysis: () => void;
  onResumeSystem: () => void;
}

const ANALYSIS_STEPS = [
  'Connecting to genuine live market feed',
  'Retrieving real-time price, candles & liquidity',
  'Analyzing 18-method SMC, EMA 9/21/50 & momentum',
  'Awaiting candle-close confirmation',
  'Synthesizing next-candle probabilities',
];

function formatCountdownMs(ms: number): string {
  const sec = Math.max(0, Math.ceil(ms / 1000));
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}m ${String(s).padStart(2, '0')}s`;
}

function formatTimeHMS(epochMs: number): string {
  return new Date(epochMs).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

export function SignalStage({
  market,
  pair,
  timeframe,
  isAnalyzing,
  loadingState,
  prediction,
  errorMessage,
  liveQuotePrice,
  liveMonitor,
  emergencyStopped,
  birthdayTheme = false,
  autoSelectedNotice,
  onStartAnalysis,
  onResumeSystem,
}: SignalStageProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const expiryRemainingMs = prediction
    ? Math.max(0, prediction.expiryTime - nowMs)
    : 0;
  const bucketMs = getTimeframeSeconds(timeframe) * 1000;
  const activeCandleOpenMs = Math.floor(nowMs / bucketMs) * bucketMs;
  const activeCandleCloseMs = Math.max(0, bucketMs - (nowMs % bucketMs));
  const nextCandleOpenMs = activeCandleOpenMs + bucketMs;
  const nextCandleCloseMs = nextCandleOpenMs + bucketMs - 1;

  const isDisconnected = liveMonitor?.dataStatus === 'DATA_DISCONNECTED';
  const displayPrice = liveMonitor?.price ?? liveQuotePrice;

  return (
    <section
      aria-label="Central AI Signal Display"
      data-testid="signal-stage"
      data-state={
        emergencyStopped
          ? 'stopped'
          : isAnalyzing
            ? 'analyzing'
            : errorMessage
              ? 'error'
              : prediction
                ? prediction.direction.toLowerCase()
                : 'ready'
      }
      className="stage-3d-grid neon-panel relative flex min-h-[320px] flex-col justify-between overflow-hidden rounded-2xl p-3.5 sm:p-4"
    >
      {/* Top Context Bar inside Stage */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2.5 text-xs">
        <div className="flex flex-wrap items-center gap-2 text-sky-200">
          <span className="font-display text-sm sm:text-base font-bold text-white">
            {pair.symbol}
          </span>
          <span aria-hidden="true" className="text-sky-500">·</span>
          <span className="font-semibold text-sky-300">{market} MARKET</span>
          <span aria-hidden="true" className="text-sky-500">·</span>
          <span className="font-mono font-semibold text-sky-200">{timeframe}</span>
          {birthdayTheme && (
            <span className="rounded-md border border-pink-400/50 bg-pink-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-pink-200">
              SAM&apos;S PARTY MODE
            </span>
          )}
          {autoSelectedNotice && (
            <span className="rounded-md border border-emerald-400/50 bg-emerald-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-300">
              {autoSelectedNotice}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3 font-mono tabular-nums text-xs text-slate-300">
          <span>
            Close:{' '}
            <strong className="text-amber-300">
              {formatCountdownMs(activeCandleCloseMs)}
            </strong>
          </span>
          {displayPrice !== null && (
            <span>
              Spot:{' '}
              <strong className="text-white">
                {displayPrice.toFixed(pair.precision)}
              </strong>
            </span>
          )}
        </div>
      </div>

      {/* 1-Second Live Monitor Strip (Explicitly Non-Finalized Forming Candle Telemetry) */}
      <div
        data-testid="live-1s-monitor"
        className={`relative z-10 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-1.5 text-[11px] font-mono tabular-nums ${
          isDisconnected
            ? 'border-rose-500/60 bg-rose-950/60 text-rose-200'
            : liveMonitor?.suddenVolatility
              ? 'border-amber-400/60 bg-amber-950/40 text-amber-200'
              : 'border-sky-500/25 bg-[#040B1A]/90 text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isDisconnected ? (
            <>
              <WifiOff className="h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
              <span className="font-bold text-rose-300">DATA DISCONNECTED</span>
            </>
          ) : (
            <>
              <Activity className="h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
              <span className="font-semibold text-emerald-300">
                1s Live Monitor · {liveMonitor?.dataStatus ?? 'SYNCING'}
              </span>
            </>
          )}
          <span className="hidden sm:inline text-slate-400">
            · Window {formatTimeHMS(activeCandleOpenMs)}→{formatTimeHMS(activeCandleOpenMs + bucketMs)} (Forming)
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {liveMonitor && !isDisconnected && (
            <>
              <span>
                1s Edge:{' '}
                <strong className="text-emerald-400">UP {liveMonitor.liveUpProb}%</strong>
                {' / '}
                <strong className="text-rose-400">DN {liveMonitor.liveDownProb}%</strong>
              </span>
              {liveMonitor.suddenVolatility && (
                <span className="text-amber-300 font-bold">VOLATILITY SPIKE</span>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Central Visual Anchor */}
      <div className="relative z-10 my-auto flex flex-col items-center justify-center py-3 text-center">
        {emergencyStopped ? (
          <div className="flex max-w-md flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border-2 border-rose-500/70 bg-rose-950/50 shadow-[0_0_28px_rgba(244,63,94,0.3)]">
              <OctagonAlert className="h-10 w-10 text-rose-400" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-extrabold text-white">
              EMERGENCY STOP ACTIVE
            </h2>
            <p className="mt-2 text-xs sm:text-sm text-rose-200/90 leading-relaxed">
              1-second monitoring, automated AI agent, auto signal board, voice alerts, and demo execution are halted for safety.
            </p>
            <button
              type="button"
              onClick={onResumeSystem}
              className="mt-4 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-emerald-400/70 bg-emerald-500/20 px-5 py-2.5 text-sm font-bold text-emerald-100 hover:bg-emerald-500/30 cursor-pointer"
            >
              Resume 3GP System
            </button>
          </div>
        ) : isAnalyzing ? (
          /* Animated AI Loading Screen */
          <div className="flex w-full max-w-lg flex-col items-center">
            <div className="relative mb-5 flex h-40 w-40 items-center justify-center">
              <div className="absolute inset-0 rounded-full border-2 border-sky-400/30 border-t-sky-400 animate-orbit-slow" />
              <div className="absolute inset-4 rounded-full border-2 border-cyan-300/25 border-b-cyan-300 animate-orbit-reverse" />
              <div className="absolute inset-9 rounded-full border border-sky-500/40 bg-sky-950/50 shadow-[0_0_36px_rgba(14,165,233,0.45)] flex flex-col items-center justify-center">
                <Crown className="h-7 w-7 text-amber-400 mb-1" aria-hidden="true" />
                <span className="font-mono text-xs font-bold text-sky-200 tabular-nums">
                  {loadingState && loadingState.waitMsRemaining > 0
                    ? `${(loadingState.waitMsRemaining / 1000).toFixed(1)}s`
                    : 'AI SYNC'}
                </span>
              </div>
            </div>

            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-tight text-white">
              Analyzing Next {timeframe} Candle
            </h2>
            <p className="mt-1 text-xs sm:text-sm text-sky-200/90">
              {loadingState?.label ?? ANALYSIS_STEPS[0]}
            </p>

            <ol className="mt-4 w-full space-y-1.5 text-left">
              {ANALYSIS_STEPS.map((step, idx) => {
                const currentIdx = loadingState?.stepIndex ?? 0;
                const done = idx < currentIdx;
                const active = idx === currentIdx;
                return (
                  <li
                    key={step}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-1.5 text-xs transition-colors ${
                      active
                        ? 'bg-sky-500/15 text-sky-100 border border-sky-400/40'
                        : done
                          ? 'text-emerald-300/90'
                          : 'text-slate-500'
                    }`}
                  >
                    <span
                      className={`h-2 w-2 shrink-0 rounded-full ${
                        done
                          ? 'bg-emerald-400'
                          : active
                            ? 'bg-sky-400'
                            : 'bg-slate-700'
                      }`}
                    />
                    <span className="truncate">{step}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        ) : errorMessage ? (
          /* Safe Connection Failure State */
          <div className="flex max-w-md flex-col items-center">
            <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-2xl border border-rose-500/50 bg-rose-950/40 shadow-[0_0_28px_rgba(244,63,94,0.25)]">
              <AlertTriangle className="h-10 w-10 text-rose-400" aria-hidden="true" />
            </div>
            <h2 className="font-display text-xl sm:text-2xl font-bold text-white">
              Connection Unavailable — No Signal Issued
            </h2>
            <p className="mt-2 text-sm text-rose-200/90 leading-relaxed">
              {errorMessage}
            </p>
            <button
              type="button"
              onClick={onStartAnalysis}
              className="mt-5 inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-400/70 bg-sky-500/20 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-500/30 cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              <span>Retry Live Analysis</span>
            </button>
          </div>
        ) : !prediction ? (
          /* Ready / Standby State */
          <div className="flex max-w-md flex-col items-center">
            <div className="mb-5 flex h-28 w-28 items-center justify-center rounded-full border border-sky-400/40 bg-sky-950/30 shadow-[0_0_40px_rgba(14,165,233,0.28)]">
              <Crown className="h-12 w-12 text-amber-400" aria-hidden="true" />
            </div>
            <h2 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
              Ready for Next Candle Analysis
            </h2>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed">
              Select market, currency pair, and timeframe to verify 18-method SMC structure, liquidity, and candle-close confirmation.
            </p>
            <button
              type="button"
              onClick={onStartAnalysis}
              className="mt-6 inline-flex min-h-[48px] items-center gap-2 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-7 py-3 font-display text-base font-extrabold text-slate-950 shadow-[0_0_24px_rgba(34,197,94,0.45)] transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              Start Analysis
            </button>
          </div>
        ) : prediction.direction === 'UP' ? (
          /* GIANT GREEN UP ARROW */
          <div className="flex w-full flex-col items-center">
            <div className="relative flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 w-full">
              <div className="relative flex flex-col items-center">
                <svg
                  viewBox="0 0 220 230"
                  className="h-40 w-40 sm:h-48 sm:w-48 animate-arrow-up"
                  role="img"
                  aria-label="Giant Green Up Arrow"
                >
                  <defs>
                    <linearGradient id="upArrowBody" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#86EFAC" />
                      <stop offset="45%" stopColor="#22C55E" />
                      <stop offset="100%" stopColor="#15803D" />
                    </linearGradient>
                    <linearGradient id="upArrowEdge" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="100%" stopColor="#4ADE80" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="110" cy="208" rx="72" ry="13" fill="none" stroke="#22C55E" strokeOpacity="0.65" strokeWidth="3" />
                  <ellipse cx="110" cy="208" rx="46" ry="7" fill="#22C55E" fillOpacity="0.22" />
                  <path
                    d="M 110 18 L 194 106 L 146 106 L 146 196 L 74 196 L 74 106 L 26 106 Z"
                    fill="url(#upArrowBody)"
                    stroke="url(#upArrowEdge)"
                    strokeWidth="5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 110 30 L 110 190 L 82 190 L 82 98 L 44 98 Z"
                    fill="#FFFFFF"
                    fillOpacity="0.16"
                  />
                </svg>
              </div>

              <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-md">
                <div className="w-full rounded-2xl border-2 border-emerald-400/80 bg-gradient-to-r from-emerald-950/90 via-green-900/75 to-emerald-950/90 px-5 py-3.5 shadow-[0_0_32px_rgba(34,197,94,0.35)]">
                  <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                    UP – NEXT CANDLE
                  </h2>
                </div>

                <div className="mt-4 grid w-full grid-cols-2 gap-3">
                  <div className="rounded-xl border border-emerald-500/40 bg-[#051510]/90 px-4 py-3 text-center">
                    <div className="text-xs font-medium text-emerald-200/80">
                      Confidence
                    </div>
                    <div className="mt-0.5 font-display text-3xl sm:text-4xl font-extrabold text-emerald-400 tabular-nums">
                      {prediction.confidence}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-500/40 bg-[#071126]/90 px-4 py-3 text-center flex flex-col items-center justify-center">
                    <div className="text-xs font-medium text-sky-200/80">
                      Predicted By
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-display text-lg font-extrabold text-amber-300">
                      <Crown className="h-4 w-4 text-amber-400" aria-hidden="true" />
                      <span>3GP AI</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 w-full">
                  <div className="mb-1 text-[11px] font-mono font-bold uppercase tracking-wider text-emerald-300">
                    Why UP · Bullish Edge
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300 text-left">
                    {prediction.reasoning.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" aria-hidden="true" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : prediction.direction === 'DOWN' ? (
          /* GIANT RED DOWN ARROW */
          <div className="flex w-full flex-col items-center">
            <div className="relative flex flex-col md:flex-row items-center justify-center gap-6 md:gap-10 w-full">
              <div className="relative flex flex-col items-center">
                <svg
                  viewBox="0 0 220 230"
                  className="h-40 w-40 sm:h-48 sm:w-48 animate-arrow-down"
                  role="img"
                  aria-label="Giant Red Down Arrow"
                >
                  <defs>
                    <linearGradient id="downArrowBody" x1="0%" y1="0%" x2="100%" y2="100%">
                      <stop offset="0%" stopColor="#FCA5A5" />
                      <stop offset="45%" stopColor="#EF4444" />
                      <stop offset="100%" stopColor="#991B1B" />
                    </linearGradient>
                    <linearGradient id="downArrowEdge" x1="0%" y1="0%" x2="0%" y2="100%">
                      <stop offset="0%" stopColor="#FFFFFF" />
                      <stop offset="100%" stopColor="#F87171" />
                    </linearGradient>
                  </defs>
                  <ellipse cx="110" cy="212" rx="72" ry="13" fill="none" stroke="#EF4444" strokeOpacity="0.65" strokeWidth="3" />
                  <ellipse cx="110" cy="212" rx="46" ry="7" fill="#EF4444" fillOpacity="0.22" />
                  <path
                    d="M 74 18 L 146 18 L 146 114 L 194 114 L 110 202 L 26 114 L 74 114 Z"
                    fill="url(#downArrowBody)"
                    stroke="url(#downArrowEdge)"
                    strokeWidth="5"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M 82 26 L 110 26 L 110 190 L 44 122 L 82 122 Z"
                    fill="#FFFFFF"
                    fillOpacity="0.16"
                  />
                </svg>
              </div>

              <div className="flex flex-col items-center md:items-start text-center md:text-left max-w-md">
                <div className="w-full rounded-2xl border-2 border-rose-400/80 bg-gradient-to-r from-rose-950/90 via-red-900/75 to-rose-950/90 px-5 py-3.5 shadow-[0_0_32px_rgba(239,68,68,0.35)]">
                  <h2 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
                    DOWN – NEXT CANDLE
                  </h2>
                </div>

                <div className="mt-4 grid w-full grid-cols-2 gap-3">
                  <div className="rounded-xl border border-rose-500/40 bg-[#1B070B]/90 px-4 py-3 text-center">
                    <div className="text-xs font-medium text-rose-200/80">
                      Confidence
                    </div>
                    <div className="mt-0.5 font-display text-3xl sm:text-4xl font-extrabold text-rose-400 tabular-nums">
                      {prediction.confidence}%
                    </div>
                  </div>
                  <div className="rounded-xl border border-sky-500/40 bg-[#071126]/90 px-4 py-3 text-center flex flex-col items-center justify-center">
                    <div className="text-xs font-medium text-sky-200/80">
                      Predicted By
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 font-display text-lg font-extrabold text-amber-300">
                      <Crown className="h-4 w-4 text-amber-400" aria-hidden="true" />
                      <span>3GP AI</span>
                    </div>
                  </div>
                </div>

                <div className="mt-3 w-full">
                  <div className="mb-1 text-[11px] font-mono font-bold uppercase tracking-wider text-rose-300">
                    Why DOWN · Bearish Edge
                  </div>
                  <ul className="space-y-1 text-xs text-slate-300 text-left">
                    {prediction.reasoning.map((reason, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-rose-400" aria-hidden="true" />
                        <span>{reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        ) : (
          /* NO TRADE – WAIT FOR CONFIRMATION */
          <div className="flex max-w-lg flex-col items-center">
            <div className="mb-4 flex h-28 w-28 items-center justify-center rounded-full border-2 border-amber-400/70 bg-amber-950/30 shadow-[0_0_32px_rgba(245,158,11,0.3)]">
              <PauseCircle className="h-14 w-14 text-amber-400" aria-hidden="true" />
            </div>
            <div className="rounded-2xl border-2 border-amber-400/70 bg-amber-950/40 px-6 py-3.5">
              <h2 className="font-display text-xl sm:text-3xl font-extrabold tracking-tight text-amber-100">
                NO TRADE – WAIT FOR CONFIRMATION.
              </h2>
            </div>
            <p className="mt-3 text-sm text-slate-300">
              {prediction.confidence > 0
                ? `Signal confidence (${prediction.confidence}%) did not meet the required confirmation threshold.`
                : 'Market structure or tick density did not meet minimum data sufficiency requirements.'}
            </p>
            <div className="mt-3 max-w-md text-left">
              <div className="mb-1 text-center text-[11px] font-mono font-bold uppercase tracking-wider text-amber-300">
                Why WAIT · Signal Withheld
              </div>
              <ul className="space-y-1 text-xs text-slate-300">
                {prediction.reasoning.map((reason, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <ShieldAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Signal Generation Engine Confirmation Strip */}
      {prediction && !isAnalyzing && !errorMessage && !emergencyStopped && (
        <div className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-sky-500/35 bg-[#050D1E]/95 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2">
            <CheckCircle2
              className={`h-4 w-4 shrink-0 ${
                prediction.direction === 'UP'
                  ? 'text-emerald-400'
                  : prediction.direction === 'DOWN'
                    ? 'text-rose-400'
                    : 'text-amber-400'
              }`}
              aria-hidden="true"
            />
            <span className="font-semibold text-white">
              {prediction.duplicatePrevented
                ? 'Candle Signal Locked (No Duplicate)'
                : prediction.recordedForVerification
                  ? 'Recorded for Candle Verification'
                  : 'Withheld by Safety Gate'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3.5 font-mono tabular-nums text-slate-200">
            <span>
              Obs Entry:{' '}
              <strong className="text-white">
                {prediction.entryPrice.toFixed(prediction.precision)}
              </strong>
            </span>
            <span>
              Next Candle:{' '}
              <strong className="text-sky-300">
                {formatTimeHMS(prediction.candleOpenTime)}→{formatTimeHMS(prediction.expiryTime)}
              </strong>
            </span>
            <span className="flex items-center gap-1.5">
              <Clock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
              <span>
                Expiry:{' '}
                <strong className="text-amber-300">
                  {expiryRemainingMs > 0
                    ? formatCountdownMs(expiryRemainingMs)
                    : 'Closed (Verifying)'}
                </strong>
              </span>
            </span>
          </div>

          <div className="w-full border-t border-sky-500/15 pt-1.5 text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2">
            <span>
              Feed: {prediction.feedSource} · Freshness:{' '}
              <strong className={isDisconnected ? 'text-rose-400' : 'text-emerald-400'}>
                {liveMonitor?.dataStatus ?? 'CONNECTED'}
              </strong>{' '}
              · Issued {formatTimeHMS(prediction.analyzedAt)}
            </span>
            <span className="tabular-nums">
              Next {timeframe === '1m' ? '1-min' : timeframe} candle · Candles: {prediction.technicalSummary.candlesAnalyzed} · Bull{' '}
              {prediction.technicalSummary.bullishProbability}% / Bear{' '}
              {prediction.technicalSummary.bearishProbability}%
            </span>
          </div>
        </div>
      )}

      {/* Next Candle Target Window Footer even when on Standby */}
      {!prediction && !emergencyStopped && (
        <div className="relative z-10 mt-2 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-500/20 bg-[#050D1E]/85 px-3 py-1.5 font-mono text-[11px] text-slate-400 tabular-nums">
          <span>
            Target Window: <strong className="text-sky-300">{formatTimeHMS(nextCandleOpenMs)}→{formatTimeHMS(nextCandleCloseMs)}</strong>
          </span>
          <span>1s Monitoring Active · Signal locks on candle confirmation</span>
        </div>
      )}
    </section>
  );
}
