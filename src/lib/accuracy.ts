import type {
  OverallAccuracyReport,
  PredictionOutcome,
  RecordedPrediction,
  SignalDirection,
  Timeframe,
  TimeframeAccuracyStats,
} from '../types/trading.ts';

export const DEFAULT_CONFIDENCE_THRESHOLD = 58;
export const MIN_RELIABLE_SAMPLE_SIZE = 5;

export function applyConfidenceGate(
  proposedDirection: SignalDirection,
  confidence: number,
  dataSufficient: boolean,
  threshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): { direction: SignalDirection; confidence: number; rejectedReason: string | null } {
  if (!dataSufficient) {
    return {
      direction: 'NO_TRADE',
      confidence: 0,
      rejectedReason: 'Insufficient real-time market data for reliable confirmation.',
    };
  }
  if (proposedDirection === 'NO_TRADE') {
    return {
      direction: 'NO_TRADE',
      confidence: Math.round(confidence),
      rejectedReason: 'Market signals are conflicted; awaiting clearer confirmation.',
    };
  }
  const roundedConfidence = Math.min(95, Math.max(0, Math.round(confidence)));
  if (roundedConfidence < threshold) {
    return {
      direction: 'NO_TRADE',
      confidence: roundedConfidence,
      rejectedReason: `Model confidence (${roundedConfidence}%) below ${threshold}% confirmation threshold.`,
    };
  }
  return {
    direction: proposedDirection,
    confidence: roundedConfidence,
    rejectedReason: null,
  };
}

export function evaluatePredictionOutcome(
  predictedDirection: 'UP' | 'DOWN',
  entryPrice: number,
  actualClosePrice: number,
): PredictionOutcome {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(actualClosePrice)) {
    return 'PENDING';
  }
  if (actualClosePrice === entryPrice) {
    return 'DRAW';
  }
  const actualUp = actualClosePrice > entryPrice;
  if (predictedDirection === 'UP') {
    return actualUp ? 'CORRECT' : 'FALSE';
  }
  return !actualUp ? 'CORRECT' : 'FALSE';
}

export function computeTimeframeAccuracy(
  predictions: RecordedPrediction[],
  timeframe: Timeframe,
): TimeframeAccuracyStats {
  const scoped = predictions.filter((p) => p.timeframe === timeframe);
  const pending = scoped.filter((p) => p.outcome === 'PENDING').length;
  const correct = scoped.filter((p) => p.outcome === 'CORRECT').length;
  const falseCount = scoped.filter((p) => p.outcome === 'FALSE').length;
  const draw = scoped.filter((p) => p.outcome === 'DRAW').length;
  const directionalSettled = correct + falseCount;
  const settled = directionalSettled + draw;

  const accuracyPct =
    directionalSettled > 0
      ? Number(((correct / directionalSettled) * 100).toFixed(1))
      : null;

  return {
    timeframe,
    totalRecorded: scoped.length,
    pending,
    settled,
    correct,
    falseCount,
    draw,
    accuracyPct,
    sampleReliable: directionalSettled >= MIN_RELIABLE_SAMPLE_SIZE,
  };
}

export function computeOverallAccuracyReport(
  predictions: RecordedPrediction[],
  confidenceThreshold: number = DEFAULT_CONFIDENCE_THRESHOLD,
): OverallAccuracyReport {
  const byTimeframe: Record<Timeframe, TimeframeAccuracyStats> = {
    '5s': computeTimeframeAccuracy(predictions, '5s'),
    '10s': computeTimeframeAccuracy(predictions, '10s'),
    '30s': computeTimeframeAccuracy(predictions, '30s'),
    '1m': computeTimeframeAccuracy(predictions, '1m'),
  };

  const totalCorrect =
    byTimeframe['5s'].correct +
    byTimeframe['10s'].correct +
    byTimeframe['30s'].correct +
    byTimeframe['1m'].correct;
  const totalFalse =
    byTimeframe['5s'].falseCount +
    byTimeframe['10s'].falseCount +
    byTimeframe['30s'].falseCount +
    byTimeframe['1m'].falseCount;
  const totalPending =
    byTimeframe['5s'].pending +
    byTimeframe['10s'].pending +
    byTimeframe['30s'].pending +
    byTimeframe['1m'].pending;
  const totalSettled =
    byTimeframe['5s'].settled +
    byTimeframe['10s'].settled +
    byTimeframe['30s'].settled +
    byTimeframe['1m'].settled;

  const directionalSettled = totalCorrect + totalFalse;
  const overallAccuracyPct =
    directionalSettled > 0
      ? Number(((totalCorrect / directionalSettled) * 100).toFixed(1))
      : null;

  return {
    byTimeframe,
    totalSettled,
    totalCorrect,
    totalFalse,
    totalPending,
    overallAccuracyPct,
    confidenceThreshold,
  };
}
