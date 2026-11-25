import {
  aggregateCandlesFrom1s,
  aggregateCandlesFromTicks,
  analyzeMarketStructure,
  computeBroaderMultiTimeframeSentiment,
  summarizeOrderbook,
  type RawTick,
} from '../src/lib/indicators.ts';
import { getPairsForMarket } from '../src/lib/pairs.ts';
import { evaluate1mCloseStrategy, type Strategy1mEvaluation } from '../src/lib/strategy1m.ts';
import type {
  Candle,
  MarketMode,
  MultiTimeframeContext,
  OrderbookSnapshot,
  ScreenerRow,
  Timeframe,
  TradingPair,
} from '../src/types/trading.ts';

export interface LiveFeedBundle {
  candles: Candle[];
  orderbook: OrderbookSnapshot | null;
  feedSource: string;
  quotexConnected: boolean;
  fetchedAt: number;
}

const FETCH_TIMEOUT_MS = 7500;

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    headers: {
      Accept: 'application/json',
      'User-Agent': '3GP-Trading-Bot/1.0',
    },
  });
  if (!res.ok) {
    throw new Error(`Upstream HTTP ${res.status} from ${new URL(url).hostname}`);
  }
  return (await res.json()) as T;
}

type BinanceKlineRow = [
  number,
  string,
  string,
  string,
  string,
  string,
  number,
  string,
  number,
  string,
  string,
  string,
];

interface BinanceDepthResponse {
  bids?: [string, string][];
  asks?: [string, string][];
}

async function fetchBinanceFeed(
  symbol: string,
  timeframe: Timeframe,
  market: MarketMode,
  includeDepth: boolean = true,
): Promise<LiveFeedBundle> {
  const interval = timeframe === '1m' ? '1m' : '1s';
  const limit = timeframe === '1m' ? 80 : 600;
  const klinesUrl = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(symbol)}&interval=${interval}&limit=${limit}`;
  const depthUrl = `https://api.binance.com/api/v3/depth?symbol=${encodeURIComponent(symbol)}&limit=20`;

  const [rawKlines, rawDepth] = await Promise.all([
    fetchJson<BinanceKlineRow[]>(klinesUrl),
    includeDepth ? fetchJson<BinanceDepthResponse>(depthUrl).catch(() => null) : Promise.resolve(null),
  ]);

  if (!Array.isArray(rawKlines) || rawKlines.length === 0) {
    throw new Error(`No Binance kline bars returned for ${symbol}`);
  }

  const parsed: Candle[] = rawKlines.map((row) => {
    const vol = Number(row[5]);
    const buyVol = Number(row[9]);
    return {
      openTime: Number(row[0]),
      closeTime: Number(row[6]),
      open: Number(row[1]),
      high: Number(row[2]),
      low: Number(row[3]),
      close: Number(row[4]),
      volume: vol,
      buyVolume: buyVol,
      sellVolume: Math.max(0, vol - buyVol),
      tradeCount: Number(row[8]),
    };
  });

  const now = Date.now();
  const candles =
    timeframe === '1m' ? parsed : aggregateCandlesFrom1s(parsed, timeframe, now);

  const orderbook = rawDepth?.bids && rawDepth?.asks
    ? summarizeOrderbook(
        rawDepth.bids.map(([p, q]) => [Number(p), Number(q)]),
        rawDepth.asks.map(([p, q]) => [Number(p), Number(q)]),
      )
    : null;

  const marketLabel =
    market === 'OTC'
      ? 'Binance 24/7 Spot Reference (Quotex OTC not connected)'
      : 'Binance Live Spot Feed';

  return {
    candles,
    orderbook,
    feedSource: marketLabel,
    quotexConnected: false,
    fetchedAt: now,
  };
}

interface KrakenOhlcResponse {
  error: string[];
  result?: Record<string, Array<[number, string, string, string, string, string, string, number]> | number>;
}

