import { Activity, ArrowDownRight, ArrowUpRight, Minus, RefreshCw } from 'lucide-react';
import type { MarketMode, ScreenerRow, Timeframe } from '../types/trading.ts';

interface LiveScreenerPanelProps {
  market: MarketMode;
  timeframe: Timeframe;
  rows: ScreenerRow[];
  selectedPairId: string;
  isLoading: boolean;
  errorMessage: string | null;
  onSelectPairId: (pairId: string) => void;
  onRefreshScreener: () => void;
}

export function LiveScreenerPanel({
  market,
  timeframe,
  rows,
  selectedPairId,
  isLoading,
  errorMessage,
  onSelectPairId,
  onRefreshScreener,
}: LiveScreenerPanelProps) {
  return (
    <aside
      aria-label="Live Market Screening"
      data-testid="live-screener-panel"
      className="neon-panel flex flex-col justify-between rounded-2xl p-3.5 h-full"
    >
      <div>
        <div className="mb-2.5 flex items-center justify-between gap-2 border-b border-sky-500/20 pb-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <Activity className="h-4 w-4 shrink-0 text-sky-400" aria-hidden="true" />
            <div className="min-w-0">
              <h2 className="font-display text-sm font-bold text-white truncate">
                Live Market Screening
              </h2>
              <p className="text-[11px] text-sky-300/80 truncate">
                {market} · {timeframe} AI Agent Scan
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRefreshScreener}
            disabled={isLoading}
            aria-label="Refresh live market screener"
            className="flex min-h-[34px] min-w-[34px] shrink-0 items-center justify-center rounded-lg border border-sky-500/35 bg-[#061024] text-sky-300 transition-colors hover:border-sky-400 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>

        {errorMessage && rows.length === 0 ? (
          <div className="rounded-xl border border-rose-500/35 bg-rose-950/30 p-3 text-xs text-rose-200">
            {errorMessage}
          </div>
        ) : rows.length === 0 ? (
          <div className="space-y-2 py-2" aria-label="Loading live market screener">
            {Array.from({ length: 6 }).map((_, idx) => (
              <div
                key={idx}
                className="h-11 animate-pulse rounded-xl border border-sky-500/15 bg-[#060E20]"
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5" role="list" aria-label="Screened Live Market Pairs">
            {rows.map((row) => {
              const isSelected = row.pairId === selectedPairId;
              const isBull = row.bias === 'BULLISH';
              const isBear = row.bias === 'BEARISH';

              return (
                <button
                  key={row.pairId}
                  type="button"
                  role="listitem"
                  onClick={() => onSelectPairId(row.pairId)}
                  aria-label={`Analyze ${row.symbol}, price ${row.price.toFixed(row.precision)}, bias ${row.bias}`}
                  className={`flex min-h-[46px] w-full items-center justify-between gap-2 rounded-xl border px-2.5 py-2 text-left transition-all cursor-pointer focus-visible:outline-2 focus-visible:outline-sky-400 ${
                    isSelected
                      ? 'neon-panel-active text-white'
                      : 'border-sky-500/20 bg-[#050D1E] text-slate-200 hover:border-sky-400/55 hover:bg-[#08152F]'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="font-display text-xs font-bold text-white whitespace-nowrap">
                        {row.symbol}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {row.category}
                      </span>
                    </div>
                    <div className="font-mono text-[11px] text-sky-200/90 tabular-nums">
                      {row.price.toFixed(row.precision)}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <div className="text-right font-mono tabular-nums">
                      <div
                        className={`text-[11px] font-semibold ${
                          row.changePct > 0
                            ? 'text-emerald-400'
                            : row.changePct < 0
                              ? 'text-rose-400'
                              : 'text-slate-400'
                        }`}
                      >
                        {row.changePct > 0 ? '+' : ''}
                        {row.changePct.toFixed(2)}%
                      </div>
                      <div className="text-[10px] text-slate-400">
                        {row.dataSufficient ? `${row.strength}%` : 'Low vol'}
                      </div>
                    </div>

                    <span
                      className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border ${
                        !row.dataSufficient
                          ? 'border-slate-700 bg-slate-900 text-slate-500'
                          : isBull
                            ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                            : isBear
                              ? 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                              : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
                      }`}
                    >
                      {!row.dataSufficient ? (
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : isBull ? (
                        <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      ) : isBear ? (
                        <ArrowDownRight className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Minus className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-3 border-t border-sky-500/15 pt-2 text-[11px] text-slate-400 flex items-center justify-between gap-2">
        <span>Click any pair for trade</span>
        <span className="font-mono text-sky-300/80">Live 6s scan</span>
      </div>
    </aside>
  );
}
