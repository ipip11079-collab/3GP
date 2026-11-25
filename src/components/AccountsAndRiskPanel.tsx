import { useEffect, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Bot,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  LogOut,
  MailCheck,
  OctagonAlert,
  Play,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  Square,
  Wallet,
} from 'lucide-react';
import {
  calculateDemoPayoutMetrics,
  evaluateQuotexReadinessSummary,
  validateDemoStake,
} from '../lib/risk.ts';
import type {
  AccountsSnapshot,
  GmailQuotexVerification,
  MarketMode,
  PredictionResult,
  QuotexReadinessProfile,
  Timeframe,
  TradingPair,
} from '../types/trading.ts';

interface AccountsAndRiskPanelProps {
  accounts: AccountsSnapshot | null;
  activePair: TradingPair;
  market: MarketMode;
  timeframe: Timeframe;
  activePrediction: PredictionResult | null;
  defaultStake: number;
  defaultPayoutPct: number;
  emergencyStopped: boolean;
  autoTradingEnabled: boolean;
  tradingSessionActive: boolean;
  botStatusNotice: string | null;
  googleUserEmail: string | null;
  googleUserName: string | null;
  googleTokenReady: boolean;
  gmailBusy: boolean;
  gmailError: string | null;
  gmailVerification: GmailQuotexVerification | null;
  onToggleAutoTrading: () => void;
  onStartTrading: () => void;
  onStopTrading: () => void;
  onGoogleSignIn: () => Promise<void>;
  onGoogleSignOut: () => Promise<void>;
  onScanGmailQuotex: () => Promise<void>;
  onSaveQuotexProfile: (
    patch: Partial<QuotexReadinessProfile>,
  ) => Promise<{ ok: boolean; error?: string }>;
  onPlaceDemoTrade: (
    direction: 'UP' | 'DOWN',
    stake: number,
  ) => Promise<{ ok: boolean; error?: string; warning?: string | null }>;
  onResetDemo: () => Promise<void>;
  onToggleEmergencyStop: () => void;
  onOpenInAppQuotex?: () => void;
}

