import type {
  ConditionLearningStat,
  LearningProfile,
  RecordedPrediction,
  SmcAnalysis,
  TechnicalAnalysis,
} from '../types/trading.ts';

export function extractIndicatorSignature(
  analysis: TechnicalAnalysis,
  smc?: SmcAnalysis,
): string {
  const emaTag = smc ? `EMA9/21/50:${smc.ema9_21_50Alignment}` : `EMA:${analysis.emaAlignment}`;
  const macdTag = `MACD:${analysis.macdBias}`;
  const smcTag = smc
    ? smc.bos !== 'NONE'
      ? `BOS:${smc.bos}`
      : smc.choch !== 'NONE'
        ? `CHOCH:${smc.choch}`
        : `SMC:${smc.smcBias}`
    : 'SMC:NONE';
  return `${emaTag}|${macdTag}|${smcTag}`;
}

function buildGroupStats(
  groups: Map<string, { label: string; settled: number; correct: number; falseCount: number }>,
): ConditionLearningStat[] {
  const out: ConditionLearningStat[] = [];
  for (const [key, item] of groups.entries()) {
    if (item.settled === 0) continue;
    const winRatePct = Number(((item.correct / item.settled) * 100).toFixed(1));
    let status: 'STRONG' | 'WEAK' | 'NEUTRAL' = 'NEUTRAL';
    if (item.settled >= 2 && winRatePct >= 58) status = 'STRONG';
    else if (item.settled >= 2 && winRatePct <= 45) status = 'WEAK';
    out.push({
      key,
      label: item.label,
      settled: item.settled,
      correct: item.correct,
      falseCount: item.falseCount,
      winRatePct,
      status,
    });
  }
  return out.sort((a, b) => b.settled - a.settled || b.winRatePct - a.winRatePct);
}

export function computeLearningProfile(
  records: RecordedPrediction[],
  nowMs: number = Date.now(),
): LearningProfile {
  const directionalSettled = records.filter(
    (r) => r.outcome === 'CORRECT' || r.outcome === 'FALSE',
  );

  const regimeMap = new Map<string, { label: string; settled: number; correct: number; falseCount: number }>();
  const comboMap = new Map<string, { label: string; settled: number; correct: number; falseCount: number }>();
  const pairMap = new Map<string, { label: string; settled: number; correct: number; falseCount: number }>();

  let totalCorrect = 0;
  let totalFalse = 0;

  const increment = (
    map: Map<string, { label: string; settled: number; correct: number; falseCount: number }>,
    key: string,
    label: string,
    isWin: boolean,
  ) => {
    const existing = map.get(key) ?? { label, settled: 0, correct: 0, falseCount: 0 };
    existing.settled += 1;
    if (isWin) existing.correct += 1;
    else existing.falseCount += 1;
    map.set(key, existing);
  };

  for (const r of directionalSettled) {
    const isWin = r.outcome === 'CORRECT';
    if (isWin) totalCorrect += 1;
    else totalFalse += 1;

    const regimeKey = r.marketCondition ?? 'UNSPECIFIED';
    increment(regimeMap, regimeKey, regimeKey.replace(/_/g, ' '), isWin);

    const comboKey = r.indicatorSignature ?? `${r.timeframe}:${r.predictedDirection}`;
    increment(comboMap, comboKey, comboKey.replace(/\|/g, ' · '), isWin);

    increment(pairMap, r.pairId, r.pairSymbol, isWin);
  }

  const byRegime = buildGroupStats(regimeMap);
  const byCombo = buildGroupStats(comboMap).slice(0, 8);
  const byPair = buildGroupStats(pairMap).slice(0, 8);

  const totalSettled = directionalSettled.length;
  const overallWinRatePct =
    totalSettled > 0 ? Number(((totalCorrect / totalSettled) * 100).toFixed(1)) : null;

  const strengths: string[] = [];
  const weaknesses: string[] = [];

  for (const stat of [...byCombo, ...byRegime, ...byPair]) {
    if (stat.status === 'STRONG' && strengths.length < 4) {
      strengths.push(`${stat.label}: ${stat.winRatePct}% win rate (${stat.correct}/${stat.settled})`);
    } else if (stat.status === 'WEAK' && weaknesses.length < 4) {
      weaknesses.push(`${stat.label}: ${stat.winRatePct}% win rate (${stat.correct}/${stat.settled}) — raise caution`);
    }
  }

  if (totalSettled === 0) {
    strengths.push('Self-learning database initialized — collecting verified candle settlements.');
  } else if (strengths.length === 0) {
    strengths.push('No high-sample outperforming regime isolated yet (accumulating >=2 settled trades per setup).');
  }
  if (totalSettled > 0 && weaknesses.length === 0) {
    weaknesses.push('No recurring weak setup detected across settled signals.');
  }

  // Advisory confidence calibration (-6 to +6); never touches owner settings
  let advisoryAdjustment = 0;
  if (totalSettled >= 5 && overallWinRatePct !== null) {
    if (overallWinRatePct >= 65) advisoryAdjustment = 4;
    else if (overallWinRatePct <= 42) advisoryAdjustment = -5;
    else if (overallWinRatePct <= 48) advisoryAdjustment = -2;
  }

  return {
    totalSettled,
    totalCorrect,
    totalFalse,
    overallWinRatePct,
    byRegime,
    byCombo,
    byPair,
    strengths,
    weaknesses,
    advisoryAdjustment,
    lastUpdatedAt: nowMs,
  };
}
