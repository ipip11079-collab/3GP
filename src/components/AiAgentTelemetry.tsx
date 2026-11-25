import { Compass, Cpu, Layers } from 'lucide-react';
import type {
  BroaderSentiment,
  MarketRegime,
  PredictionResult,
} from '../types/trading.ts';

interface LiveTelemetrySnapshot {
  technicalSummary: PredictionResult['technicalSummary'];
  smc?: PredictionResult['smc'] | null;
  multiTimeframe?: PredictionResult['multiTimeframe'] | null;
}

interface AiAgentTelemetryProps {
  prediction: PredictionResult | null;
  liveTelemetry?: LiveTelemetrySnapshot | null;
  isAnalyzing: boolean;
}

function formatRegimeLabel(regime: MarketRegime): { text: string; tone: string } {
  switch (regime) {
    case 'TRENDING_UP':
      return { text: 'TRENDING UP', tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' };
    case 'TRENDING_DOWN':
      return { text: 'TRENDING DOWN', tone: 'text-rose-300 border-rose-500/40 bg-rose-500/10' };
    case 'HIGH_VOLATILITY':
      return { text: 'HIGH VOLATILITY', tone: 'text-amber-300 border-amber-500/40 bg-amber-500/10' };
    default:
      return { text: 'RANGING', tone: 'text-sky-300 border-sky-500/40 bg-sky-500/10' };
  }
}

function formatBroaderSentiment(sentiment: BroaderSentiment): { text: string; tone: string } {
  switch (sentiment) {
    case 'STRONG_BULLISH':
      return { text: 'STRONG BULLISH', tone: 'text-emerald-200 border-emerald-400/60 bg-emerald-500/20' };
    case 'BULLISH':
      return { text: 'BULLISH', tone: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' };
    case 'STRONG_BEARISH':
      return { text: 'STRONG BEARISH', tone: 'text-rose-200 border-rose-400/60 bg-rose-500/20' };
    case 'BEARISH':
      return { text: 'BEARISH', tone: 'text-rose-300 border-rose-500/40 bg-rose-500/10' };
    default:
      return { text: 'NEUTRAL', tone: 'text-amber-200 border-amber-500/40 bg-amber-500/10' };
  }
}

function trendTone(trend: 'BULLISH' | 'BEARISH' | 'MIXED' | 'NEUTRAL'): string {
  if (trend === 'BULLISH') return 'text-emerald-400';
  if (trend === 'BEARISH') return 'text-rose-400';
  return 'text-amber-300';
}

export function AiAgentTelemetry({
  prediction,
  liveTelemetry,
  isAnalyzing,
}: AiAgentTelemetryProps) {
  const summary = prediction?.technicalSummary ?? liveTelemetry?.technicalSummary;
  const mtf = prediction?.multiTimeframe ?? liveTelemetry?.multiTimeframe ?? null;
  const smc = prediction?.smc ?? liveTelemetry?.smc ?? null;

  if (!summary) {
    return (
      <section
        aria-label="3GP AI Agent Multi-Factor Matrix"
        data-testid="ai-agent-telemetry"
        className="neon-panel rounded-2xl p-3.5"
      >
        <div className="flex items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-2 font-display font-bold text-white">
            <Cpu className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span>3GP Advanced AI Agent Matrix (18 Methods)</span>
          </div>
          <span className="font-mono text-[11px] text-sky-300">
            {isAnalyzing ? 'Computing 18-method SMC & MTF sentiment...' : 'Standby'}
          </span>
        </div>
      </section>
    );
  }

  const regimeBadge = formatRegimeLabel(summary.marketRegime);
  const broaderBadge = mtf ? formatBroaderSentiment(mtf.broaderSentiment) : null;

  return (
    <section
      aria-label="3GP AI Agent Multi-Factor Matrix"
      data-testid="ai-agent-telemetry"
      className="neon-panel rounded-2xl p-3.5"
    >
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
        <div className="flex items-center gap-2">
          <Cpu className="h-4 w-4 text-sky-400" aria-hidden="true" />
          <h3 className="font-display text-sm font-bold text-white">
            3GP Advanced AI Agent Matrix
          </h3>
        </div>
        <div className="flex items-center gap-2">
          {smc && (
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${
                smc.smcBias === 'BULLISH'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                  : smc.smcBias === 'BEARISH'
                    ? 'border-rose-500/40 bg-rose-500/10 text-rose-300'
                    : 'border-amber-500/40 bg-amber-500/10 text-amber-300'
              }`}
            >
              SMC {smc.smcBias}
            </span>
          )}
          <span
            className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${regimeBadge.tone}`}
          >
            {regimeBadge.text}
          </span>
        </div>
      </div>

      {/* Primary Next-Candle Factor Cells */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">EMA (9/21/50)</div>
          <div
            className={`mt-0.5 font-mono text-xs font-bold ${trendTone(
              smc?.ema9_21_50Alignment ?? summary.emaAlignment,
            )}`}
          >
            {smc?.ema9_21_50Alignment ?? summary.emaAlignment}
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">MACD Impulse</div>
          <div className={`mt-0.5 font-mono text-xs font-bold ${trendTone(summary.macdBias)}`}>
            {summary.macdBias}
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">Bollinger %B</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-sky-200 tabular-nums">
            {(summary.bollingerPercentB * 100).toFixed(0)}%
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">RSI / StochRSI</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-white tabular-nums">
            {summary.rsi14.toFixed(0)} · {summary.stochRsi.toFixed(0)}
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">ATR Volatility</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-sky-300 tabular-nums">
            {(summary.atrPct ?? summary.volatilityPct).toFixed(3)}%
          </div>
        </div>

        <div className="rounded-xl border border-sky-500/20 bg-[#050D1E] px-2.5 py-2">
          <div className="text-[10px] text-slate-400">Liquidity Flow</div>
          <div className="mt-0.5 font-mono text-xs font-bold text-sky-300 truncate">
            {summary.liquidityBias}
          </div>
        </div>
      </div>

      {/* 18-Method Smart Money Concepts & Price Action Matrix */}
      {smc && (
        <div
          data-testid="smc-18-matrix"
          className="mt-2.5 rounded-xl border border-sky-500/25 bg-[#040B19] p-2.5"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-200">
              <Layers className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>18-Method SMC, Structure &amp; Candle Psychology</span>
            </div>
            <span className="font-mono text-[10px] text-slate-400">
              Vol: {smc.volumeStatus === 'GENUINE_VOLUME' ? 'Genuine Exchange Vol' : 'Unavailable (FX Spot)'}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-[11px]">
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <div className="text-[10px] text-slate-400">Market Structure</div>
              <div className="font-mono font-bold text-white truncate">
                {smc.marketStructure.replace(/_/g, ' ')}
              </div>
            </div>
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <div className="text-[10px] text-slate-400">BOS / CHOCH</div>
              <div className="font-mono font-bold text-sky-200 truncate">
                BOS:{smc.bos} · CH:{smc.choch}
              </div>
            </div>
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <div className="text-[10px] text-slate-400">Order Block / FVG</div>
              <div className="font-mono font-bold text-amber-200 truncate" title={`${smc.orderBlock.label} | ${smc.fvg.label}`}>
                {smc.orderBlock.type !== 'NONE' ? smc.orderBlock.type : 'NO OB'} / {smc.fvg.type !== 'NONE' ? smc.fvg.type : 'NO FVG'}
              </div>
            </div>
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <div className="text-[10px] text-slate-400">Liquidity Sweep</div>
              <div className="font-mono font-bold text-cyan-300 truncate">
                {smc.liquiditySweep === 'NONE' ? 'No Sweep' : smc.liquiditySweep.replace(/_/g, ' ')}
              </div>
            </div>
          </div>

          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2 text-[11px]">
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <span className="text-slate-400">Pattern &amp; Psychology: </span>
              <strong className="text-white">{smc.candlestickPattern}</strong>
              <span className="text-slate-400"> — {smc.candlePsychology}</span>
            </div>
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5">
              <span className="text-slate-400">Rejection / Breakout: </span>
              <strong className="text-sky-200">{smc.rejectionBreakout}</strong>
            </div>
          </div>
        </div>
      )}

      {/* Broader Multi-Timeframe Trend & SMA(20/50) Sentiment Strip */}
      {mtf && broaderBadge && (
        <div
          data-testid="mtf-broader-sentiment"
          className="mt-2.5 rounded-xl border border-sky-500/25 bg-[#040B19] p-2.5"
        >
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] font-semibold text-sky-200">
              <Compass className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Broader Multi-Timeframe Sentiment (SMA 20/50 &amp; RSI)</span>
            </div>
            <span
              className={`rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold ${broaderBadge.tone}`}
            >
              {broaderBadge.text}
            </span>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">5m SMA(20/50) Cross</span>
              <span
                className={`font-mono text-[11px] font-bold tabular-nums ${
                  mtf.smaCrossover === 'GOLDEN_BULL'
                    ? 'text-emerald-400'
                    : mtf.smaCrossover === 'DEATH_BEAR'
                      ? 'text-rose-400'
                      : 'text-amber-300'
                }`}
              >
                {mtf.smaCrossover === 'GOLDEN_BULL'
                  ? `BULL +${mtf.smaSpreadPct.toFixed(2)}%`
                  : mtf.smaCrossover === 'DEATH_BEAR'
                    ? `BEAR ${mtf.smaSpreadPct.toFixed(2)}%`
                    : `FLAT ${mtf.smaSpreadPct.toFixed(2)}%`}
              </span>
            </div>

            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">5m Trend &amp; RSI</span>
              <span className={`font-mono text-[11px] font-bold tabular-nums ${trendTone(mtf.broader5mTrend)}`}>
                {mtf.broader5mTrend} · {mtf.broader5mRsi14.toFixed(0)}
              </span>
            </div>

            <div className="rounded-lg border border-sky-500/15 bg-[#061126] px-2.5 py-1.5 flex items-center justify-between gap-2">
              <span className="text-[10px] text-slate-400">15m Macro &amp; RSI</span>
              <span className={`font-mono text-[11px] font-bold tabular-nums ${trendTone(mtf.broader15mTrend)}`}>
                {mtf.broader15mTrend} · {mtf.broader15mRsi14.toFixed(0)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Bull vs Bear Probability Split */}
      <div className="mt-2.5">
        <div className="mb-1 flex items-center justify-between font-mono text-[11px] tabular-nums">
          <span className="text-emerald-400 font-semibold">
            Bullish {summary.bullishProbability}%
          </span>
          <span className="text-slate-400">Confluence Split</span>
          <span className="text-rose-400 font-semibold">
            Bearish {summary.bearishProbability}%
          </span>
        </div>
        <div className="flex h-2 w-full overflow-hidden rounded-full bg-slate-900 border border-sky-500/20">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${summary.bullishProbability}%` }}
          />
          <div
            className="bg-rose-500 transition-all duration-500"
            style={{ width: `${summary.bearishProbability}%` }}
          />
        </div>
      </div>
    </section>
  );
}
