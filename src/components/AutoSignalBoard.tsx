import { useEffect, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Clock,
  PauseCircle,
  Radio,
  RefreshCw,
  Sparkles,
  Zap,
} from 'lucide-react';
import type { AutoBoardResponse, MarketMode } from '../types/trading.ts';

interface AutoSignalBoardProps {
  market: MarketMode;
  boardData: AutoBoardResponse | null;
  isLoading: boolean;
  errorMessage: string | null;
  autoBoardEnabled: boolean;
  autoPairSwitch: boolean;
  selectedPairId: string;
  onToggleAutoBoard: () => void;
  onToggleAutoPairSwitch: () => void;
  onAutoSelectBest: () => void;
  onRefreshBoard: () => void;
  onSelectPairId: (pairId: string) => void;
}

function formatHHMM(epochMs: number): string {
  const d = new Date(epochMs);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function AutoSignalBoard({
  market,
  boardData,
  isLoading,
  errorMessage,
  autoBoardEnabled,
  autoPairSwitch,
  selectedPairId,
  onToggleAutoBoard,
  onToggleAutoPairSwitch,
  onAutoSelectBest,
  onRefreshBoard,
  onSelectPairId,
}: AutoSignalBoardProps) {
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNowMs(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const currentMinuteOpen = Math.floor(nowMs / 60_000) * 60_000;
  const next1mCloseMs = currentMinuteOpen + 60_000;
  const secondsUntilClose = Math.max(0, Math.ceil((next1mCloseMs - nowMs) / 1000));

  const signals = boardData?.signals ?? [];
  const upCount = signals.filter((s) => s.direction === 'UP').length;
  const downCount = signals.filter((s) => s.direction === 'DOWN').length;
  const waitCount = signals.filter((s) => s.direction === 'NO_TRADE').length;
  const bestActionable =
    signals.find((s) => s.direction === 'UP' || s.direction === 'DOWN') ?? null;

  return (
    <section
      aria-label="1-Minute Close-Candle Auto Signal Board"
      data-testid="auto-signal-board"
      className="neon-panel rounded-2xl p-4"
    >
      {/* Header Row */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b border-sky-500/25 pb-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-sky-400/50 bg-sky-500/15">
            <Zap className="h-4 w-4 text-sky-300" aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-base sm:text-lg font-extrabold text-white">
                Auto Signal Board · 1m Close-Candle Strategy
              </h2>
              <span
                className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${
                  autoBoardEnabled
                    ? 'border-emerald-400/60 bg-emerald-500/15 text-emerald-300'
                    : 'border-slate-600 bg-slate-900 text-slate-400'
                }`}
              >
                {autoBoardEnabled ? 'AUTO 1M SYNC ON' : 'MANUAL PAUSED'}
              </span>
            </div>
            <p className="text-xs text-slate-300">
              {market} 1m closed candle &rarr; next 1m candle ({formatHHMM(currentMinuteOpen)} &rarr;{' '}
              {formatHHMM(next1mCloseMs)}) ·{' '}
              <span className="font-mono text-emerald-300">{upCount} UP</span> ·{' '}
              <span className="font-mono text-rose-300">{downCount} DOWN</span> ·{' '}
              <span className="font-mono text-amber-300">{waitCount} WAIT</span>
            </p>
          </div>
        </div>

        {/* Countdown + Auto Currency Controls + Refresh */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-h-[38px] items-center gap-2 rounded-xl border border-sky-500/35 bg-[#061024] px-3 py-1.5 font-mono text-xs tabular-nums">
            <Clock className="h-3.5 w-3.5 text-amber-400" aria-hidden="true" />
            <span className="text-slate-300">1m Close:</span>
            <strong className="text-amber-300">{secondsUntilClose}s</strong>
          </div>

          <button
            type="button"
            onClick={onToggleAutoPairSwitch}
            aria-pressed={autoPairSwitch}
            className={`flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              autoPairSwitch
                ? 'border-sky-400/70 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30'
                : 'border-sky-500/30 bg-[#061024] text-slate-300 hover:border-sky-400 hover:text-white'
            }`}
          >
            <Sparkles className="h-3.5 w-3.5 text-amber-300" aria-hidden="true" />
            <span>{autoPairSwitch ? 'Auto Pair ON' : 'Auto Pair OFF'}</span>
          </button>

          {bestActionable && (
            <button
              type="button"
              onClick={onAutoSelectBest}
              className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-emerald-400/70 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-200 hover:bg-emerald-500/25 cursor-pointer"
            >
              <span>Trade Top: {bestActionable.symbol}</span>
            </button>
          )}

          <button
            type="button"
            onClick={onToggleAutoBoard}
            aria-pressed={autoBoardEnabled}
            className={`flex min-h-[38px] items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
              autoBoardEnabled
                ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-200 hover:bg-emerald-500/25'
                : 'border-sky-500/35 bg-[#061024] text-slate-300 hover:border-sky-400 hover:text-white'
            }`}
          >
            <Radio className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{autoBoardEnabled ? 'Auto Board ON' : 'Auto Board OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onRefreshBoard}
            disabled={isLoading}
            aria-label="Refresh 1m Auto Signal Board"
            className="flex min-h-[38px] items-center gap-1.5 rounded-xl border border-sky-500/40 bg-[#061024] px-3 py-1.5 text-xs font-semibold text-sky-200 hover:border-sky-400 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Scan 1m Close</span>
          </button>
        </div>
      </div>

      {/* Board Body */}
      {errorMessage && signals.length === 0 ? (
        <div className="rounded-xl border border-rose-500/40 bg-rose-950/30 p-3 text-xs text-rose-200">
          {errorMessage}
        </div>
      ) : signals.length === 0 ? (
        <div
          className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4"
          aria-label="Loading 1m Auto Signal Board"
        >
          {Array.from({ length: 4 }).map((_, idx) => (
            <div
              key={idx}
              className="h-32 animate-pulse rounded-xl border border-sky-500/20 bg-[#050D1E]"
            />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
          {signals.map((sig) => {
            const isSelected = sig.pairId === selectedPairId;
            const isTopPick = bestActionable?.pairId === sig.pairId;
            const isUp = sig.direction === 'UP';
            const isDown = sig.direction === 'DOWN';

            const borderTone = isUp
              ? 'border-emerald-500/45 bg-[#051510]/85 hover:border-emerald-400'
              : isDown
                ? 'border-rose-500/45 bg-[#19080D]/85 hover:border-rose-400'
                : 'border-amber-500/35 bg-[#120F07]/85 hover:border-amber-400/70';

            return (
              <button
                key={sig.pairId}
                type="button"
                data-testid="auto-board-card"
                onClick={() => onSelectPairId(sig.pairId)}
                className={`flex flex-col justify-between rounded-xl border p-3 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${borderTone} ${
                  isSelected ? 'ring-2 ring-sky-400/80' : ''
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-sm font-extrabold text-white">
                          {sig.symbol}
                        </span>
                        {isTopPick && (
                          <span className="rounded bg-amber-400/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-amber-300 border border-amber-400/40">
                            TOP
                          </span>
                        )}
                      </div>
                      <div className="font-mono text-[11px] text-slate-300 tabular-nums">
                        Close {sig.entryPrice.toFixed(sig.precision)}
                      </div>
                    </div>

                    <div
                      className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 font-display text-xs font-extrabold ${
                        isUp
                          ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-300'
                          : isDown
                            ? 'border-rose-400/60 bg-rose-500/20 text-rose-300'
                            : 'border-amber-400/50 bg-amber-500/15 text-amber-300'
                      }`}
                    >
                      {isUp ? (
                        <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : isDown ? (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <PauseCircle className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {isUp ? `UP ${sig.confidence}%` : isDown ? `DOWN ${sig.confidence}%` : 'WAIT'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 text-[11px] font-semibold text-sky-200 truncate">
                    {isUp ? 'Why UP: ' : isDown ? 'Why DOWN: ' : ''}
                    {sig.setupName}
                  </div>
                  <p className="mt-1 text-[11px] text-slate-300/90 line-clamp-2 leading-snug">
                    {sig.reasoning}
                  </p>
                </div>

                <div className="mt-2.5 flex items-center justify-between border-t border-white/10 pt-1.5 font-mono text-[10px] text-slate-400 tabular-nums">
                  <span>RSI {sig.rsi14.toFixed(0)}</span>
                  <span>MACD {sig.macdBias}</span>
                  <span>%B {(sig.bollingerPercentB * 100).toFixed(0)}%</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </section>
  );
}
