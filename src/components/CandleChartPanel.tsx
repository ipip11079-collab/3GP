import { useEffect, useMemo, useRef, useState } from 'react';
import { CandlestickChart, WifiOff } from 'lucide-react';
import { calculateEMA } from '../lib/indicators.ts';
import type {
  Candle,
  ChartOverlayData,
  MarketMode,
  SignalDirection,
  Timeframe,
  TradingPair,
} from '../types/trading.ts';

interface CandleChartPanelProps {
  candles: Candle[];
  pair: TradingPair;
  timeframe: Timeframe;
  market: MarketMode;
  chartOverlay: ChartOverlayData | null;
  entryPrice?: number | null;
  direction?: SignalDirection | null;
  feedSource?: string | null;
  dataStatus?: 'CONNECTED' | 'STALE' | 'DATA_DISCONNECTED';
  isAnalyzing: boolean;
}

function formatTimeLabel(epochMs: number, timeframe: Timeframe): string {
  const d = new Date(epochMs);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return timeframe === '1m' ? `${hh}:${mm}` : `${hh}:${mm}:${ss}`;
}

export function CandleChartPanel({
  candles,
  pair,
  timeframe,
  market,
  chartOverlay,
  entryPrice,
  direction,
  feedSource,
  dataStatus = 'CONNECTED',
  isAnalyzing,
}: CandleChartPanelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [dims, setDims] = useState<{ width: number; height: number }>({
    width: 640,
    height: 190,
  });

  const displayedCandles = useMemo(() => candles.slice(-48), [candles]);

  const ema9Series = useMemo(
    () => calculateEMA(displayedCandles.map((c) => c.close), 9),
    [displayedCandles],
  );
  const ema21Series = useMemo(
    () => calculateEMA(displayedCandles.map((c) => c.close), 21),
    [displayedCandles],
  );
  const ema50Series = useMemo(
    () => calculateEMA(displayedCandles.map((c) => c.close), 50),
    [displayedCandles],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (rect && rect.width > 0) {
        setDims({
          width: Math.floor(rect.width),
          height: rect.width < 500 ? 170 : 190,
        });
      }
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = dims;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    ctx.fillStyle = '#040916';
    ctx.fillRect(0, 0, width, height);

    if (displayedCandles.length === 0) return;

    const padLeft = 8;
    const padRight = 68;
    const padTop = 14;
    const padBottom = 24;
    const plotW = Math.max(40, width - padLeft - padRight);
    const plotH = Math.max(40, height - padTop - padBottom);

    let minPrice = Infinity;
    let maxPrice = -Infinity;
    for (const c of displayedCandles) {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
    }
    if (chartOverlay) {
      if (chartOverlay.supportLevel > 0) {
        minPrice = Math.min(minPrice, chartOverlay.supportLevel);
      }
      if (chartOverlay.resistanceLevel > 0) {
        maxPrice = Math.max(maxPrice, chartOverlay.resistanceLevel);
      }
    }
    if (entryPrice && entryPrice > 0) {
      minPrice = Math.min(minPrice, entryPrice);
      maxPrice = Math.max(maxPrice, entryPrice);
    }

    const rawRange = maxPrice - minPrice;
    const margin = rawRange > 0 ? rawRange * 0.12 : Math.max(1e-5, maxPrice * 0.001);
    minPrice -= margin;
    maxPrice += margin;
    const priceRange = Math.max(1e-9, maxPrice - minPrice);

    const priceToY = (p: number) =>
      padTop + ((maxPrice - p) / priceRange) * plotH;

    ctx.font = '10px "JetBrains Mono", monospace';
    ctx.textBaseline = 'middle';
    const gridRows = 4;
    for (let i = 0; i <= gridRows; i++) {
      const ratio = i / gridRows;
      const y = padTop + ratio * plotH;
      const priceVal = maxPrice - ratio * priceRange;

      ctx.strokeStyle = 'rgba(56, 189, 248, 0.09)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();

      ctx.fillStyle = '#94A3B8';
      ctx.fillText(priceVal.toFixed(pair.precision), width - padRight + 6, y);
    }

    if (chartOverlay) {
      const drawLevel = (val: number, color: string, label: string) => {
        if (!Number.isFinite(val) || val <= 0) return;
        const y = priceToY(val);
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(padLeft, y);
        ctx.lineTo(width - padRight, y);
        ctx.stroke();
        ctx.restore();
        ctx.fillStyle = color;
        ctx.fillText(label, padLeft + 4, Math.max(padTop + 7, y - 7));
      };
      drawLevel(chartOverlay.resistanceLevel, 'rgba(244, 63, 94, 0.55)', 'RES');
      drawLevel(chartOverlay.supportLevel, 'rgba(34, 197, 94, 0.55)', 'SUP');
    }

    if (entryPrice && entryPrice > 0) {
      const y = priceToY(entryPrice);
      const entryColor =
        direction === 'UP'
          ? '#22C55E'
          : direction === 'DOWN'
            ? '#EF4444'
            : '#F59E0B';
      ctx.save();
      ctx.setLineDash([3, 3]);
      ctx.strokeStyle = entryColor;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = entryColor;
      ctx.fillRect(width - padRight + 2, y - 8, padRight - 4, 16);
      ctx.fillStyle = '#020617';
      ctx.fillText(entryPrice.toFixed(pair.precision), width - padRight + 5, y);
    }

    const count = displayedCandles.length;
    const stepX = plotW / count;
    const bodyW = Math.max(2, Math.min(10, stepX * 0.64));

    displayedCandles.forEach((c, idx) => {
      const xCenter = padLeft + idx * stepX + stepX / 2;
      const isUp = c.close >= c.open;
      const color = isUp ? '#22C55E' : '#EF4444';

      const yHigh = priceToY(c.high);
      const yLow = priceToY(c.low);
      const yOpen = priceToY(c.open);
      const yClose = priceToY(c.close);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(xCenter, yHigh);
      ctx.lineTo(xCenter, yLow);
      ctx.stroke();

      const bodyTop = Math.min(yOpen, yClose);
      const bodyHeight = Math.max(2, Math.abs(yClose - yOpen));
      ctx.fillStyle = color;
      ctx.fillRect(xCenter - bodyW / 2, bodyTop, bodyW, bodyHeight);
    });

    const drawEmaLine = (series: number[], color: string) => {
      if (series.length < 2) return;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      series.forEach((val, idx) => {
        const x = padLeft + idx * stepX + stepX / 2;
        const y = priceToY(val);
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    };
    drawEmaLine(ema50Series, 'rgba(168, 85, 247, 0.75)');
    drawEmaLine(ema21Series, 'rgba(245, 158, 11, 0.8)');
    drawEmaLine(ema9Series, 'rgba(56, 189, 248, 0.9)');

    ctx.fillStyle = '#64748B';
    ctx.textBaseline = 'top';
    const labelCount = Math.min(5, count);
    for (let i = 0; i < labelCount; i++) {
      const idx = Math.round((i * (count - 1)) / Math.max(1, labelCount - 1));
      const c = displayedCandles[idx];
      const x = padLeft + idx * stepX + stepX / 2;
      const text = formatTimeLabel(c.openTime, timeframe);
      const textW = ctx.measureText(text).width;
      const clampedX = Math.max(padLeft, Math.min(width - padRight - textW, x - textW / 2));
      ctx.fillText(text, clampedX, height - padBottom + 6);
    }

    if (hoverIdx !== null && hoverIdx >= 0 && hoverIdx < count) {
      const c = displayedCandles[hoverIdx];
      const x = padLeft + hoverIdx * stepX + stepX / 2;
      const y = priceToY(c.close);

      ctx.save();
      ctx.setLineDash([2, 3]);
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.55)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, padTop);
      ctx.lineTo(x, height - padBottom);
      ctx.moveTo(padLeft, y);
      ctx.lineTo(width - padRight, y);
      ctx.stroke();
      ctx.restore();
    }
  }, [
    displayedCandles,
    ema9Series,
    ema21Series,
    ema50Series,
    chartOverlay,
    entryPrice,
    direction,
    pair.precision,
    timeframe,
    dims,
    hoverIdx,
  ]);

  const activeCandle =
    hoverIdx !== null && displayedCandles[hoverIdx]
      ? displayedCandles[hoverIdx]
      : displayedCandles[displayedCandles.length - 1] ?? null;

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (displayedCandles.length === 0 || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const relX = e.clientX - rect.left - 8;
    const plotW = Math.max(40, dims.width - 8 - 68);
    const idx = Math.floor((relX / plotW) * displayedCandles.length);
    if (idx >= 0 && idx < displayedCandles.length) {
      setHoverIdx(idx);
    } else {
      setHoverIdx(null);
    }
  };

  return (
    <section
      aria-label="Live Candlestick Chart"
      data-testid="candle-chart-panel"
      className="neon-panel rounded-2xl p-3.5"
    >
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2 text-xs">
        <div className="flex items-center gap-2">
          <CandlestickChart className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold text-white">
            Live Candlestick Chart · {pair.symbol}
          </h3>
          <span className="font-mono text-[11px] text-sky-300">
            {market} {timeframe}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-300">
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-sky-400" />
            EMA 9
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-amber-400" />
            EMA 21
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block h-0.5 w-3 bg-purple-400" />
            EMA 50
          </span>
          <span className="flex items-center gap-1 text-slate-400">
            {displayedCandles.length} real bars
          </span>
        </div>
      </div>

      {activeCandle && (
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] tabular-nums text-slate-300">
          <div className="flex flex-wrap items-center gap-3">
            <span>
              O <strong className="text-white">{activeCandle.open.toFixed(pair.precision)}</strong>
            </span>
            <span>
              H <strong className="text-emerald-300">{activeCandle.high.toFixed(pair.precision)}</strong>
            </span>
            <span>
              L <strong className="text-rose-300">{activeCandle.low.toFixed(pair.precision)}</strong>
            </span>
            <span>
              C{' '}
              <strong
                className={
                  activeCandle.close >= activeCandle.open
                    ? 'text-emerald-400'
                    : 'text-rose-400'
                }
              >
                {activeCandle.close.toFixed(pair.precision)}
              </strong>
            </span>
          </div>
          {feedSource && (
            <span className="text-[10px] text-slate-400 truncate max-w-[260px]">
              {feedSource}
            </span>
          )}
        </div>
      )}

      <div
        ref={containerRef}
        className="relative w-full overflow-hidden rounded-xl border border-sky-500/20 bg-[#040916]"
      >
        {dataStatus === 'DATA_DISCONNECTED' && (
          <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-center gap-2 border-b border-rose-500/50 bg-rose-950/90 py-1 text-xs font-mono font-bold text-rose-200">
            <WifiOff className="h-3.5 w-3.5 text-rose-400" aria-hidden="true" />
            <span>DATA DISCONNECTED — Awaiting Live Upstream Feed</span>
          </div>
        )}
        {displayedCandles.length === 0 ? (
          <div className="flex h-[210px] items-center justify-center text-xs text-slate-400">
            {isAnalyzing
              ? 'Loading genuine live candles from market feed...'
              : 'No candle bars available for the active pair/timeframe.'}
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            onPointerMove={handlePointerMove}
            onPointerLeave={() => setHoverIdx(null)}
            style={{ width: `${dims.width}px`, height: `${dims.height}px` }}
            className="block touch-pan-y cursor-crosshair"
            aria-label={`Live ${timeframe} candlestick chart for ${pair.symbol}`}
          />
        )}
      </div>
    </section>
  );
}
