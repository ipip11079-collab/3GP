import { BarChart3 } from 'lucide-react';
import type { OverallAccuracyReport, Timeframe } from '../types/trading.ts';

interface AccuracyPanelProps {
  accuracy: OverallAccuracyReport | null;
  activeTimeframe: Timeframe;
}

const ORDERED_TIMEFRAMES: Timeframe[] = ['5s', '10s', '30s', '1m'];

export function AccuracyPanel({ accuracy, activeTimeframe }: AccuracyPanelProps) {
  return (
    <section
      aria-label="Verified Performance Accuracy"
      className="neon-panel rounded-2xl p-4"
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h3 className="font-display text-sm sm:text-base font-bold text-white">
            Verified Performance Accuracy
          </h3>
        </div>
        <span className="text-xs text-slate-400 tabular-nums">
          {accuracy && accuracy.totalSettled > 0
            ? `${accuracy.totalCorrect}/${accuracy.totalCorrect + accuracy.totalFalse} verified (${accuracy.totalPending} pending)`
            : 'Calculated strictly from settled candles'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {ORDERED_TIMEFRAMES.map((tf) => {
          const stat = accuracy?.byTimeframe[tf];
          const isCurrent = tf === activeTimeframe;
          const directionalTotal = stat ? stat.correct + stat.falseCount : 0;
          const displayPct =
            stat && stat.accuracyPct !== null
              ? `${stat.accuracyPct.toFixed(1)}%`
              : '--%';

          return (
            <div
              key={tf}
              className={`rounded-xl border px-3 py-2.5 text-center transition-colors ${
                isCurrent
                  ? 'border-sky-400/70 bg-sky-500/10'
                  : 'border-sky-500/20 bg-[#050C1D]'
              }`}
            >
              <div className="font-mono text-xs font-semibold text-sky-300">
                {tf}
              </div>
              <div
                className={`mt-0.5 font-display text-xl sm:text-2xl font-extrabold tabular-nums ${
                  stat?.accuracyPct === null || stat?.accuracyPct === undefined
                    ? 'text-slate-500'
                    : stat.accuracyPct >= 60
                      ? 'text-emerald-400'
                      : 'text-amber-300'
                }`}
              >
                {displayPct}
              </div>
              <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                {directionalTotal > 0
                  ? `${stat?.correct}/${directionalTotal} won`
                  : '0 settled'}
              </div>
              {directionalTotal > 0 && !stat?.sampleReliable && (
                <div className="text-[10px] text-amber-300/80">
                  Sample &lt; 5
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