interface KrakenTradesResponse {
  error: string[];
  result?: Record<string, Array<[string, string, number, string, string, string, number]> | string>;
}

interface KrakenDepthResponse {
  error: string[];
  result?: Record<
    string,
    {
      asks: Array<[string, string, number]>;
      bids: Array<[string, string, number]>;
    }
  >;
}

function extractKrakenResult<T>(obj: Record<string, T> | undefined): T | null {
  if (!obj) return null;
  for (const [k, v] of Object.entries(obj)) {
    if (k !== 'last') return v;
  }
  return null;
}

async function fetchKrakenFeed(
  krakenPair: string,
  timeframe: Timeframe,
  market: MarketMode,
  includeDepth: boolean = true,
): Promise<LiveFeedBundle> {
  const depthUrl = `https://api.kraken.com/0/public/Depth?pair=${encodeURIComponent(krakenPair)}&count=20`;

  if (timeframe === '1m') {
    const ohlcUrl = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(krakenPair)}&interval=1`;
    const [ohlcRes, depthRes] = await Promise.all([
      fetchJson<KrakenOhlcResponse>(ohlcUrl),
      includeDepth ? fetchJson<KrakenDepthResponse>(depthUrl).catch(() => null) : Promise.resolve(null),
    ]);
    if (ohlcRes.error?.length) {
      throw new Error(`Kraken OHLC error: ${ohlcRes.error.join(', ')}`);
    }
    const rows = extractKrakenResult(
      ohlcRes.result as Record<
        string,
        Array<[number, string, string, string, string, string, string, number]>
      >,
    );
    if (!Array.isArray(rows) || rows.length === 0) {
      throw new Error(`No Kraken 1m bars returned for ${krakenPair}`);
    }

    const candles: Candle[] = rows.slice(-80).map((r) => ({
      openTime: Number(r[0]) * 1000,
      closeTime: Number(r[0]) * 1000 + 59_999,
      open: Number(r[1]),
      high: Number(r[2]),
      low: Number(r[3]),
      close: Number(r[4]),
      volume: Number(r[6]),
      tradeCount: Number(r[7]),
    }));

    const depthEntry = extractKrakenResult(depthRes?.result);
    const orderbook =
      depthEntry?.bids && depthEntry?.asks
        ? summarizeOrderbook(
            depthEntry.bids.map(([p, q]) => [Number(p), Number(q)]),
            depthEntry.asks.map(([p, q]) => [Number(p), Number(q)]),
          )
        : null;

    return {
      candles,
      orderbook,
      feedSource:
        market === 'OTC'
          ? 'Kraken 24/7 Spot Reference (Quotex OTC not connected)'
          : 'Kraken Live Spot & Orderbook Feed',
      quotexConnected: false,
      fetchedAt: Date.now(),
    };
  }

  // Sub-minute (5s, 10s, 30s) via genuine tick-by-tick Trades endpoint
  const tradesUrl = `https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(krakenPair)}`;
  const [tradesRes, depthRes] = await Promise.all([
    fetchJson<KrakenTradesResponse>(tradesUrl),
    includeDepth ? fetchJson<KrakenDepthResponse>(depthUrl).catch(() => null) : Promise.resolve(null),
  ]);
  if (tradesRes.error?.length) {
    throw new Error(`Kraken Trades error: ${tradesRes.error.join(', ')}`);
  }

  const rawTrades = extractKrakenResult(
    tradesRes.result as Record<
      string,
      Array<[string, string, number, string, string, string, number]>
    >,
  );
  if (!Array.isArray(rawTrades) || rawTrades.length === 0) {
    throw new Error(`No Kraken live trades returned for ${krakenPair}`);
  }

  const ticks: RawTick[] = rawTrades.map((t) => ({
    price: Number(t[0]),
    volume: Number(t[1]),
    timestampMs: Math.round(Number(t[2]) * 1000),
    side: t[3] === 'b' ? 'b' : t[3] === 's' ? 's' : 'u',
  }));

  const now = Date.now();
  const candles = aggregateCandlesFromTicks(ticks, timeframe, now);
  const depthEntry = extractKrakenResult(depthRes?.result);
  const orderbook =
    depthEntry?.bids && depthEntry?.asks
      ? summarizeOrderbook(
          depthEntry.bids.map(([p, q]) => [Number(p), Number(q)]),
          depthEntry.asks.map(([p, q]) => [Number(p), Number(q)]),
        )
      : null;

  return {
    candles,
    orderbook,
    feedSource:
      market === 'OTC'
        ? 'Kraken 24/7 Tick & Orderbook Reference (Quotex OTC not connected)'
        : 'Kraken Live Tick & Orderbook Feed',
    quotexConnected: false,
    fetchedAt: now,
  };
}

interface YahooChartResponse {
  chart?: {
    result?: Array<{
      meta?: { regularMarketPrice?: number };
      timestamp?: number[];
      indicators?: {
        quote?: Array<{
          open?: Array<number | null>;
          high?: Array<number | null>;
          low?: Array<number | null>;
          close?: Array<number | null>;
          volume?: Array<number | null>;
        }>;
      };
    }>;
    error?: { description?: string } | null;
  };
}

async function fetchYahoo1mFeed(
  yahooSymbol: string,
  market: MarketMode,
): Promise<LiveFeedBundle> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(yahooSymbol)}?interval=1m&range=1d`;
  const data = await fetchJson<YahooChartResponse>(url);
  const result = data.chart?.result?.[0];
  const timestamps = result?.timestamp ?? [];
  const quote = result?.indicators?.quote?.[0];
  if (!result || timestamps.length === 0 || !quote) {
    throw new Error(`No Yahoo Finance 1m data for ${yahooSymbol}`);
  }

  const candles: Candle[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const o = quote.open?.[i];
    const h = quote.high?.[i];
    const l = quote.low?.[i];
    const c = quote.close?.[i];
    const v = quote.volume?.[i] ?? 0;
    if (
      typeof o === 'number' &&
      typeof h === 'number' &&
      typeof l === 'number' &&
      typeof c === 'number'
    ) {
      const openTime = timestamps[i] * 1000;
      candles.push({
        openTime,
        closeTime: openTime + 59_999,
        open: o,
        high: h,
        low: l,
        close: c,
        volume: typeof v === 'number' ? v : 0,
      });
    }
  }

  return {
    candles: candles.slice(-80),
    orderbook: null,
    feedSource:
      market === 'OTC'
        ? 'Yahoo Finance 1m FX Reference (Quotex OTC not connected)'
        : 'Yahoo Finance Live 1m FX Feed',
    quotexConnected: false,
    fetchedAt: Date.now(),
  };
}

