export type MarketMode = 'LIVE' | 'OTC';

export type Timeframe = '5s' | '10s' | '30s' | '1m';

export type SignalDirection = 'UP' | 'DOWN' | 'NO_TRADE';

export type PredictionOutcome = 'PENDING' | 'CORRECT' | 'FALSE' | 'DRAW';

export type PairCategory = 'FX' | 'CRYPTO' | 'COMMODITY';

export type AssistantLanguage = 'en' | 'ur' | 'hi';

export type MarketRegime =
  | 'TRENDING_UP'
  | 'TRENDING_DOWN'
  | 'RANGING'
  | 'HIGH_VOLATILITY';

export interface TradingPair {
  id: string;
  symbol: string;
  base: string;
  quote: string;
  name: string;
  category: PairCategory;
  precision: number;
  krakenPair?: string;
  binanceSymbol?: string;
  yahooSymbol?: string;
  markets: MarketMode[];
}

export interface Candle {
  openTime: number; // ms epoch
  closeTime: number; // ms epoch
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  buyVolume?: number;
  sellVolume?: number;
  tradeCount?: number;
}

export interface OrderbookSnapshot {
  bestBid: number;
  bestAsk: number;
  spreadPct: number;
  bidLiquidity: number;
  askLiquidity: number;
  imbalanceRatio: number; // -1 (heavy ask) to +1 (heavy bid)
  nearestSupportWall: number | null;
  nearestResistanceWall: number | null;
}

export interface ZoneRange {
  type: 'BULLISH' | 'BEARISH' | 'NONE';
  low: number;
  high: number;
  label: string;
}

export interface SmcAnalysis {
  smcBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  marketStructure: 'BULLISH_HH_HL' | 'BEARISH_LH_LL' | 'RANGING';
  bos: 'BULLISH' | 'BEARISH' | 'NONE';
  choch: 'BULLISH' | 'BEARISH' | 'NONE';
  orderBlock: ZoneRange;
  fvg: ZoneRange;
  liquiditySweep: 'BUY_SIDE_SWEEP' | 'SELL_SIDE_SWEEP' | 'NONE';
  ema9: number;
  ema21: number;
  ema50: number;
  ema9_21_50Alignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  candlestickPattern: string;
  candlePsychology: string;
  rejectionBreakout: string;
  priceActionContext: string;
  volumeStatus: 'GENUINE_VOLUME' | 'UNAVAILABLE';
  smcScore: number; // -50 to +50
  smcFactors: string[];
}

export interface TechnicalAnalysis {
  candleCount: number;
  activeCandleCount: number;
  latestPrice: number;
  latestCandleOpenTime: number;
  latestCandleCloseTime: number;
  nextCandleOpenTime: number;
  nextCandleCloseTime: number;
  emaFast: number;
  emaMid: number;
  emaSlow: number;
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  rsi14: number;
  rsi7: number;
  stochRsi: number;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  macdBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  bollingerUpper: number;
  bollingerMiddle: number;
  bollingerLower: number;
  bollingerPercentB: number;
  marketRegime: MarketRegime;
  rocPct: number;
  atrPct: number;
  volatilityPct: number;
  supportLevel: number;
  resistanceLevel: number;
  distanceToSupportPct: number;
  distanceToResistancePct: number;
  volumeTrendRatio: number;
  takerBuyRatio: number | null;
  orderbook: OrderbookSnapshot | null;
  bullishProbability: number; // 0..100
  bearishProbability: number; // 0..100
  quantitativeConfidence: number; // 0..100
  dataSufficient: boolean;
  insufficiencyReason: string | null;
  keyFactors: string[];
  smc?: SmcAnalysis;
}

export type BroaderSentiment =
  | 'STRONG_BULLISH'
  | 'BULLISH'
  | 'NEUTRAL'
  | 'BEARISH'
  | 'STRONG_BEARISH';

export interface MultiTimeframeContext {
  anchorTimeframe: '1m';
  anchorTrend: 'BULLISH' | 'BEARISH' | 'MIXED';
  anchorRsi14: number;
  anchorRocPct: number;
  broader5mTrend: 'BULLISH' | 'BEARISH' | 'MIXED';
  broader5mRsi14: number;
  broader15mTrend: 'BULLISH' | 'BEARISH' | 'MIXED';
  broader15mRsi14: number;
  smaFast20: number;
  smaSlow50: number;
  smaCrossover: 'GOLDEN_BULL' | 'DEATH_BEAR' | 'NEUTRAL';
  smaSpreadPct: number;
  broaderSentiment: BroaderSentiment;
}

