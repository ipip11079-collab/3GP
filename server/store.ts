import type { RecordedPrediction } from '../src/types/trading.ts';
import {
  clearPredictionsInDb,
  insertPredictionToDb,
  loadPredictionsFromDb,
  updatePredictionSettlementInDb,
} from './db.ts';

export function loadPredictions(): RecordedPrediction[] {
  return loadPredictionsFromDb();
}

export function savePredictions(records: RecordedPrediction[]): void {
  for (const rec of records) {
    if (rec.outcome !== 'PENDING' && rec.actualClosePrice !== null && rec.settledAt !== null) {
      updatePredictionSettlementInDb(rec.id, rec.actualClosePrice, rec.outcome, rec.settledAt);
    }
  }
}

export function appendPrediction(record: RecordedPrediction): RecordedPrediction[] {
  return insertPredictionToDb(record);
}

export function clearPredictions(): void {
  clearPredictionsInDb();
}