export async function fetchLiveMarketBundle(
  pair: TradingPair,
  timeframe: Timeframe,
  market: MarketMode,
  includeDepth: boolean = true,
): Promise<LiveFeedBundle> {
  const errors: string[] = [];

  if (pair.binanceSymbol) {
    try {
      return await fetchBinanceFeed(pair.binanceSymbol, timeframe, market, includeDepth);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (pair.krakenPair) {
    try {
      return await fetchKrakenFeed(pair.krakenPair, timeframe, market, includeDepth);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  }

  if (pair.yahooSymbol && timeframe === '1m') {
    try {
      return await fetchYahoo1mFeed(pair.yahooSymbol, market);
    } catch (err) {
      errors.push(err instanceof Error ? err.message : String(err));
    }
  } else if (pair.yahooSymbol && timeframe !== '1m' && !pair.binanceSymbol && !pair.krakenPair) {
    throw new Error(
      `Live ${timeframe} sub-minute ticks are unavailable for ${pair.symbol} (Yahoo Finance supplies 1m bars only). Switch timeframe to 1m or select a 24/7 tick pair.`,
    );
  }

  throw new Error(
    `Unable to retrieve live ${timeframe} market data for ${pair.symbol}: ${errors.join(' | ') || 'No supported feed available for this timeframe.'}`,
  );
}

/**
 * Fetches the actual market close price at or immediately after expiryTime to settle a recorded prediction.
 */
export async function fetchActualCloseForExpiry(
  pair: TradingPair,
  timeframe: Timeframe,
  candleOpenTime: number,
  expiryTime: number,
): Promise<number | null> {
  // 1. Binance exact historical kline lookup
  if (pair.binanceSymbol) {
    try {
      const interval = timeframe === '1m' ? '1m' : '1s';
      const startTime = candleOpenTime;
      const endTime = expiryTime + 5000;
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair.binanceSymbol)}&interval=${interval}&startTime=${startTime}&endTime=${endTime}&limit=120`;
      const rows = await fetchJson<BinanceKlineRow[]>(url);
      if (Array.isArray(rows) && rows.length > 0) {
        const upToExpiry = rows.filter((r) => Number(r[0]) <= expiryTime);
        const target = upToExpiry[upToExpiry.length - 1] ?? rows[rows.length - 1];
        const close = Number(target[4]);
        if (Number.isFinite(close) && close > 0) return close;
      }
    } catch {
      // fall through to Kraken/Yahoo
    }
  }

  // 2. Kraken Trades / OHLC lookup
  if (pair.krakenPair) {
    try {
      if (timeframe === '1m') {
        const sinceSec = Math.floor((candleOpenTime - 60_000) / 1000);
        const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair.krakenPair)}&interval=1&since=${sinceSec}`;
        const res = await fetchJson<KrakenOhlcResponse>(url);
        const rows = extractKrakenResult(
          res.result as Record<
            string,
            Array<[number, string, string, string, string, string, string, number]>
          >,
        );
        if (Array.isArray(rows) && rows.length > 0) {
          const matching = rows.find((r) => Number(r[0]) * 1000 === candleOpenTime);
          const upToExpiry = rows.filter((r) => Number(r[0]) * 1000 <= expiryTime);
          const chosen = matching ?? upToExpiry[upToExpiry.length - 1] ?? rows[rows.length - 1];
          const close = Number(chosen[4]);
          if (Number.isFinite(close) && close > 0) return close;
        }
      } else {
        const sinceNs = Math.max(0, (candleOpenTime - 120_000) * 1_000_000);
        const url = `https://api.kraken.com/0/public/Trades?pair=${encodeURIComponent(pair.krakenPair)}&since=${sinceNs}`;
        const res = await fetchJson<KrakenTradesResponse>(url);
        const rawTrades = extractKrakenResult(
          res.result as Record<
            string,
            Array<[string, string, number, string, string, string, number]>
          >,
        );
        if (Array.isArray(rawTrades) && rawTrades.length > 0) {
          const upToExpiry = rawTrades.filter(
            (t) => Math.round(Number(t[2]) * 1000) <= expiryTime,
          );
          const chosen = upToExpiry[upToExpiry.length - 1] ?? rawTrades[0];
          const price = Number(chosen[0]);
          if (Number.isFinite(price) && price > 0) return price;
        }
      }
    } catch {
      // fall through
    }
  }

  // 3. Yahoo Finance 1m fallback
  if (pair.yahooSymbol) {
    try {
      const feed = await fetchYahoo1mFeed(pair.yahooSymbol, 'LIVE');
      const upToExpiry = feed.candles.filter((c) => c.openTime <= expiryTime);
      const chosen = upToExpiry[upToExpiry.length - 1] ?? feed.candles[feed.candles.length - 1];
      if (chosen && Number.isFinite(chosen.close)) return chosen.close;
    } catch {
      return null;
    }
  }

  return null;
}