export interface ScreenerRow {
  pairId: string;
  symbol: string;
  category: PairCategory;
  precision: number;
  price: number;
  changePct: number;
  bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  strength: number;
  rsi14: number;
  dataSufficient: boolean;
  feedSource: string;
}

export interface ChartOverlayData {
  emaFast: number;
  emaSlow: number;
  ema9?: number;
  ema21?: number;
  ema50?: number;
  supportLevel: number;
  resistanceLevel: number;
  bollingerUpper: number;
  bollingerLower: number;
}

export interface PredictionResult {
  id: string;
  market: MarketMode;
  pairId: string;
  pairSymbol: string;
  timeframe: Timeframe;
  direction: SignalDirection;
  confidence: number; // 0..100 (0 if NO_TRADE due to insufficient data)
  entryPrice: number;
  precision: number;
  candleOpenTime: number;
  expiryTime: number;
  analyzedAt: number;
  feedSource: string;
  quotexConnected: boolean;
  reasoning: string[];
  multiTimeframe?: MultiTimeframeContext | null;
  candles?: Candle[];
  chartOverlay?: ChartOverlayData;
  smc?: SmcAnalysis;
  duplicatePrevented?: boolean;
  learningNote?: string | null;
  technicalSummary: {
    rsi14: number;
    stochRsi: number;
    emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
    macdBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
    bollingerPercentB: number;
    marketRegime: MarketRegime;
    volatilityPct: number;
    atrPct?: number;
    supportLevel: number;
    resistanceLevel: number;
    liquidityBias: string;
    bullishProbability: number;
    bearishProbability: number;
    candlesAnalyzed: number;
  };
  recordedForVerification: boolean;
}

export interface RecordedPrediction {
  id: string;
  market: MarketMode;
  pairId: string;
  pairSymbol: string;
  timeframe: Timeframe;
  predictedDirection: 'UP' | 'DOWN';
  confidence: number;
  entryPrice: number;
  precision: number;
  candleOpenTime: number;
  expiryTime: number;
  createdAt: number;
  feedSource: string;
  outcome: PredictionOutcome;
  actualClosePrice: number | null;
  settledAt: number | null;
  marketCondition?: MarketRegime | null;
  indicatorSignature?: string | null;
  smcSummary?: string | null;
}

export interface TimeframeAccuracyStats {
  timeframe: Timeframe;
  totalRecorded: number;
  pending: number;
  settled: number;
  correct: number;
  falseCount: number;
  draw: number;
  accuracyPct: number | null; // null when settled directional === 0
  sampleReliable: boolean; // true only when >= 5 settled directional predictions
}

export interface OverallAccuracyReport {
  byTimeframe: Record<Timeframe, TimeframeAccuracyStats>;
  totalSettled: number;
  totalCorrect: number;
  totalFalse: number;
  totalPending: number;
  overallAccuracyPct: number | null;
  confidenceThreshold: number;
}

export interface AutoBoardSignalItem {
  pairId: string;
  symbol: string;
  category: PairCategory;
  precision: number;
  direction: SignalDirection;
  confidence: number;
  entryPrice: number;
  closedCandleClose: number;
  closedCandleOpenTime: number;
  nextCandleOpenTime: number;
  nextCandleCloseTime: number;
  setupName: string;
  reasoning: string;
  rsi14: number;
  macdBias: 'BULLISH' | 'BEARISH' | 'NEUTRAL';
  emaAlignment: 'BULLISH' | 'BEARISH' | 'MIXED';
  bollingerPercentB: number;
  feedSource: string;
}

export interface AutoBoardResponse {
  market: MarketMode;
  timeframe: '1m';
  candleBucketOpenTime: number;
  nextCandleOpenTime: number;
  nextCandleCloseTime: number;
  generatedAt: number;
  signals: AutoBoardSignalItem[];
}

export interface LiveMonitorTick {
  pairId: string;
  symbol: string;
  market: MarketMode;
  timeframe: Timeframe;
  precision: number;
  price: number | null;
  currentCandle: Candle | null;
  currentCandleOpenTime: number;
  currentCandleCloseTime: number;
  nextCandleOpenTime: number;
  nextCandleCloseTime: number;
  msRemaining: number;
  elapsedPct: number;
  candleClosedConfirmed: boolean;
  liveUpProb: number;
  liveDownProb: number;
  suddenVolatility: boolean;
  volatilityNote: string;
  dataStatus: 'CONNECTED' | 'STALE' | 'DATA_DISCONNECTED';
  feedSource: string | null;
  errorReason: string | null;
  updatedAt: number;
}

