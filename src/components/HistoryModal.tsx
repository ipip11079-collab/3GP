import { useEffect, useRef } from 'react';
import { ArrowDown, ArrowUp, CheckCircle2, Clock, RefreshCw, Trash2, X, XCircle } from 'lucide-react';
import type { RecordedPrediction } from '../types/trading.ts';

interface HistoryModalProps {
  open: boolean;
  records: RecordedPrediction[];
  isSettling: boolean;
  onClose: () => void;
  onSettleNow: () => void;
  onClearHistory: () => void;
}

export function HistoryModal({
  open,
  records,
  isSettling,
  onClose,
  onSettleNow,
  onClearHistory,
}: HistoryModalProps) {
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
      aria-labelledby="history-modal-title"
      className="fixed inset-0 z-50 m-auto w-[94vw] max-w-3xl rounded-2xl border border-sky-400/60 bg-[#050C1B] p-0 text-slate-100 shadow-[0_20px_60px_rgba(0,0,0,0.85)] backdrop:bg-black/75 backdrop:backdrop-blur-sm"
    >
      <div className="flex items-center justify-between gap-3 border-b border-sky-500/25 px-5 py-4">
        <div>
          <h2 id="history-modal-title" className="font-display text-lg font-bold text-white">
            Prediction Verification Ledger
          </h2>
          <p className="text-xs text-slate-400">
            Every directional signal is recorded before candle expiry and verified against actual close price.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close prediction history"
          className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border border-slate-700 text-slate-300 hover:border-sky-400 hover:text-white cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/15 bg-[#040915] px-5 py-3">
        <span className="text-xs text-slate-300 tabular-nums">
          Total recorded: <strong className="text-white">{records.length}</strong>
        </span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={isSettling}
            onClick={onSettleNow}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/15 px-3 py-1.5 text-xs font-semibold text-sky-100 hover:bg-sky-500/25 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${isSettling ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span>Verify Expired</span>
          </button>
          {records.length > 0 && (
            <button
              type="button"
              onClick={onClearHistory}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/20 cursor-pointer"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Reset Ledger</span>
            </button>
          )}
        </div>
      </div>

      <div className="max-h-[60vh] overflow-y-auto p-5">
        {records.length === 0 ? (
          <div className="py-12 text-center text-sm text-slate-400">
            No directional predictions recorded yet. Run an analysis to begin verified tracking.
          </div>
        ) : (
          <div className="space-y-2.5">
            {records.map((rec) => (
              <div
                key={rec.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-500/25 bg-[#081226] px-4 py-3 text-xs"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      rec.predictedDirection === 'UP'
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-400'
                        : 'border-rose-500/50 bg-rose-500/15 text-rose-400'
                    }`}
                  >
                    {rec.predictedDirection === 'UP' ? (
                      <ArrowUp className="h-5 w-5" aria-hidden="true" />
                    ) : (
                      <ArrowDown className="h-5 w-5" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-bold text-white">
                      <span>{rec.pairSymbol}</span>
                      <span className="font-mono text-sky-300">{rec.timeframe}</span>
                      <span className="text-slate-400">{rec.market}</span>
                    </div>
                    <div className="mt-0.5 text-[11px] text-slate-400 tabular-nums">
                      {new Date(rec.createdAt).toLocaleTimeString()} · Confidence{' '}
                      {rec.confidence}%
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-4 font-mono tabular-nums">
                  <div className="text-right">
                    <div className="text-[11px] text-slate-400">Entry / Actual</div>
                    <div className="text-slate-100">
                      {rec.entryPrice.toFixed(rec.precision)} →{' '}
                      {rec.actualClosePrice !== null
                        ? rec.actualClosePrice.toFixed(rec.precision)
                        : 'Pending'}
                    </div>
                  </div>

                  <div className="min-w-[88px] text-right">
                    {rec.outcome === 'CORRECT' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                        CORRECT
                      </span>
                    ) : rec.outcome === 'FALSE' ? (
                      <span className="inline-flex items-center gap-1 font-bold text-rose-400">
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        FALSE
                      </span>
                    ) : rec.outcome === 'DRAW' ? (
                      <span className="font-bold text-amber-300">FLAT / DRAW</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-sky-300">
                        <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                        PENDING
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </dialog>
  );
}
