import {
  BarChart3,
  Crown,
  History,
  Lock,
  Mic,
  MicOff,
  OctagonAlert,
  Play,
  Unlock,
} from 'lucide-react';
import type { AssistantLanguage } from '../types/trading.ts';

interface HeaderBarProps {
  voiceEnabled: boolean;
  isSpeaking: boolean;
  ownerLocked: boolean;
  emergencyStopped: boolean;
  assistantLanguage: AssistantLanguage;
  onToggleVoice: () => void;
  onOpenOwnerLock: () => void;
  onToggleEmergencyStop: () => void;
  onOpenStats: () => void;
  onOpenHistory: () => void;
}

export function HeaderBar({
  voiceEnabled,
  isSpeaking,
  ownerLocked,
  emergencyStopped,
  assistantLanguage,
  onToggleVoice,
  onOpenOwnerLock,
  onToggleEmergencyStop,
  onOpenStats,
  onOpenHistory,
}: HeaderBarProps) {
  const langLabel =
    assistantLanguage === 'ur' ? 'UR' : assistantLanguage === 'hi' ? 'HI' : 'EN';

  return (
    <header className="w-full border-b border-sky-500/30 bg-[#040916]/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        {/* Brand Zone — Preserves 3GP Trading Bot identity + ISRAR AI TRADING MASTER */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/50 bg-gradient-to-br from-amber-500/20 to-sky-500/10 shadow-[0_0_16px_rgba(251,191,36,0.28)]">
            <Crown className="h-5 w-5 text-amber-400" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-display text-xl sm:text-2xl font-extrabold tracking-tight bg-gradient-to-r from-amber-300 via-amber-400 to-yellow-200 bg-clip-text text-transparent whitespace-nowrap shrink-0">
                3GP
              </span>
              <h1 className="font-display text-base sm:text-xl font-bold tracking-tight text-white whitespace-nowrap truncate">
                Trading Bot
              </h1>
              <span className="hidden md:inline-block rounded-md border border-amber-400/40 bg-amber-500/10 px-2 py-0.5 font-mono text-[10px] font-bold tracking-wider text-amber-300 whitespace-nowrap">
                ISRAR AI TRADING MASTER
              </span>
            </div>
            <p className="text-[10px] font-mono font-semibold text-amber-300/90 md:hidden truncate">
              ISRAR AI TRADING MASTER · OTC
            </p>
            <p className="hidden md:block text-xs text-sky-300/80 whitespace-nowrap truncate">
              Ultimate OTC Intelligence Agent · 18-Method SMC + 1s Monitor
            </p>
          </div>
        </div>

        {/* Right Utility Controls */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleEmergencyStop}
            aria-pressed={emergencyStopped}
            data-testid="header-emergency-stop"
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-rose-400 ${
              emergencyStopped
                ? 'border-emerald-400/80 bg-emerald-500/20 text-emerald-100 shadow-[0_0_16px_rgba(16,185,129,0.3)]'
                : 'border-rose-500/70 bg-rose-950/60 text-rose-200 hover:bg-rose-900/70 shadow-[0_0_14px_rgba(244,63,94,0.25)]'
            }`}
          >
            {emergencyStopped ? (
              <>
                <Play className="h-3.5 w-3.5 text-emerald-300 fill-emerald-300" aria-hidden="true" />
                <span>RESUME</span>
              </>
            ) : (
              <>
                <OctagonAlert className="h-4 w-4 text-rose-400" aria-hidden="true" />
                <span>STOP</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={onOpenOwnerLock}
            data-testid="owner-lock-button"
            aria-label="Open Owner Settings Lock"
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
              ownerLocked
                ? 'border-amber-400/50 bg-amber-500/10 text-amber-200 hover:border-amber-300'
                : 'border-emerald-400/50 bg-emerald-500/10 text-emerald-200 hover:border-emerald-300'
            }`}
          >
            {ownerLocked ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            ) : (
              <Unlock className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {ownerLocked ? 'Owner Lock' : 'Unlocked'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={voiceEnabled}
            aria-label={voiceEnabled ? 'Disable AI Voice Assistant' : 'Enable AI Voice Assistant'}
            className={`flex min-h-[44px] items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
              voiceEnabled
                ? 'border-sky-400/80 bg-sky-500/15 text-sky-100 shadow-[0_0_16px_rgba(14,165,233,0.3)]'
                : 'border-slate-700/80 bg-slate-900/70 text-slate-300 hover:border-sky-500/50 hover:text-white'
            }`}
          >
            {voiceEnabled ? (
              <Mic className={`h-4 w-4 text-sky-400 ${isSpeaking ? 'scale-110 text-emerald-400' : ''}`} aria-hidden="true" />
            ) : (
              <MicOff className="h-4 w-4 text-slate-400" aria-hidden="true" />
            )}
            <span className="hidden sm:inline">
              {voiceEnabled ? (isSpeaking ? `Speaking (${langLabel})` : `Voice ${langLabel}`) : `Voice OFF`}
            </span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            aria-label="Open Prediction History"
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-sky-500/40 bg-[#081226] px-3 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-400 hover:bg-sky-950/60 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <History className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span className="hidden md:inline">History</span>
          </button>

          <button
            type="button"
            onClick={onOpenStats}
            aria-label="Open Accuracy Statistics"
            className="flex min-h-[44px] items-center gap-1.5 rounded-xl border border-sky-500/40 bg-[#081226] px-3 py-2 text-xs font-medium text-sky-100 transition-colors hover:border-sky-400 hover:bg-sky-950/60 whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400"
          >
            <BarChart3 className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span className="hidden md:inline">Stats</span>
          </button>
        </div>
      </div>
    </header>
  );
}
