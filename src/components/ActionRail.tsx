import { BarChart3, Bot, History, Play, Radio, RefreshCw, Square, Volume2, VolumeX } from 'lucide-react';

interface ActionRailProps {
  voiceEnabled: boolean;
  autoAgentEnabled: boolean;
  autoTradingEnabled: boolean;
  tradingSessionActive: boolean;
  emergencyStopped: boolean;
  isAnalyzing: boolean;
  onToggleVoice: () => void;
  onToggleAutoAgent: () => void;
  onToggleAutoTrading: () => void;
  onStartTrading: () => void;
  onStopTrading: () => void;
  onRefreshData: () => void;
  onOpenHistory: () => void;
  onOpenStats: () => void;
  onStartAnalysis: () => void;
}

export function ActionRail({
  voiceEnabled,
  autoAgentEnabled,
  autoTradingEnabled,
  tradingSessionActive,
  emergencyStopped,
  isAnalyzing,
  onToggleVoice,
  onToggleAutoAgent,
  onToggleAutoTrading,
  onStartTrading,
  onStopTrading,
  onRefreshData,
  onOpenHistory,
  onOpenStats,
  onStartAnalysis,
}: ActionRailProps) {
  const botRunning = autoTradingEnabled && tradingSessionActive && !emergencyStopped;

  return (
    <>
      {/* Desktop Right Rail */}
      <aside
        aria-label="Trading Actions"
        className="hidden lg:flex flex-col gap-3"
      >
        <div className="neon-panel flex flex-col gap-2 rounded-2xl p-3">
          <button
            type="button"
            onClick={onToggleAutoTrading}
            aria-pressed={autoTradingEnabled}
            data-testid="rail-auto-trading-toggle"
            className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              autoTradingEnabled
                ? 'border-amber-400/80 bg-amber-500/20 text-amber-100'
                : 'border-sky-500/35 bg-[#061024] text-slate-200 hover:border-sky-400'
            }`}
          >
            <span className="flex items-center gap-2">
              <Bot
                className={`h-4 w-4 ${autoTradingEnabled ? 'text-amber-300' : 'text-sky-400'}`}
                aria-hidden="true"
              />
              <span>Auto Trading</span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                autoTradingEnabled ? 'text-amber-300' : 'text-slate-400'
              }`}
            >
              {autoTradingEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleAutoAgent}
            aria-pressed={autoAgentEnabled}
            className={`flex min-h-[44px] items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors cursor-pointer ${
              autoAgentEnabled
                ? 'border-emerald-400/70 bg-emerald-500/15 text-emerald-100'
                : 'border-sky-500/35 bg-[#061024] text-slate-200 hover:border-sky-400'
            }`}
          >
            <span className="flex items-center gap-2">
              <Radio
                className={`h-4 w-4 ${autoAgentEnabled ? 'text-emerald-400' : 'text-sky-400'}`}
                aria-hidden="true"
              />
              <span>Live Agent</span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                autoAgentEnabled ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {autoAgentEnabled ? 'AUTO' : 'MANUAL'}
            </span>
          </button>

          <button
            type="button"
            onClick={onToggleVoice}
            aria-pressed={voiceEnabled}
            className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-sky-500/35 bg-[#061024] px-3 py-2 text-xs font-semibold text-white transition-colors hover:border-sky-400 cursor-pointer"
          >
            <span className="flex items-center gap-2">
              {voiceEnabled ? (
                <Volume2 className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              ) : (
                <VolumeX className="h-4 w-4 text-slate-400" aria-hidden="true" />
              )}
              <span>Voice</span>
            </span>
            <span
              className={`font-mono text-[11px] font-bold ${
                voiceEnabled ? 'text-emerald-400' : 'text-slate-400'
              }`}
            >
              {voiceEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={onRefreshData}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-500/35 bg-[#061024] px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-400 hover:text-white disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw
              className={`h-4 w-4 text-sky-400 ${isAnalyzing ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>Refresh Data</span>
          </button>

          <button
            type="button"
            onClick={onOpenHistory}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-500/35 bg-[#061024] px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-400 hover:text-white cursor-pointer"
          >
            <History className="h-4 w-4 text-sky-400" aria-hidden="true" />
            <span>History</span>
          </button>

          <button
            type="button"
            onClick={onOpenStats}
            className="flex min-h-[44px] items-center gap-2 rounded-xl border border-sky-500/35 bg-[#061024] px-3 py-2 text-xs font-semibold text-slate-100 transition-colors hover:border-sky-400 hover:text-white cursor-pointer"
          >
            <BarChart3 className="h-4 w-4 text-amber-400" aria-hidden="true" />
            <span>Stats</span>
          </button>
        </div>

        <button
          type="button"
          disabled={emergencyStopped}
          onClick={botRunning ? onStopTrading : onStartTrading}
          data-testid="rail-start-trading"
          className={`flex min-h-[50px] items-center justify-center gap-2 rounded-2xl border px-3 py-2.5 font-display text-sm font-extrabold shadow-lg transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-55 cursor-pointer whitespace-nowrap ${
            botRunning
              ? 'border-rose-400/80 bg-rose-500/25 text-rose-100'
              : 'border-amber-300/80 bg-gradient-to-r from-amber-400 via-pink-500 to-cyan-400 text-slate-950 shadow-[0_0_24px_rgba(236,72,153,0.4)]'
          }`}
        >
          {botRunning ? (
            <>
              <Square className="h-4 w-4 fill-rose-200" aria-hidden="true" />
              <span>Stop 3GP.bot</span>
            </>
          ) : (
            <>
              <Bot className="h-4 w-4" aria-hidden="true" />
              <span>Start Trading</span>
            </>
          )}
        </button>

        <button
          type="button"
          disabled={isAnalyzing}
          onClick={onStartAnalysis}
          className="flex min-h-[52px] items-center justify-center gap-2 rounded-2xl border border-emerald-300/70 bg-gradient-to-r from-emerald-500 to-green-500 px-3 py-3 font-display text-base font-extrabold text-slate-950 shadow-[0_0_28px_rgba(34,197,94,0.45)] transition-transform hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 cursor-pointer whitespace-nowrap"
        >
          <Play className="h-4 w-4 fill-slate-950" aria-hidden="true" />
          <span>{isAnalyzing ? 'Analyzing…' : 'Start Analysis'}</span>
        </button>
      </aside>

      {/* Mobile / Android / UC Browser Ergonomic Bottom Action Bar (<= 15% height) */}
      <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-sky-500/35 bg-[#040916]/95 px-3 py-2 backdrop-blur-md lg:hidden">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button
            type="button"
            onClick={onToggleAutoTrading}
            aria-pressed={autoTradingEnabled}
            aria-label="Toggle 3GP.bot Auto Trading"
            data-testid="rail-mobile-auto-trading"
            className={`flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border cursor-pointer ${
              autoTradingEnabled
                ? 'border-amber-400/80 bg-amber-500/20 text-amber-300'
                : 'border-sky-500/40 bg-[#081329] text-sky-300'
            }`}
          >
            <Bot className="h-4 w-4" aria-hidden="true" />
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={onRefreshData}
            aria-label="Refresh Market Data"
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-xl border border-sky-500/40 bg-[#081329] text-sky-300 disabled:opacity-50 cursor-pointer"
          >
            <RefreshCw className={`h-4 w-4 ${isAnalyzing ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            disabled={emergencyStopped}
            onClick={botRunning ? onStopTrading : onStartTrading}
            data-testid="rail-mobile-start-trading"
            className={`flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border px-3 font-display text-xs font-extrabold cursor-pointer whitespace-nowrap disabled:opacity-55 ${
              botRunning
                ? 'border-rose-400/75 bg-rose-500/25 text-rose-100'
                : 'border-amber-300/75 bg-gradient-to-r from-amber-400 to-pink-500 text-slate-950'
            }`}
          >
            <span>{botRunning ? 'Stop Bot' : 'Start Trade'}</span>
          </button>

          <button
            type="button"
            disabled={isAnalyzing}
            onClick={onStartAnalysis}
            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-r from-emerald-500 to-green-500 px-3 py-2 font-display text-xs font-extrabold text-slate-950 shadow-[0_0_20px_rgba(34,197,94,0.4)] disabled:opacity-60 cursor-pointer whitespace-nowrap"
          >
            <Play className="h-3.5 w-3.5 fill-slate-950" aria-hidden="true" />
            <span>{isAnalyzing ? 'Analyzing…' : 'Analyze'}</span>
          </button>
        </div>
      </div>
    </>
  );
}

