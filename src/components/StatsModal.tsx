import { useEffect, useRef } from 'react';
import { ShieldCheck, X } from 'lucide-react';
import type { OverallAccuracyReport, Timeframe } from '../types/trading.ts';

interface StatsModalProps {
  open: boolean;
  accuracy: OverallAccuracyReport | null;
  onClose: () => void;
}

const ORDERED_TIMEFRAMES: Timeframe[] = ['5s', '10s', '30s', '1m'];

export function StatsModal({ open, accuracy, onClose }: StatsModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      aria-labelledby="stats-modal-title"
      className="fixed inset-0 z-50 m-auto w-[94vw] max-w-2xl rounded-2xl border border-sky-400/60 bg-[#050C1B] p-0 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-sky-500/25 px-5 py-4">
        <div className="flex items-center gap-2.5">
          <ShieldCheck className="h-5 w-5 text-sky-400" aria-hidden="true" />
          <div>
            <h2 id="stats-modal-title" className="font-display text-lg font-bold text-white">
              Verified Model Calibration & Accuracy
            </h2>
            <p className="text-xs text-slate-400">
              Minimum confidence threshold: {accuracy?.confidenceThreshold ?? 62}% · Minimum 5 settled trades for sample reliability.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close accuracy statistics"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:border-sky-400 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="p-5 space-y-4">
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-sky-500/25 bg-[#081226] p-3 text-center">
            <div className="text-xs text-slate-400">Overall Accuracy</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-white tabular-nums">
              {accuracy?.overallAccuracyPct !== null && accuracy?.overallAccuracyPct !== undefined
                ? `${accuracy.overallAccuracyPct.toFixed(1)}%`
                : '--%'}
            </div>
          </div>
          <div className="rounded-xl border border-emerald-500/25 bg-[#061812] p-3 text-center">
            <div className="text-xs text-emerald-200/80">Correct Predictions</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-emerald-400 tabular-nums">
              {accuracy?.totalCorrect ?? 0}
            </div>
          </div>
          <div className="rounded-xl border border-rose-500/25 bg-[#1B090E] p-3 text-center">
            <div className="text-xs text-rose-200/80">False Predictions</div>
            <div className="mt-1 font-display text-2xl font-extrabold text-rose-400 tabular-nums">
              {accuracy?.totalFalse ?? 0}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto rounded-xl border border-sky-500/25">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#081226] text-sky-300">
              <tr>
                <th className="px-4 py-3 font-semibold">Timeframe</th>
                <th className="px-4 py-3 font-semibold text-right">Correct</th>
                <th className="px-4 py-3 font-semibold text-right">False</th>
                <th className="px-4 py-3 font-semibold text-right">Pending</th>
                <th className="px-4 py-3 font-semibold text-right">Verified Win Rate</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-500/15 bg-[#040A17] tabular-nums">
              {ORDERED_TIMEFRAMES.map((tf) => {
                const row = accuracy?.byTimeframe[tf];
                const dirTotal = row ? row.correct + row.falseCount : 0;
                return (
                  <tr key={tf}>
                    <td className="px-4 py-3 font-mono font-bold text-white">{tf}</td>
                    <td className="px-4 py-3 text-right text-emerald-400">{row?.correct ?? 0}</td>
                    <td className="px-4 py-3 text-right text-rose-400">{row?.falseCount ?? 0}</td>
                    <td className="px-4 py-3 text-right text-sky-300">{row?.pending ?? 0}</td>
                    <td className="px-4 py-3 text-right font-bold text-white">
                      {row?.accuracyPct !== null && row?.accuracyPct !== undefined
                        ? `${row.accuracyPct.toFixed(1)}% (${row.correct}/${dirTotal})`
                        : 'No settled trades'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </dialog>
  );
}
