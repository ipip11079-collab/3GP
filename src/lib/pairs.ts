import type { MarketMode, Timeframe, TradingPair } from '../types/trading.ts';

export const TIMEFRAMES: ReadonlyArray<{
  value: Timeframe;
  label: string;
  sublabel: string;
  seconds: number;
}> = [
  { value: '5s', label: '5s', sublabel: 'Seconds', seconds: 5 },
  { value: '10s', label: '10s', sublabel: 'Seconds', seconds: 10 },
  { value: '30s', label: '30s', sublabel: 'Seconds', seconds: 30 },
  { value: '1m', label: '1m', sublabel: 'Minute', seconds: 60 },
];

export const TRADING_PAIRS: TradingPair[] = [
  // Forex Majors
  { id: 'EUR-USD', symbol: 'EUR/USD', base: 'EUR', quote: 'USD', name: 'Euro / US Dollar', category: 'FX', precision: 5, krakenPair: 'EURUSD', yahooSymbol: 'EURUSD=X', markets: ['LIVE', 'OTC'] },
  { id: 'GBP-USD', symbol: 'GBP/USD', base: 'GBP', quote: 'USD', name: 'British Pound / US Dollar', category: 'FX', precision: 5, krakenPair: 'GBPUSD', yahooSymbol: 'GBPUSD=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-JPY', symbol: 'USD/JPY', base: 'USD', quote: 'JPY', name: 'US Dollar / Japanese Yen', category: 'FX', precision: 3, krakenPair: 'USDJPY', yahooSymbol: 'USDJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'AUD-USD', symbol: 'AUD/USD', base: 'AUD', quote: 'USD', name: 'Australian Dollar / US Dollar', category: 'FX', precision: 5, krakenPair: 'AUDUSD', yahooSymbol: 'AUDUSD=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-CAD', symbol: 'USD/CAD', base: 'USD', quote: 'CAD', name: 'US Dollar / Canadian Dollar', category: 'FX', precision: 5, krakenPair: 'USDCAD', yahooSymbol: 'USDCAD=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-CHF', symbol: 'USD/CHF', base: 'USD', quote: 'CHF', name: 'US Dollar / Swiss Franc', category: 'FX', precision: 5, krakenPair: 'USDCHF', yahooSymbol: 'USDCHF=X', markets: ['LIVE', 'OTC'] },
  { id: 'NZD-USD', symbol: 'NZD/USD', base: 'NZD', quote: 'USD', name: 'New Zealand Dollar / US Dollar', category: 'FX', precision: 5, yahooSymbol: 'NZDUSD=X', markets: ['LIVE', 'OTC'] },

  // Forex Minors & Crosses
  { id: 'EUR-GBP', symbol: 'EUR/GBP', base: 'EUR', quote: 'GBP', name: 'Euro / British Pound', category: 'FX', precision: 5, krakenPair: 'EURGBP', yahooSymbol: 'EURGBP=X', markets: ['LIVE', 'OTC'] },
  { id: 'EUR-JPY', symbol: 'EUR/JPY', base: 'EUR', quote: 'JPY', name: 'Euro / Japanese Yen', category: 'FX', precision: 3, krakenPair: 'EURJPY', yahooSymbol: 'EURJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'GBP-JPY', symbol: 'GBP/JPY', base: 'GBP', quote: 'JPY', name: 'British Pound / Japanese Yen', category: 'FX', precision: 3, yahooSymbol: 'GBPJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'AUD-JPY', symbol: 'AUD/JPY', base: 'AUD', quote: 'JPY', name: 'Australian Dollar / Japanese Yen', category: 'FX', precision: 3, yahooSymbol: 'AUDJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'CHF-JPY', symbol: 'CHF/JPY', base: 'CHF', quote: 'JPY', name: 'Swiss Franc / Japanese Yen', category: 'FX', precision: 3, yahooSymbol: 'CHFJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'CAD-JPY', symbol: 'CAD/JPY', base: 'CAD', quote: 'JPY', name: 'Canadian Dollar / Japanese Yen', category: 'FX', precision: 3, yahooSymbol: 'CADJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'NZD-JPY', symbol: 'NZD/JPY', base: 'NZD', quote: 'JPY', name: 'New Zealand Dollar / Japanese Yen', category: 'FX', precision: 3, yahooSymbol: 'NZDJPY=X', markets: ['LIVE', 'OTC'] },
  { id: 'EUR-AUD', symbol: 'EUR/AUD', base: 'EUR', quote: 'AUD', name: 'Euro / Australian Dollar', category: 'FX', precision: 5, yahooSymbol: 'EURAUD=X', markets: ['LIVE', 'OTC'] },
  { id: 'EUR-CAD', symbol: 'EUR/CAD', base: 'EUR', quote: 'CAD', name: 'Euro / Canadian Dollar', category: 'FX', precision: 5, yahooSymbol: 'EURCAD=X', markets: ['LIVE', 'OTC'] },
  { id: 'EUR-CHF', symbol: 'EUR/CHF', base: 'EUR', quote: 'CHF', name: 'Euro / Swiss Franc', category: 'FX', precision: 5, yahooSymbol: 'EURCHF=X', markets: ['LIVE', 'OTC'] },
  { id: 'GBP-AUD', symbol: 'GBP/AUD', base: 'GBP', quote: 'AUD', name: 'British Pound / Australian Dollar', category: 'FX', precision: 5, yahooSymbol: 'GBPAUD=X', markets: ['LIVE', 'OTC'] },
  { id: 'GBP-CAD', symbol: 'GBP/CAD', base: 'GBP', quote: 'CAD', name: 'British Pound / Canadian Dollar', category: 'FX', precision: 5, yahooSymbol: 'GBPCAD=X', markets: ['LIVE', 'OTC'] },
  { id: 'AUD-CAD', symbol: 'AUD/CAD', base: 'AUD', quote: 'CAD', name: 'Australian Dollar / Canadian Dollar', category: 'FX', precision: 5, yahooSymbol: 'AUDCAD=X', markets: ['LIVE', 'OTC'] },
  { id: 'AUD-NZD', symbol: 'AUD/NZD', base: 'AUD', quote: 'NZD', name: 'Australian Dollar / New Zealand Dollar', category: 'FX', precision: 5, yahooSymbol: 'AUDNZD=X', markets: ['LIVE', 'OTC'] },

  // Global Emerging & 24/7 FX Reference
  { id: 'EUR-USDT', symbol: 'EUR/USDT', base: 'EUR', quote: 'USDT', name: 'Euro / Tether 24/7 Spot', category: 'FX', precision: 4, binanceSymbol: 'EURUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'USD-INR', symbol: 'USD/INR', base: 'USD', quote: 'INR', name: 'US Dollar / Indian Rupee', category: 'FX', precision: 4, yahooSymbol: 'USDINR=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-SGD', symbol: 'USD/SGD', base: 'USD', quote: 'SGD', name: 'US Dollar / Singapore Dollar', category: 'FX', precision: 5, yahooSymbol: 'USDSGD=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-MXN', symbol: 'USD/MXN', base: 'USD', quote: 'MXN', name: 'US Dollar / Mexican Peso', category: 'FX', precision: 4, yahooSymbol: 'USDMXN=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-ZAR', symbol: 'USD/ZAR', base: 'USD', quote: 'ZAR', name: 'US Dollar / South African Rand', category: 'FX', precision: 4, yahooSymbol: 'USDZAR=X', markets: ['LIVE', 'OTC'] },
  { id: 'USD-TRY', symbol: 'USD/TRY', base: 'USD', quote: 'TRY', name: 'US Dollar / Turkish Lira', category: 'FX', precision: 4, yahooSymbol: 'USDTRY=X', markets: ['LIVE', 'OTC'] },

  // Precious Metals / Commodities
  { id: 'XAU-USD', symbol: 'XAU/USD', base: 'XAU', quote: 'USD', name: 'Gold Spot / US Dollar (24/7)', category: 'COMMODITY', precision: 2, binanceSymbol: 'PAXGUSDT', yahooSymbol: 'GC=F', markets: ['OTC', 'LIVE'] },
  { id: 'XAG-USD', symbol: 'XAG/USD', base: 'XAG', quote: 'USD', name: 'Silver Spot / US Dollar', category: 'COMMODITY', precision: 3, yahooSymbol: 'SI=F', markets: ['LIVE', 'OTC'] },

  // 24/7 Crypto Spot Pairs
  { id: 'BTC-USD', symbol: 'BTC/USD', base: 'BTC', quote: 'USD', name: 'Bitcoin / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'BTCUSDT', krakenPair: 'XBTUSD', yahooSymbol: 'BTC-USD', markets: ['OTC', 'LIVE'] },
  { id: 'ETH-USD', symbol: 'ETH/USD', base: 'ETH', quote: 'USD', name: 'Ethereum / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'ETHUSDT', krakenPair: 'ETHUSD', yahooSymbol: 'ETH-USD', markets: ['OTC', 'LIVE'] },
  { id: 'SOL-USD', symbol: 'SOL/USD', base: 'SOL', quote: 'USD', name: 'Solana / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'SOLUSDT', krakenPair: 'SOLUSD', yahooSymbol: 'SOL-USD', markets: ['OTC', 'LIVE'] },
  { id: 'XRP-USD', symbol: 'XRP/USD', base: 'XRP', quote: 'USD', name: 'Ripple / US Dollar (24/7)', category: 'CRYPTO', precision: 4, binanceSymbol: 'XRPUSDT', krakenPair: 'XRPUSD', yahooSymbol: 'XRP-USD', markets: ['OTC', 'LIVE'] },
  { id: 'BNB-USD', symbol: 'BNB/USD', base: 'BNB', quote: 'USD', name: 'BNB / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'BNBUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'DOGE-USD', symbol: 'DOGE/USD', base: 'DOGE', quote: 'USD', name: 'Dogecoin / US Dollar (24/7)', category: 'CRYPTO', precision: 5, binanceSymbol: 'DOGEUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'ADA-USD', symbol: 'ADA/USD', base: 'ADA', quote: 'USD', name: 'Cardano / US Dollar (24/7)', category: 'CRYPTO', precision: 4, binanceSymbol: 'ADAUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'AVAX-USD', symbol: 'AVAX/USD', base: 'AVAX', quote: 'USD', name: 'Avalanche / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'AVAXUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'LINK-USD', symbol: 'LINK/USD', base: 'LINK', quote: 'USD', name: 'Chainlink / US Dollar (24/7)', category: 'CRYPTO', precision: 3, binanceSymbol: 'LINKUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'DOT-USD', symbol: 'DOT/USD', base: 'DOT', quote: 'USD', name: 'Polkadot / US Dollar (24/7)', category: 'CRYPTO', precision: 3, binanceSymbol: 'DOTUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'LTC-USD', symbol: 'LTC/USD', base: 'LTC', quote: 'USD', name: 'Litecoin / US Dollar (24/7)', category: 'CRYPTO', precision: 2, binanceSymbol: 'LTCUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'TRX-USD', symbol: 'TRX/USD', base: 'TRX', quote: 'USD', name: 'TRON / US Dollar (24/7)', category: 'CRYPTO', precision: 5, binanceSymbol: 'TRXUSDT', markets: ['OTC', 'LIVE'] },
  { id: 'TON-USD', symbol: 'TON/USD', base: 'TON', quote: 'USD', name: 'Toncoin / US Dollar (24/7)', category: 'CRYPTO', precision: 3, binanceSymbol: 'TONUSDT', markets: ['OTC', 'LIVE'] },
];

export function getPairById(pairId: string): TradingPair | undefined {
  return TRADING_PAIRS.find((p) => p.id === pairId);
}

export function getPairsForMarket(market: MarketMode): TradingPair[] {
  return TRADING_PAIRS.filter((p) => p.markets.includes(market));
}

export function supportsSubMinute(pair: TradingPair): boolean {
  return Boolean(pair.binanceSymbol || pair.krakenPair);
}

export function getTimeframeSeconds(timeframe: Timeframe): number {
  const found = TIMEFRAMES.find((t) => t.value === timeframe);
  return found ? found.seconds : 60;
}
