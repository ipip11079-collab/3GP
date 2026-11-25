import { useEffect, useState, type CSSProperties } from 'react';
import { Bot, Cake, PartyPopper, Play, Sparkles, Square } from 'lucide-react';

interface BirthdayCelebrationBannerProps {
  birthdayTheme: boolean;
  autoTradingEnabled: boolean;
  tradingSessionActive: boolean;
  emergencyStopped: boolean;
  onToggleBirthdayTheme: () => void;
  onStartTrading: () => void;
  onStopTrading: () => void;
}

const CONFETTI_COLORS = ['#FBBF24', '#EC4899', '#22D3EE', '#34D399', '#A855F7', '#F43F5E'];

const CONFETTI_PIECES = Array.from({ length: 34 }, (_, idx) => ({
  id: idx,
  leftPct: (idx * 3.1 + (idx % 5) * 4) % 98,
  delayMs: (idx % 7) * 85,
  durationSec: 2.2 + (idx % 5) * 0.25,
  driftPx: ((idx % 2 === 0 ? 1 : -1) * (24 + (idx % 4) * 18)),
  color: CONFETTI_COLORS[idx % CONFETTI_COLORS.length],
  widthPx: 6 + (idx % 3) * 3,
  heightPx: 10 + (idx % 4) * 3,
}));

export function BirthdayCelebrationBanner({
  birthdayTheme,
  autoTradingEnabled,
  tradingSessionActive,
  emergencyStopped,
  onToggleBirthdayTheme,
  onStartTrading,
  onStopTrading,
}: BirthdayCelebrationBannerProps) {
  const [burstKey, setBurstKey] = useState<number>(0);

  useEffect(() => {
    if (burstKey === 0) return;
    const timer = window.setTimeout(() => setBurstKey(0), 4500);
    return () => window.clearTimeout(timer);
  }, [burstKey]);

  const botRunning = autoTradingEnabled && tradingSessionActive && !emergencyStopped;

  return (
    <>
      {burstKey > 0 && (
        <div
          key={burstKey}
          aria-hidden="true"
          data-testid="confetti-overlay"
          className="pointer-events-none fixed inset-0 z-50 overflow-hidden"
        >
          {CONFETTI_PIECES.map((piece) => (
            <span
              key={piece.id}
              className="confetti-piece absolute top-0 rounded-sm"
              style={
                {
                  left: `${piece.leftPct}%`,
                  width: `${piece.widthPx}px`,
                  height: `${piece.heightPx}px`,
                  backgroundColor: piece.color,
                  animationDelay: `${piece.delayMs}ms`,
                  '--confetti-duration': `${piece.durationSec}s`,
                  '--confetti-drift': `${piece.driftPx}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      )}

      <section
        aria-label="Sam's Birthday Party Edition & 3GP.bot Quick Launch"
        data-testid="birthday-celebration-banner"
        className={`rounded-2xl px-4 py-3 transition-colors ${
          birthdayTheme ? 'birthday-banner-surface' : 'neon-panel'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                birthdayTheme
                  ? 'border-amber-300/70 bg-gradient-to-br from-pink-500/35 via-purple-500/30 to-amber-400/30 text-amber-200 shadow-[0_0_20px_rgba(251,191,36,0.35)]'
                  : 'border-sky-400/40 bg-sky-500/15 text-sky-300'
              }`}
            >
              <Cake className="h-5 w-5" aria-hidden="true" />
            </div>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display text-sm sm:text-base font-extrabold tracking-tight text-white">
                  {birthdayTheme
                    ? 'HAPPY BIRTHDAY SAM! — 3GP.bot Party Edition'
                    : '3GP.bot Workspace Theme — Classic Mode'}
                </h2>
                <span
                  className={`rounded px-2 py-0.5 font-mono text-[10px] font-bold uppercase ${
                    botRunning
                      ? 'border border-emerald-400/70 bg-emerald-500/20 text-emerald-200'
                      : 'border border-slate-600 bg-slate-900/80 text-slate-300'
                  }`}
                >
                  {botRunning ? '3GP.bot RUNNING (DEMO)' : '3GP.bot STANDBY'}
                </span>
              </div>
              <p className="text-xs text-slate-200/85 truncate">
                {birthdayTheme
                  ? "Sam's Birthday Crazy Look active · Cosmic violet-gold neon + live Gmail/Quotex readiness + 3GP.bot Auto Trading."
                  : 'Classic 3GP dark blue interface active. Switch anytime to celebrate Sam’s Birthday Look.'}
              </p>
            </div>
          </div>

          <div className="flex w-full md:w-auto flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setBurstKey((k) => k + 1)}
              data-testid="confetti-burst-btn"
              className="flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-300/75 bg-gradient-to-r from-amber-500/25 to-pink-500/25 px-3 py-1.5 text-xs font-bold text-amber-100 hover:border-amber-200 cursor-pointer whitespace-nowrap"
            >
              <PartyPopper className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>Celebrate!</span>
            </button>

            <button
              type="button"
              onClick={onToggleBirthdayTheme}
              aria-pressed={birthdayTheme}
              data-testid="birthday-theme-toggle"
              className={`flex min-h-[40px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap transition-colors ${
                birthdayTheme
                  ? 'border-pink-400/75 bg-pink-500/20 text-pink-100 hover:bg-pink-500/30'
                  : 'border-sky-400/60 bg-sky-500/15 text-sky-100 hover:bg-sky-500/25'
              }`}
            >
              <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
              <span>{birthdayTheme ? "Sam's Look: ON" : 'Classic 3GP'}</span>
            </button>

            <button
              type="button"
              disabled={emergencyStopped}
              onClick={botRunning ? onStopTrading : onStartTrading}
              data-testid="banner-start-trading"
              className={`flex min-h-[40px] flex-1 sm:flex-initial items-center justify-center gap-1.5 rounded-xl border px-3.5 py-1.5 text-xs font-extrabold cursor-pointer whitespace-nowrap disabled:opacity-50 transition-transform active:scale-[0.98] ${
                botRunning
                  ? 'border-rose-400/75 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
                  : 'border-emerald-300/80 bg-gradient-to-r from-emerald-500 to-cyan-400 text-slate-950 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:brightness-105'
              }`}
            >
              {botRunning ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-rose-200" aria-hidden="true" />
                  <span>Stop 3GP.bot</span>
                </>
              ) : (
                <>
                  <Bot className="h-3.5 w-3.5" aria-hidden="true" />
                  <Play className="h-3 w-3 fill-slate-950" aria-hidden="true" />
                  <span>Start Trading</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
