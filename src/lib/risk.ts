import type { DemoTradeRecord } from '../types/trading.ts';
import { evaluatePredictionOutcome } from './accuracy.ts';

export function calculateDemoPayoutMetrics(stake: number, payoutPct: number): {
  potentialProfit: number;
  totalReturn: number;
  maxRiskLoss: number;
} {
  const safeStake = Math.max(0, Number.isFinite(stake) ? stake : 0);
  const safePayout = Math.max(50, Math.min(98, Number.isFinite(payoutPct) ? payoutPct : 85));
  const potentialProfit = Number(((safeStake * safePayout) / 100).toFixed(2));
  return {
    potentialProfit,
    totalReturn: Number((safeStake + potentialProfit).toFixed(2)),
    maxRiskLoss: Number(safeStake.toFixed(2)),
  };
}

export function validateDemoStake(
  stake: number,
  balance: number,
  previousStake?: number | null,
  lastTradeLost?: boolean,
): { valid: boolean; reason?: string; martingaleWarning?: string } {
  if (!Number.isFinite(stake) || stake < 1) {
    return { valid: false, reason: 'Minimum demo investment is $1.00.' };
  }
  if (stake > balance) {
    return { valid: false, reason: 'Investment exceeds available virtual demo balance.' };
  }
  if (
    lastTradeLost &&
    previousStake &&
    previousStake > 0 &&
    stake >= previousStake * 1.9
  ) {
    return {
      valid: true,
      martingaleWarning:
        'Anti-Martingale Caution: Stake nearly doubled after a loss. Keep fixed sizing for disciplined risk control.',
    };
  }
  return { valid: true };
}

export function settleDemoTradeOutcome(
  trade: DemoTradeRecord,
  actualClosePrice: number,
): { outcome: 'WIN' | 'LOSS' | 'DRAW'; pnl: number; totalCredit: number } {
  const outcome = evaluatePredictionOutcome(
    trade.direction,
    trade.entryPrice,
    actualClosePrice,
  );
  if (outcome === 'CORRECT') {
    const profit = Number(((trade.stake * trade.payoutPct) / 100).toFixed(2));
    return {
      outcome: 'WIN',
      pnl: profit,
      totalCredit: Number((trade.stake + profit).toFixed(2)),
    };
  }
  if (outcome === 'DRAW') {
    return {
      outcome: 'DRAW',
      pnl: 0,
      totalCredit: Number(trade.stake.toFixed(2)),
    };
  }
  return {
    outcome: 'LOSS',
    pnl: Number((-trade.stake).toFixed(2)),
    totalCredit: 0,
  };
}

export function evaluateQuotexReadinessSummary(profile: {
  fullName: string;
  gmailEmail: string;
  country: string;
  accountCurrency: string;
  idDocumentReady: boolean;
  addressProofReady: boolean;
  gmailVerified: boolean;
}): {
  completedSteps: number;
  totalSteps: number;
  pct: number;
  readyToOpenQuotex: boolean;
  missingSteps: string[];
} {
  const checks: Array<{ ok: boolean; label: string }> = [
    { ok: profile.gmailVerified, label: 'Verify Gmail via Google OAuth' },
    { ok: profile.fullName.trim().length >= 2, label: 'Full legal name' },
    { ok: profile.gmailEmail.includes('@'), label: 'Gmail login email' },
    { ok: profile.country.trim().length >= 2, label: 'Country of residence' },
    { ok: profile.accountCurrency.trim().length >= 3, label: 'Account currency' },
    { ok: profile.idDocumentReady, label: 'Government ID document ready' },
    { ok: profile.addressProofReady, label: 'Proof of address document ready' },
  ];

  const completedSteps = checks.filter((c) => c.ok).length;
  const totalSteps = checks.length;
  const pct = Math.round((completedSteps / totalSteps) * 100);
  const missingSteps = checks.filter((c) => !c.ok).map((c) => c.label);

  return {
    completedSteps,
    totalSteps,
    pct,
    readyToOpenQuotex: completedSteps === totalSteps,
    missingSteps,
  };
}

export function shouldTriggerBotAutoTrade(params: {
  autoTradingEnabled: boolean;
  tradingSessionActive: boolean;
  emergencyStopped: boolean;
  direction: 'UP' | 'DOWN' | 'NO_TRADE';
  confidence: number;
  confidenceThreshold: number;
  candleKey: string;
  alreadyTradedKey: string | null;
}): boolean {
  if (!params.autoTradingEnabled || !params.tradingSessionActive || params.emergencyStopped) {
    return false;
  }
  if (params.direction !== 'UP' && params.direction !== 'DOWN') {
    return false;
  }
  if (params.confidence < params.confidenceThreshold) {
    return false;
  }
  if (params.alreadyTradedKey === params.candleKey) {
    return false;
  }
  return true;
}

