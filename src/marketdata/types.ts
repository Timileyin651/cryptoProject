/**
 * Exchange-independent, normalised market-data types.
 *
 * Every WS stream translates its native payload into these shapes
 * before publishing to the MarketDataStore. Downstream consumers
 * (arbitrage scanner, alerts, UI) never see exchange-specific JSON.
 */

/** Canonical symbol — always "BASE/QUOTE", e.g. "BTC/USDT". */
export type NormalizedSymbol = string;

/** Unique key: `${exchangeSlug}:${normalizedSymbol}`, e.g. "binance:BTC/USDT". */
export type MarketDataKey = string;

// ──────────────────────────── Ticker ─────────────────────────────────────

export interface NormalizedTicker {
  exchange: string; // slug, e.g. "binance"
  symbol: NormalizedSymbol; // "BTC/USDT"
  bid: string; // best bid price (string for precision)
  ask: string; // best ask price
  last: string; // last traded price
  volume24h: string; // 24h volume in base currency
  high24h: string;
  low24h: string;
  timestamp: number; // epoch ms when data was received
  receivedAt: number; // epoch ms when we received it
}

// ──────────────────────────── Order book ─────────────────────────────────

export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface NormalizedOrderBook {
  exchange: string;
  symbol: NormalizedSymbol;
  bids: OrderBookLevel[]; // sorted best-first (descending price)
  asks: OrderBookLevel[]; // sorted best-first (ascending price)
  timestamp: number;
  receivedAt: number;
}

// ──────────────────────────── Trade ──────────────────────────────────────

export interface NormalizedTrade {
  exchange: string;
  symbol: NormalizedSymbol;
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
  timestamp: number;
  receivedAt: number;
  tradeId?: string;
}

// ──────────────────────────── Stream health ──────────────────────────────

export type StreamStatus = 'connected' | 'reconnecting' | 'disconnected' | 'error';

export interface StreamHealth {
  exchange: string;
  status: StreamStatus;
  uptimeMs: number; // time in connected state since last connect
  reconnectAttempts: number;
  lastMessageAt: number | null;
  lastError: string | null;
  subscribedSymbols: number;
  messagesReceived: number;
  messagesPerSecond: number; // rolling average
}

// ──────────────────────────── Redis hash shape ───────────────────────────

/**
 * The fields stored in a Redis hash at key `md:{exchange}:{symbol}`.
 * All values are strings (Redis hashes store strings).
 */
export interface MarketDataHashFields {
  exchange: string;
  symbol: string;
  bid: string;
  ask: string;
  last: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  timestamp: string; // epoch ms
  receivedAt: string; // epoch ms
  spread: string; // ask - bid, pre-computed
  midPrice: string; // (bid + ask) / 2, pre-computed
}

// ──────────────────────────── Helpers ────────────────────────────────────

/**
 * Build the Redis hash key for a market data entry.
 */
export function marketDataKey(exchange: string, symbol: NormalizedSymbol): string {
  // Normalize separators: BTC/USDT → BTC_USDT for Redis key readability
  const safeSymbol = symbol.replace('/', '_');
  return `md:${exchange}:${safeSymbol}`;
}

/**
 * Build the Redis set key that tracks all active market data keys
 * for a given exchange.
 */
export function exchangeKeySet(exchange: string): string {
  return `md:${exchange}:keys`;
}

/**
 * Convert a NormalizedTicker into a flat hash suitable for HSET.
 */
export function tickerToHashFields(ticker: NormalizedTicker): MarketDataHashFields {
  const bid = parseFloat(ticker.bid) || 0;
  const ask = parseFloat(ticker.ask) || 0;
  return {
    exchange: ticker.exchange,
    symbol: ticker.symbol,
    bid: ticker.bid,
    ask: ticker.ask,
    last: ticker.last,
    volume24h: ticker.volume24h,
    high24h: ticker.high24h,
    low24h: ticker.low24h,
    timestamp: String(ticker.timestamp),
    receivedAt: String(ticker.receivedAt),
    spread: String(ask - bid),
    midPrice: String((bid + ask) / 2),
  };
}