export interface OwnerSettings {
  ownerLocked: boolean;
  lockClaimed: boolean;
  envLockActive: boolean;
  primaryMarket: MarketMode;
  primaryTimeframe: Timeframe;
  defaultPairId: string;
  confidenceThreshold: number;
  autoAgentEnabled: boolean;
  autoBoardEnabled: boolean;
  autoPairSwitch: boolean;
  autoTradingEnabled: boolean;
  birthdayTheme: boolean;
  voiceEnabled: boolean;
  assistantLanguage: AssistantLanguage;
  demoStakeAmount: number;
  defaultPayoutPct: number;
  emergencyStopped: boolean;
  updatedAt: number;
}

export interface ConditionLearningStat {
  key: string;
  label: string;
  settled: number;
  correct: number;
  falseCount: number;
  winRatePct: number;
  status: 'STRONG' | 'WEAK' | 'NEUTRAL';
}

export interface LearningProfile {
  totalSettled: number;
  totalCorrect: number;
  totalFalse: number;
  overallWinRatePct: number | null;
  byRegime: ConditionLearningStat[];
  byCombo: ConditionLearningStat[];
  byPair: ConditionLearningStat[];
  strengths: string[];
  weaknesses: string[];
  advisoryAdjustment: number; // -6 to +6 read-only advisory offset
  lastUpdatedAt: number;
}

export interface DemoAccountState {
  balance: number;
  initialBalance: number;
  currency: string;
  totalTrades: number;
  wins: number;
  losses: number;
  draws: number;
  netPnl: number;
  updatedAt: number;
}

export interface DemoTradeRecord {
  id: string;
  pairId: string;
  pairSymbol: string;
  market: MarketMode;
  timeframe: Timeframe;
  direction: 'UP' | 'DOWN';
  stake: number;
  payoutPct: number;
  entryPrice: number;
  precision: number;
  candleOpenTime: number;
  expiryTime: number;
  outcome: 'PENDING' | 'WIN' | 'LOSS' | 'DRAW';
  pnl: number;
  closePrice: number | null;
  createdAt: number;
  settledAt: number | null;
}

export interface LiveAccountStatus {
  connected: boolean;
  provider: string;
  statusLabel: string;
  verifiedBalance: number | null;
  note: string;
}

export interface QuotexReadinessProfile {
  fullName: string;
  gmailEmail: string;
  country: string;
  accountCurrency: string;
  idDocumentReady: boolean;
  addressProofReady: boolean;
  gmailVerified: boolean;
  updatedAt: number;
}

export interface GmailQuotexMessage {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
}

export interface GmailQuotexVerification {
  checkedAt: number;
  gmailAddress: string;
  messages: GmailQuotexMessage[];
  foundQuotexEmails: boolean;
}

export interface QuotexIntegrationInfo {
  status: 'OFFICIAL_API_ONLY_NOT_CONNECTED';
  apiConnected: boolean;
  platformUrl: string;
  autoClickBlocked: boolean;
  scrapingBlocked: boolean;
  credentialsStored: boolean;
  checklistNote: string;
}

export interface AccountsSnapshot {
  demo: DemoAccountState;
  demoTrades: DemoTradeRecord[];
  live: LiveAccountStatus;
  quotex: QuotexIntegrationInfo;
  quotexProfile: QuotexReadinessProfile;
}

export interface AssistantResponse {
  language: AssistantLanguage;
  question: string;
  answer: string;
  spokenText: string;
  generatedAt: number;
  groundedFactsUsed: string[];
}

export type QuotexAccountMode = 'DEMO' | 'LIVE' | 'UNKNOWN';

export type QuotexVisualDirection = 'UP' | 'DOWN' | 'NO_CLEAR_SIGNAL';

export type QuotexVisualRecommendation = 'TRADE' | 'AVOID_TRADE' | 'NO_CLEAR_SIGNAL';

export interface QuotexCandleAnalysis {
  lastCandleDirection: 'BULLISH' | 'BEARISH' | 'DOJI' | 'UNKNOWN';
  bodyStrength: string;
  wicksNote: string;
  momentum: string;
  supportResistance: string;
}

export interface QuotexVisionSignal {
  isQuotexChartReadable: boolean;
  detectedAccountMode: QuotexAccountMode;
  detectedPair: string;
  detectedTimeframe: string;
  candleAnalysis: QuotexCandleAnalysis;
  direction: QuotexVisualDirection;
  confidence: number; // 0 when NO_CLEAR_SIGNAL
  recommendation: QuotexVisualRecommendation;
  shortExplanation: string;
  spokenSummaryUrdu: string;
  spokenSummaryHindi: string;
  spokenSummaryEnglish: string;
  analyzedAt: number;
}