const screenerCache = new Map<string, { expiresAt: number; rows: ScreenerRow[] }>();

async function fetchHigherTimeframeCandles(
  pair: TradingPair,
  interval: '5m' | '15m',
): Promise<Candle[]> {
  if (pair.binanceSymbol) {
    try {
      const url = `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(pair.binanceSymbol)}&interval=${interval}&limit=60`;
      const rows = await fetchJson<BinanceKlineRow[]>(url);
      if (Array.isArray(rows) && rows.length > 0) {
        return rows.map((r) => ({
          openTime: Number(r[0]),
          closeTime: Number(r[6]),
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[5]),
        }));
      }
    } catch {
      // fall through
    }
  }

  if (pair.krakenPair) {
    try {
      const kInterval = interval === '5m' ? 5 : 15;
      const url = `https://api.kraken.com/0/public/OHLC?pair=${encodeURIComponent(pair.krakenPair)}&interval=${kInterval}`;
      const res = await fetchJson<KrakenOhlcResponse>(url);
      const rows = extractKrakenResult(
        res.result as Record<
          string,
          Array<[number, string, string, string, string, string, string, number]>
        >,
      );
      if (Array.isArray(rows) && rows.length > 0) {
        const durMs = kInterval * 60_000 - 1;
        return rows.slice(-60).map((r) => ({
          openTime: Number(r[0]) * 1000,
          closeTime: Number(r[0]) * 1000 + durMs,
          open: Number(r[1]),
          high: Number(r[2]),
          low: Number(r[3]),
          close: Number(r[4]),
          volume: Number(r[6]),
        }));
      }
    } catch {
      // fall through
    }
  }

  if (pair.yahooSymbol) {
    try {
      const range = interval === '5m' ? '1d' : '5d';
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(pair.yahooSymbol)}?interval=${interval}&range=${range}`;
      const data = await fetchJson<YahooChartResponse>(url);
      const res0 = data.chart?.result?.[0];
      const ts = res0?.timestamp ?? [];
      const q = res0?.indicators?.quote?.[0];
      if (res0 && q && ts.length > 0) {
        const durMs = (interval === '5m' ? 5 : 15) * 60_000 - 1;
        const out: Candle[] = [];
        for (let i = 0; i < ts.length; i++) {
          const o = q.open?.[i];
          const h = q.high?.[i];
          const l = q.low?.[i];
          const c = q.close?.[i];
          if (typeof o === 'number' && typeof h === 'number' && typeof l === 'number' && typeof c === 'number') {
            out.push({
              openTime: ts[i] * 1000,
              closeTime: ts[i] * 1000 + durMs,
              open: o,
              high: h,
              low: l,
              close: c,
              volume: typeof q.volume?.[i] === 'number' ? q.volume[i]! : 0,
            });
          }
        }
        return out.slice(-60);
      }
    } catch {
      // ignore
    }
  }

  return [];
}

export async function fetchMultiTimeframeContext(
  pair: TradingPair,
  market: MarketMode,
  existing1mCandles?: Candle[],
): Promise<MultiTimeframeContext | null> {
  try {
    const [candles1m, candles5m, candles15m] = await Promise.all([
      existing1mCandles && existing1mCandles.length >= 15
        ? Promise.resolve(existing1mCandles)
        : fetchLiveMarketBundle(pair, '1m', market, false)
            .then((b) => b.candles)
            .catch(() => [] as Candle[]),
      fetchHigherTimeframeCandles(pair, '5m'),
      fetchHigherTimeframeCandles(pair, '15m'),
    ]);

    return computeBroaderMultiTimeframeSentiment({
      candles1m,
      candles5m,
      candles15m,
    });
  } catch {
    return null;
  }
}

export async function fetchMarketScreener(
  market: MarketMode,
  timeframe: Timeframe,
): Promise<ScreenerRow[]> {
  const cacheKey = `${market}:${timeframe}`;
  const cached = screenerCache.get(cacheKey);
  if (cached && Date.now() < cached.expiresAt) {
    return cached.rows;
  }

  const priorityIds = new Set([
    'BTC-USD',
    'ETH-USD',
    'SOL-USD',
    'XRP-USD',
    'BNB-USD',
    'XAU-USD',
    'EUR-USD',
    'GBP-USD',
    'USD-JPY',
    'EUR-USDT',
  ]);
  const allForMarket = getPairsForMarket(market);
  const pairs = allForMarket.filter((p) => priorityIds.has(p.id)).slice(0, 10);
  const now = Date.now();

  const settled = await Promise.allSettled(
    pairs.map(async (pair): Promise<ScreenerRow> => {
      const bundle = await fetchLiveMarketBundle(pair, timeframe, market, false);
      const analysis = analyzeMarketStructure(
        bundle.candles,
        timeframe,
        bundle.orderbook,
        now,
      );
      const firstCandle = bundle.candles[Math.max(0, bundle.candles.length - 12)];
      const changePct =
        firstCandle && firstCandle.open > 0
          ? Number((((analysis.latestPrice - firstCandle.open) / firstCandle.open) * 100).toFixed(3))
          : 0;

      let bias: 'BULLISH' | 'BEARISH' | 'NEUTRAL' = 'NEUTRAL';
      if (analysis.dataSufficient) {
        if (analysis.bullishProbability >= 55) bias = 'BULLISH';
        else if (analysis.bearishProbability >= 55) bias = 'BEARISH';
      }

      return {
        pairId: pair.id,
        symbol: pair.symbol,
        category: pair.category,
        precision: pair.precision,
        price: Number(analysis.latestPrice.toFixed(pair.precision)),
        changePct,
        bias,
        strength: Math.round(analysis.quantitativeConfidence),
        rsi14: analysis.rsi14,
        dataSufficient: analysis.dataSufficient,
        feedSource: bundle.feedSource,
      };
    }),
  );

  const rows: ScreenerRow[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled') {
      rows.push(res.value);
    }
  }

  rows.sort((a, b) => Number(b.dataSufficient) - Number(a.dataSufficient) || b.strength - a.strength);
  screenerCache.set(cacheKey, { expiresAt: Date.now() + 2500, rows });
  return rows;
}

export interface AutoBoard1mCandidate {
  pair: TradingPair;
  feedSource: string;
  evaluation: Strategy1mEvaluation;
}

export async function fetchAutoBoard1mCandidates(
  market: MarketMode,
): Promise<AutoBoard1mCandidate[]> {
  const priorityIds = new Set([
    'BTC-USD',
    'ETH-USD',
    'SOL-USD',
    'XRP-USD',
    'BNB-USD',
    'ADA-USD',
    'AVAX-USD',
    'XAU-USD',
    'EUR-USD',
    'GBP-USD',
    'EUR-USDT',
  ]);
  const allForMarket = getPairsForMarket(market);
  const pairs = allForMarket.filter((p) => priorityIds.has(p.id)).slice(0, 10);
  const now = Date.now();

  const settled = await Promise.allSettled(
    pairs.map(async (pair): Promise<AutoBoard1mCandidate> => {
      const bundle = await fetchLiveMarketBundle(pair, '1m', market, false);
      const evaluation = evaluate1mCloseStrategy(bundle.candles, bundle.orderbook, now);
      return {
        pair,
        feedSource: bundle.feedSource,
        evaluation,
      };
    }),
  );

  const candidates: AutoBoard1mCandidate[] = [];
  for (const res of settled) {
    if (res.status === 'fulfilled' && res.value.evaluation.analysis.dataSufficient) {
      candidates.push(res.value);
    }
  }

  candidates.sort((a, b) => {
    const aActive = a.evaluation.direction !== 'NO_TRADE' ? 1 : 0;
    const bActive = b.evaluation.direction !== 'NO_TRADE' ? 1 : 0;
    return bActive - aActive || b.evaluation.confidence - a.evaluation.confidence;
  });

  return candidates.slice(0, 8);
}