export function AccountsAndRiskPanel({
  accounts,
  activePair,
  market,
  timeframe,
  activePrediction,
  defaultStake,
  defaultPayoutPct,
  emergencyStopped,
  autoTradingEnabled,
  tradingSessionActive,
  botStatusNotice,
  googleUserEmail,
  googleUserName,
  googleTokenReady,
  gmailBusy,
  gmailError,
  gmailVerification,
  onToggleAutoTrading,
  onStartTrading,
  onStopTrading,
  onGoogleSignIn,
  onGoogleSignOut,
  onScanGmailQuotex,
  onSaveQuotexProfile,
  onPlaceDemoTrade,
  onResetDemo,
  onToggleEmergencyStop,
  onOpenInAppQuotex,
}: AccountsAndRiskPanelProps) {
  const [stake, setStake] = useState<number>(defaultStake || 25);
  const [tradeStatus, setTradeStatus] = useState<string | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [busy, setBusy] = useState<boolean>(false);

  const savedProfile = accounts?.quotexProfile;
  const [fullName, setFullName] = useState<string>('');
  const [gmailEmail, setGmailEmail] = useState<string>('');
  const [country, setCountry] = useState<string>('');
  const [accountCurrency, setAccountCurrency] = useState<string>('USD');
  const [idDocumentReady, setIdDocumentReady] = useState<boolean>(false);
  const [addressProofReady, setAddressProofReady] = useState<boolean>(false);
  const [profileSaving, setProfileSaving] = useState<boolean>(false);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [copiedEmail, setCopiedEmail] = useState<boolean>(false);

  useEffect(() => {
    if (savedProfile) {
      setFullName((prev) => prev || savedProfile.fullName || googleUserName || '');
      setGmailEmail((prev) => prev || savedProfile.gmailEmail || googleUserEmail || '');
      setCountry((prev) => prev || savedProfile.country || '');
      setAccountCurrency(savedProfile.accountCurrency || 'USD');
      setIdDocumentReady(savedProfile.idDocumentReady);
      setAddressProofReady(savedProfile.addressProofReady);
    } else if (googleUserEmail || googleUserName) {
      setFullName((prev) => prev || googleUserName || '');
      setGmailEmail((prev) => prev || googleUserEmail || '');
    }
  }, [savedProfile, googleUserEmail, googleUserName]);

  const demo = accounts?.demo ?? {
    balance: 10000,
    initialBalance: 10000,
    currency: 'USD',
    totalTrades: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    netPnl: 0,
    updatedAt: Date.now(),
  };

  const metrics = calculateDemoPayoutMetrics(stake, defaultPayoutPct);
  const lastTrade = accounts?.demoTrades[0];
  const localValidation = validateDemoStake(
    stake,
    demo.balance,
    lastTrade?.stake,
    lastTrade?.outcome === 'LOSS',
  );

  const botRunning = autoTradingEnabled && tradingSessionActive && !emergencyStopped;

  const readiness = evaluateQuotexReadinessSummary({
    fullName,
    gmailEmail,
    country,
    accountCurrency,
    idDocumentReady,
    addressProofReady,
    gmailVerified: Boolean(savedProfile?.gmailVerified || googleUserEmail),
  });

  const handleSimulate = async (dir: 'UP' | 'DOWN') => {
    setTradeError(null);
    setTradeStatus(null);
    setBusy(true);
    try {
      const res = await onPlaceDemoTrade(dir, stake);
      if (!res.ok) {
        setTradeError(res.error ?? 'Demo trade rejected.');
      } else {
        setTradeStatus(
          res.warning
            ? `Simulated ${dir} placed. ${res.warning}`
            : `Simulated ${dir} (${activePair.symbol} · $${stake.toFixed(2)}) locked for candle close.`,
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileNotice(null);
    setProfileSaving(true);
    try {
      const res = await onSaveQuotexProfile({
        fullName,
        gmailEmail,
        country,
        accountCurrency,
        idDocumentReady,
        addressProofReady,
        gmailVerified: Boolean(savedProfile?.gmailVerified || googleUserEmail),
      });
      setProfileNotice(
        res.ok
          ? 'Quotex readiness checklist saved to database.'
          : (res.error ?? 'Unable to save checklist.'),
      );
    } finally {
      setProfileSaving(false);
    }
  };

  const handleCopyEmail = async () => {
    const emailToCopy = gmailEmail.trim() || googleUserEmail || '';
    if (!emailToCopy) return;
    try {
      await navigator.clipboard.writeText(emailToCopy);
      setCopiedEmail(true);
      window.setTimeout(() => setCopiedEmail(false), 1800);
    } catch {
      // Clipboard unavailable in insecure context
    }
  };

  return (
    <section
      aria-label="Demo & Live Accounts, Quotex Info & Risk Management"
      data-testid="accounts-risk-panel"
      className="grid grid-cols-1 gap-4 lg:grid-cols-3"
    >
      {/* 1. DEMO ACCOUNT SIMULATOR & 3GP.BOT AUTO TRADING */}
      <div className="neon-panel rounded-2xl p-4 flex flex-col justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-white">
                DEMO ACCOUNT &amp; 3GP.bot
              </h3>
            </div>
            <span className="rounded border border-sky-400/40 bg-sky-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-200 whitespace-nowrap">
              DEMO PAPER EXECUTION
            </span>
          </div>

          {/* 3GP.bot Auto Trading ON/OFF + Start Trading */}
          <div className="mb-2.5 rounded-xl border border-amber-400/35 bg-[#050C1D] p-2.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-bold text-white">
                <Bot className="h-4 w-4 text-amber-300" aria-hidden="true" />
                <span>3GP.bot Auto Trading</span>
              </div>
              <button
                type="button"
                onClick={onToggleAutoTrading}
                aria-pressed={autoTradingEnabled}
                data-testid="auto-trading-toggle"
                className={`min-h-[32px] rounded-lg border px-3 font-mono text-xs font-extrabold cursor-pointer transition-colors ${
                  autoTradingEnabled
                    ? 'border-emerald-400/80 bg-emerald-500/25 text-emerald-200'
                    : 'border-slate-600 bg-slate-900 text-slate-300 hover:border-sky-400'
                }`}
              >
                {autoTradingEnabled ? 'ON' : 'OFF'}
              </button>
            </div>

            <button
              type="button"
              disabled={emergencyStopped}
              onClick={botRunning ? onStopTrading : onStartTrading}
              data-testid="start-trading-btn"
              className={`flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold cursor-pointer whitespace-nowrap disabled:opacity-50 ${
                botRunning
                  ? 'border-rose-400/80 bg-rose-500/25 text-rose-100 hover:bg-rose-500/35'
                  : 'border-amber-300/80 bg-gradient-to-r from-amber-400 via-pink-500 to-cyan-400 text-slate-950 shadow-[0_0_18px_rgba(236,72,153,0.35)]'
              }`}
            >
              {botRunning ? (
                <>
                  <Square className="h-3.5 w-3.5 fill-rose-200" aria-hidden="true" />
                  <span>Stop 3GP.bot Trading</span>
                </>
              ) : (
                <>
                  <Play className="h-3.5 w-3.5 fill-slate-950" aria-hidden="true" />
                  <span>Start Trading (3GP.bot)</span>
                </>
              )}
            </button>

            <p className="text-[10px] text-slate-400">
              {botRunning
                ? 'Active on Demo $10k virtual balance · Live broker not connected.'
                : 'Places virtual Demo trades automatically on confirmed UP/DOWN candles when ON.'}
            </p>
            {botStatusNotice && (
              <p className="rounded-lg border border-sky-400/40 bg-sky-950/50 px-2 py-1 text-[11px] text-sky-200">
                {botStatusNotice}
              </p>
            )}
          </div>

          <div className="grid grid-cols-3 gap-2 rounded-xl border border-sky-500/20 bg-[#040B19] p-2.5 text-center font-mono tabular-nums">
            <div>
              <div className="text-[10px] text-slate-400">Balance</div>
              <div className="text-sm font-extrabold text-white" data-testid="demo-balance">
                ${demo.balance.toFixed(2)}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Net PnL</div>
              <div
                className={`text-sm font-bold ${
                  demo.netPnl > 0
                    ? 'text-emerald-400'
                    : demo.netPnl < 0
                      ? 'text-rose-400'
                      : 'text-slate-300'
                }`}
              >
                {demo.netPnl >= 0 ? `+$${demo.netPnl.toFixed(2)}` : `-$${Math.abs(demo.netPnl).toFixed(2)}`}
              </div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">W / L</div>
              <div className="text-sm font-bold text-sky-200">
                {demo.wins}/{demo.losses}
              </div>
            </div>
          </div>

          <div className="mt-2.5 grid grid-cols-2 gap-2 text-xs">
            <label className="block">
              <span className="mb-1 block text-[11px] text-slate-400">Investment ($ · No Martingale)</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, Math.floor(demo.balance))}
                value={stake}
                onChange={(e) => setStake(Number(e.target.value))}
                aria-label="Demo Investment Amount"
                className="min-h-[40px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 font-mono text-white tabular-nums focus:border-sky-400 focus:outline-none"
              />
            </label>
            <div className="rounded-xl border border-sky-500/20 bg-[#040B19] px-3 py-1.5 font-mono text-[11px] tabular-nums flex flex-col justify-center">
              <div className="text-emerald-400">
                Payout ({defaultPayoutPct}%): +${metrics.potentialProfit.toFixed(2)}
              </div>
              <div className="text-rose-400">
                Max Loss: -${metrics.maxRiskLoss.toFixed(2)}
              </div>
            </div>
          </div>

          {localValidation.martingaleWarning && (
            <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-950/40 px-2.5 py-1.5 text-[11px] text-amber-200">
              {localValidation.martingaleWarning}
            </p>
          )}
          {tradeError && (
            <p className="mt-2 rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[11px] text-rose-200">
              {tradeError}
            </p>
          )}
          {tradeStatus && (
            <p className="mt-2 rounded-lg border border-emerald-500/40 bg-emerald-950/40 px-2.5 py-1.5 text-[11px] text-emerald-200">
              {tradeStatus}
            </p>
          )}

          {accounts && accounts.demoTrades.length > 0 && (
            <div className="mt-2.5 space-y-1">
              <div className="text-[10px] font-mono uppercase tracking-wider text-slate-400">
                Recent Demo Trades
              </div>
              {accounts.demoTrades.slice(0, 4).map((t) => (
                <div
                  key={t.id}
                  className="flex items-center justify-between rounded-lg border border-sky-500/20 bg-[#040B19] px-2.5 py-1 font-mono text-[11px] tabular-nums"
                >
                  <span className="text-slate-200 truncate">
                    {t.pairSymbol}{' '}
                    <strong className={t.direction === 'UP' ? 'text-emerald-400' : 'text-rose-400'}>
                      {t.direction}
                    </strong>
                  </span>
                  <span
                    className={
                      t.outcome === 'WIN'
                        ? 'text-emerald-400 font-bold'
                        : t.outcome === 'LOSS'
                          ? 'text-rose-400 font-bold'
                          : 'text-amber-300'
                    }
                  >
                    {t.outcome === 'PENDING'
                      ? `$${t.stake} PENDING`
                      : `${t.outcome} ${t.pnl >= 0 ? `+$${t.pnl.toFixed(2)}` : `-$${Math.abs(t.pnl).toFixed(2)}`}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy || emergencyStopped || !localValidation.valid}
              onClick={() => void handleSimulate('UP')}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-emerald-400/70 bg-emerald-500/20 px-3 text-xs font-extrabold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-45 cursor-pointer"
            >
              <ArrowUpRight className="h-4 w-4 text-emerald-400" aria-hidden="true" />
              <span>Demo UP</span>
            </button>
            <button
              type="button"
              disabled={busy || emergencyStopped || !localValidation.valid}
              onClick={() => void handleSimulate('DOWN')}
              className="flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-rose-400/70 bg-rose-500/20 px-3 text-xs font-extrabold text-rose-100 hover:bg-rose-500/30 disabled:opacity-45 cursor-pointer"
            >
              <ArrowDownRight className="h-4 w-4 text-rose-400" aria-hidden="true" />
              <span>Demo DOWN</span>
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400">
            <span>{accounts?.demoTrades.length ?? 0} recent virtual trades</span>
            <button
              type="button"
              onClick={() => void onResetDemo()}
              className="inline-flex items-center gap-1 text-sky-300 hover:text-white cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" aria-hidden="true" />
              <span>Reset $10k</span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. LIVE ACCOUNT VERIFIED STATUS */}
      <div className="neon-panel rounded-2xl p-4 flex flex-col justify-between gap-3">
        <div>
          <div className="mb-2 flex items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-amber-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-white">
                LIVE ACCOUNT Status
              </h3>
            </div>
            <span className="rounded border border-amber-400/50 bg-amber-500/15 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-200">
              {accounts?.live.statusLabel ?? 'Not Connected'}
            </span>
          </div>

          <div className="rounded-xl border border-sky-500/20 bg-[#040B19] p-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Connection</span>
              <span className="font-mono font-bold text-rose-300">Not Connected</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Verified Live Balance</span>
              <span className="font-mono font-bold text-slate-300">Unavailable</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Auto Live Execution</span>
              <span className="font-mono font-bold text-emerald-300">Disabled (Safe)</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Current Signal Target</span>
              <span className="font-mono font-bold text-sky-200">
                {activePair.symbol} · {timeframe}
              </span>
            </div>
          </div>

          <div className="mt-2.5 rounded-xl border border-sky-500/20 bg-[#040B19] p-2.5 text-[11px] font-mono text-slate-300 space-y-1">
            <div>
              Signal:{' '}
              <strong
                className={
                  activePrediction?.direction === 'UP'
                    ? 'text-emerald-400'
                    : activePrediction?.direction === 'DOWN'
                      ? 'text-rose-400'
                      : 'text-amber-300'
                }
              >
                {activePrediction
                  ? `${activePrediction.direction} (${activePrediction.confidence}%)`
                  : 'WAIT FOR SIGNAL'}
              </strong>
            </div>
            <div>
              Market Mode: <strong className="text-white">{market}</strong>
            </div>
          </div>

          <p className="mt-2.5 text-xs text-slate-300 leading-relaxed">
            {accounts?.live.note ??
              'Live broker funds are never fabricated or assumed. Account switching is never automated and login passwords are never stored.'}
          </p>
        </div>

        <div className="space-y-2">
          <div className="rounded-xl border border-sky-500/20 bg-[#050C1B] px-3 py-2 text-[11px] text-slate-400">
            Authorized Official API Only · Manual Confirmation Required
          </div>
          <button
            type="button"
            onClick={onToggleEmergencyStop}
            data-testid="risk-emergency-stop"
            className={`flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl border px-3 text-xs font-extrabold cursor-pointer ${
              emergencyStopped
                ? 'border-emerald-400 bg-emerald-500/20 text-emerald-100'
                : 'border-rose-500/80 bg-rose-950/70 text-rose-100 hover:bg-rose-900/80'
            }`}
          >
            <OctagonAlert className="h-4 w-4 text-rose-400" aria-hidden="true" />
            <span>{emergencyStopped ? 'RESUME SYSTEM CONTROLS' : 'EMERGENCY STOP ALL'}</span>
          </button>
        </div>
      </div>

      {/* 3. QUOTEX.COM + GMAIL AUTO-FILL & DOCUMENT CHECKLIST */}
      <div className="neon-panel rounded-2xl p-4 flex flex-col justify-between gap-3">
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2 border-b border-sky-500/20 pb-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-sky-400" aria-hidden="true" />
              <h3 className="font-display text-sm font-bold text-white">
                Quotex.com &amp; Gmail Sync
              </h3>
            </div>
            <span className="rounded border border-slate-600 bg-slate-900 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-300">
              {readiness.pct}% READY
            </span>
          </div>

          {/* Google Sign-In / Gmail Connection */}
          {!googleUserEmail ? (
            <div className="rounded-xl border border-sky-500/25 bg-[#040B19] p-2.5 space-y-2">
              <p className="text-[11px] text-slate-300 leading-snug">
                Connect your Gmail account via Google OAuth to auto-fill your Quotex login profile and verify Quotex emails.
              </p>
              <button
                type="button"
                disabled={gmailBusy}
                onClick={() => void onGoogleSignIn()}
                data-testid="google-signin-btn"
                className="flex min-h-[40px] w-full items-center justify-center gap-2.5 rounded-xl border border-[#747775] bg-white px-4 py-2 text-xs font-semibold text-[#1f1f1f] shadow-sm transition-colors hover:bg-slate-100 disabled:opacity-60 cursor-pointer whitespace-nowrap"
              >
                <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  />
                </svg>
                <span>{gmailBusy ? 'Connecting Google…' : 'Sign in with Google'}</span>
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/25 p-2.5 space-y-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-emerald-200 font-semibold truncate">
                  <MailCheck className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                  <span className="truncate">{googleUserEmail}</span>
                </span>
                <button
                  type="button"
                  onClick={() => void onGoogleSignOut()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-[10px] text-slate-300 hover:text-white cursor-pointer shrink-0"
                >
                  <LogOut className="h-3 w-3" aria-hidden="true" />
                  <span>Sign Out</span>
                </button>
              </div>
              <button
                type="button"
                disabled={gmailBusy || !googleTokenReady}
                onClick={() => void onScanGmailQuotex()}
                data-testid="scan-gmail-quotex-btn"
                className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/60 bg-sky-500/20 px-3 text-[11px] font-bold text-sky-100 hover:bg-sky-500/30 disabled:opacity-50 cursor-pointer"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${gmailBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
                <span>
                  {googleTokenReady
                    ? 'Scan Gmail for Quotex Emails'
                    : 'Re-authenticate Google for Gmail Read'}
                </span>
              </button>
            </div>
          )}

          {gmailError && (
            <p className="rounded-lg border border-rose-500/40 bg-rose-950/40 px-2.5 py-1.5 text-[11px] text-rose-200">
              {gmailError}
            </p>
          )}

          {gmailVerification && (
            <div className="rounded-xl border border-sky-500/25 bg-[#040B19] p-2 text-[11px] space-y-1">
              <div className="font-mono font-bold text-sky-300">
                Gmail Scan ({gmailVerification.messages.length} Quotex matches)
              </div>
              {gmailVerification.messages.length === 0 ? (
                <div className="text-slate-400">No Quotex emails found in inbox yet.</div>
              ) : (
                gmailVerification.messages.slice(0, 2).map((m) => (
                  <div key={m.id} className="truncate text-slate-300">
                    • {m.subject}
                  </div>
                ))
              )}
            </div>
          )}

          {/* Auto-Filled Quotex Readiness Profile & Document Checklist (Zero Passwords / Zero File Uploads) */}
          <form onSubmit={handleSaveProfile} className="space-y-2 text-xs">
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Legal Full Name"
                aria-label="Quotex Full Legal Name"
                className="min-h-[36px] rounded-lg border border-sky-500/35 bg-[#040B1A] px-2.5 text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
              <input
                type="email"
                value={gmailEmail}
                onChange={(e) => setGmailEmail(e.target.value)}
                placeholder="Gmail Login Email"
                aria-label="Quotex Gmail Email"
                className="min-h-[36px] rounded-lg border border-sky-500/35 bg-[#040B1A] px-2.5 text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
              <input
                type="text"
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="Country (e.g. Pakistan)"
                aria-label="Quotex Country"
                className="min-h-[36px] rounded-lg border border-sky-500/35 bg-[#040B1A] px-2.5 text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
              <select
                value={accountCurrency}
                onChange={(e) => setAccountCurrency(e.target.value)}
                aria-label="Quotex Account Currency"
                className="min-h-[36px] rounded-lg border border-sky-500/35 bg-[#040B1A] px-2.5 text-white focus:border-sky-400 focus:outline-none"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="PKR">PKR (₨)</option>
                <option value="INR">INR (₹)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 text-[11px]">
              <label className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-sky-500/25 bg-[#040B19] px-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={idDocumentReady}
                  onChange={(e) => setIdDocumentReady(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-400"
                />
                <FileCheck2 className="h-3.5 w-3.5 text-sky-400 shrink-0" aria-hidden="true" />
                <span className="truncate">Gov ID Ready</span>
              </label>

              <label className="flex min-h-[34px] items-center gap-1.5 rounded-lg border border-sky-500/25 bg-[#040B19] px-2 text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={addressProofReady}
                  onChange={(e) => setAddressProofReady(e.target.checked)}
                  className="h-3.5 w-3.5 accent-emerald-400"
                />
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" aria-hidden="true" />
                <span className="truncate">Address Proof</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={profileSaving}
              data-testid="save-quotex-profile-btn"
              className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-sky-400/50 bg-sky-500/15 px-3 text-[11px] font-bold text-sky-100 hover:bg-sky-500/25 cursor-pointer"
            >
              <span>{profileSaving ? 'Saving…' : 'Save Quotex Readiness Profile'}</span>
            </button>

            {profileNotice && (
              <p className="text-[11px] text-emerald-300">{profileNotice}</p>
            )}
          </form>
        </div>

        <div className="space-y-2 pt-1">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => void handleCopyEmail()}
              className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-slate-600 bg-slate-900/90 px-2.5 text-xs font-semibold text-slate-200 hover:border-sky-400 cursor-pointer whitespace-nowrap"
            >
              {copiedEmail ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" aria-hidden="true" />
                  <span>Copied Gmail</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
                  <span>Copy Gmail</span>
                </>
              )}
            </button>

            <a
              href={accounts?.quotex.platformUrl ?? 'https://qxbroker.com/en/sign-in'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-sky-400/60 bg-[#061229] px-2.5 text-xs font-bold text-sky-100 hover:border-sky-300 hover:bg-sky-950/60 whitespace-nowrap"
            >
              <ExternalLink className="h-3.5 w-3.5 text-sky-400" aria-hidden="true" />
              <span>Open Quotex</span>
            </a>
          </div>
          <p className="text-[10px] text-slate-400 leading-tight">
            Safe mode: passwords, raw ID scans, browser auto-clicking, and scraping on qxbroker.com are disabled.
          </p>
          {onOpenInAppQuotex && (
            <button
              type="button"
              onClick={onOpenInAppQuotex}
              data-testid="jump-to-quotex-visual-btn"
              className="flex min-h-[34px] w-full items-center justify-center gap-1.5 rounded-lg border border-cyan-400/50 bg-cyan-500/10 px-2.5 text-[11px] font-bold text-cyan-200 hover:bg-cyan-500/20 cursor-pointer"
            >
              <span>Open In-App Browser &amp; Live Screen AI</span>
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
