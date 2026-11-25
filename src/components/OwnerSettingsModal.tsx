import { useEffect, useState } from 'react';
import { Check, KeyRound, Lock, ShieldCheck, Unlock, X } from 'lucide-react';
import { TRADING_PAIRS } from '../lib/pairs.ts';
import type {
  AssistantLanguage,
  MarketMode,
  OwnerSettings,
  Timeframe,
} from '../types/trading.ts';

interface OwnerSettingsModalProps {
  open: boolean;
  settings: OwnerSettings | null;
  ownerToken: string | null;
  onClose: () => void;
  onClaimPasscode: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  onUnlock: (passcode: string) => Promise<{ ok: boolean; error?: string }>;
  onLockRelock: () => void;
  onSaveSettings: (patch: Partial<OwnerSettings>) => Promise<{ ok: boolean; error?: string }>;
}

export function OwnerSettingsModal({
  open,
  settings,
  ownerToken,
  onClose,
  onClaimPasscode,
  onUnlock,
  onLockRelock,
  onSaveSettings,
}: OwnerSettingsModalProps) {
  const [passcodeInput, setPasscodeInput] = useState('');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [primaryMarket, setPrimaryMarket] = useState<MarketMode>('OTC');
  const [primaryTimeframe, setPrimaryTimeframe] = useState<Timeframe>('1m');
  const [defaultPairId, setDefaultPairId] = useState<string>('BTC-USD');
  const [confidenceThreshold, setConfidenceThreshold] = useState<number>(58);
  const [assistantLanguage, setAssistantLanguage] = useState<AssistantLanguage>('en');
  const [demoStakeAmount, setDemoStakeAmount] = useState<number>(25);
  const [defaultPayoutPct, setDefaultPayoutPct] = useState<number>(85);
  const [autoAgentEnabled, setAutoAgentEnabled] = useState<boolean>(true);
  const [autoBoardEnabled, setAutoBoardEnabled] = useState<boolean>(true);
  const [autoPairSwitch, setAutoPairSwitch] = useState<boolean>(true);
  const [autoTradingEnabled, setAutoTradingEnabled] = useState<boolean>(false);
  const [birthdayTheme, setBirthdayTheme] = useState<boolean>(true);
  const [voiceEnabled, setVoiceEnabled] = useState<boolean>(false);
  const [ownerLocked, setOwnerLocked] = useState<boolean>(true);

  useEffect(() => {
    if (!settings) return;
    setPrimaryMarket(settings.primaryMarket);
    setPrimaryTimeframe(settings.primaryTimeframe);
    setDefaultPairId(settings.defaultPairId);
    setConfidenceThreshold(settings.confidenceThreshold);
    setAssistantLanguage(settings.assistantLanguage);
    setDemoStakeAmount(settings.demoStakeAmount);
    setDefaultPayoutPct(settings.defaultPayoutPct);
    setAutoAgentEnabled(settings.autoAgentEnabled);
    setAutoBoardEnabled(settings.autoBoardEnabled);
    setAutoPairSwitch(settings.autoPairSwitch);
    setAutoTradingEnabled(settings.autoTradingEnabled);
    setBirthdayTheme(settings.birthdayTheme);
    setVoiceEnabled(settings.voiceEnabled);
    setOwnerLocked(settings.ownerLocked);
  }, [settings, open]);

  if (!open || !settings) return null;

  const isClaimed = settings.lockClaimed;
  const isEditingAllowed = !settings.ownerLocked || !isClaimed || Boolean(ownerToken);

  const handleClaimOrUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const res = isClaimed
        ? await onUnlock(passcodeInput)
        : await onClaimPasscode(passcodeInput);
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Authentication failed.');
      } else {
        setPasscodeInput('');
        setStatusMsg(
          isClaimed
            ? 'Owner session unlocked for this session.'
            : 'Owner Lock Passcode claimed and saved permanently.',
        );
      }
    } finally {
      setBusy(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setStatusMsg(null);
    setBusy(true);
    try {
      const res = await onSaveSettings({
        ownerLocked,
        primaryMarket,
        primaryTimeframe,
        defaultPairId,
        confidenceThreshold,
        assistantLanguage,
        demoStakeAmount,
        defaultPayoutPct,
        autoAgentEnabled,
        autoBoardEnabled,
        autoPairSwitch,
        autoTradingEnabled,
        birthdayTheme,
        voiceEnabled,
      });
      if (!res.ok) {
        setErrorMsg(res.error ?? 'Failed to save owner settings.');
      } else {
        setStatusMsg('Permanent Owner Settings saved to database.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Owner Settings Lock & Permanent Model Configuration"
      data-testid="owner-settings-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div className="neon-panel relative max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl p-5">
        <div className="mb-4 flex items-center justify-between gap-3 border-b border-sky-500/25 pb-3">
          <div className="flex items-center gap-2.5">
            {isEditingAllowed ? (
              <Unlock className="h-5 w-5 text-emerald-400" aria-hidden="true" />
            ) : (
              <Lock className="h-5 w-5 text-amber-400" aria-hidden="true" />
            )}
            <div>
              <h2 className="font-display text-lg font-bold text-white">
                Permanent Model &amp; Owner Settings Lock
              </h2>
              <p className="text-xs text-slate-400">
                3GP original model identity is preserved. AI self-learning cannot overwrite owner settings.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Owner Settings Modal"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-700 bg-slate-900 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {statusMsg && (
          <div className="mb-3 rounded-xl border border-emerald-500/50 bg-emerald-950/50 px-3 py-2 text-xs text-emerald-200 flex items-center gap-2">
            <Check className="h-4 w-4 shrink-0 text-emerald-400" />
            <span>{statusMsg}</span>
          </div>
        )}
        {errorMsg && (
          <div className="mb-3 rounded-xl border border-rose-500/50 bg-rose-950/50 px-3 py-2 text-xs text-rose-200">
            {errorMsg}
          </div>
        )}

        {/* Owner Authentication / First-Run Claim */}
        {(!isClaimed || !ownerToken) && (
          <form
            onSubmit={handleClaimOrUnlock}
            className="mb-4 rounded-xl border border-amber-400/40 bg-[#050C1B] p-3.5"
          >
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-300">
              <KeyRound className="h-4 w-4" aria-hidden="true" />
              <span>
                {isClaimed
                  ? 'Unlock Owner Settings (Enter Passcode)'
                  : 'First-Run Setup: Claim Owner Settings Lock Passcode'}
              </span>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="password"
                value={passcodeInput}
                onChange={(e) => setPasscodeInput(e.target.value)}
                minLength={4}
                required
                placeholder={isClaimed ? 'Enter owner passcode...' : 'Create owner passcode (min 4 chars)...'}
                aria-label="Owner Passcode"
                className="min-h-[42px] flex-1 rounded-xl border border-sky-500/40 bg-[#030712] px-3 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
              <button
                type="submit"
                disabled={busy}
                className="min-h-[42px] rounded-xl border border-amber-400/70 bg-amber-500/20 px-4 text-xs font-bold text-amber-100 hover:bg-amber-500/30 disabled:opacity-50 cursor-pointer whitespace-nowrap"
              >
                {isClaimed ? 'Unlock Settings' : 'Claim & Lock'}
              </button>
            </div>
          </form>
        )}

        {ownerToken && (
          <div className="mb-4 flex items-center justify-between rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-3.5 py-2 text-xs text-emerald-200">
            <span className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Owner Verified — Editing Unlocked</span>
            </span>
            <button
              type="button"
              onClick={onLockRelock}
              className="rounded-lg border border-amber-400/60 bg-amber-500/15 px-2.5 py-1 font-semibold text-amber-200 hover:bg-amber-500/25 cursor-pointer"
            >
              Re-Lock Session
            </button>
          </div>
        )}

        {/* Permanent Configuration Form */}
        <form onSubmit={handleSave} className="space-y-3 text-xs">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1 block text-slate-300 font-semibold">Primary Market</span>
              <select
                value={primaryMarket}
                disabled={!isEditingAllowed}
                onChange={(e) => setPrimaryMarket(e.target.value as MarketMode)}
                className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white disabled:opacity-50"
              >
                <option value="OTC">OTC MARKET (Primary)</option>
                <option value="LIVE">LIVE MARKET</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-300 font-semibold">Primary Timeframe</span>
              <select
                value={primaryTimeframe}
                disabled={!isEditingAllowed}
                onChange={(e) => setPrimaryTimeframe(e.target.value as Timeframe)}
                className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white disabled:opacity-50"
              >
                <option value="1m">1 Minute (Primary)</option>
                <option value="30s">30 Seconds</option>
                <option value="10s">10 Seconds</option>
                <option value="5s">5 Seconds</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-300 font-semibold">Default Pair</span>
              <select
                value={defaultPairId}
                disabled={!isEditingAllowed}
                onChange={(e) => setDefaultPairId(e.target.value)}
                className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white disabled:opacity-50"
              >
                {TRADING_PAIRS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.symbol} — {p.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-300 font-semibold">Voice AI Language</span>
              <select
                value={assistantLanguage}
                disabled={!isEditingAllowed}
                onChange={(e) => setAssistantLanguage(e.target.value as AssistantLanguage)}
                className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white disabled:opacity-50"
              >
                <option value="en">English (en-US)</option>
                <option value="ur">Urdu · اردو (ur-PK)</option>
                <option value="hi">Hindi · हिन्दी (hi-IN)</option>
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-slate-300 font-semibold">
                Confidence Gate ({confidenceThreshold}%)
              </span>
              <input
                type="range"
                min={52}
                max={85}
                value={confidenceThreshold}
                disabled={!isEditingAllowed}
                onChange={(e) => setConfidenceThreshold(Number(e.target.value))}
                className="w-full accent-sky-400"
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-slate-300 font-semibold">Demo Stake ($)</span>
                <input
                  type="number"
                  min={1}
                  max={5000}
                  value={demoStakeAmount}
                  disabled={!isEditingAllowed}
                  onChange={(e) => setDemoStakeAmount(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white tabular-nums disabled:opacity-50"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-slate-300 font-semibold">Payout (%)</span>
                <input
                  type="number"
                  min={50}
                  max={98}
                  value={defaultPayoutPct}
                  disabled={!isEditingAllowed}
                  onChange={(e) => setDefaultPayoutPct(Number(e.target.value))}
                  className="min-h-[42px] w-full rounded-xl border border-sky-500/40 bg-[#040B1A] px-3 text-white tabular-nums disabled:opacity-50"
                />
              </label>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 pt-1">
            {[
              { label: 'Owner Lock Active', val: ownerLocked, set: setOwnerLocked },
              { label: '1m Auto Agent', val: autoAgentEnabled, set: setAutoAgentEnabled },
              { label: '1m Auto Board', val: autoBoardEnabled, set: setAutoBoardEnabled },
              { label: 'Auto Pair Switch', val: autoPairSwitch, set: setAutoPairSwitch },
              { label: '3GP.bot Auto Trade', val: autoTradingEnabled, set: setAutoTradingEnabled },
              { label: "Sam's Birthday Look", val: birthdayTheme, set: setBirthdayTheme },
              { label: 'Voice Alerts ON', val: voiceEnabled, set: setVoiceEnabled },
            ].map((item) => (
              <label
                key={item.label}
                className="flex min-h-[40px] items-center gap-2 rounded-xl border border-sky-500/25 bg-[#040B1A] px-3 py-1.5 text-slate-200 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={item.val}
                  disabled={!isEditingAllowed}
                  onChange={(e) => item.set(e.target.checked)}
                  className="h-4 w-4 accent-sky-400"
                />
                <span>{item.label}</span>
              </label>
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-sky-500/20">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[42px] rounded-xl border border-slate-700 bg-slate-900 px-4 font-semibold text-slate-300 hover:text-white cursor-pointer"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={!isEditingAllowed || busy}
              className="min-h-[42px] rounded-xl bg-gradient-to-r from-sky-500 to-cyan-500 px-5 font-bold text-slate-950 disabled:opacity-40 cursor-pointer"
            >
              Save Permanently to DB
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
