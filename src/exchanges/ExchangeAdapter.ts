/**
 * Normalised data types returned by every ExchangeAdapter.
 * These are plain objects — adapters translate their native API shapes
 * into these types before returning.
 */

/** A single funding rate snapshot for a perpetual swap. */
export interface FundingRateSnapshot {
  /** Normalized symbol, e.g. "BTC/USDT:USDT". */
  symbol: string;
  /** The funding rate as a fraction (e.g. 0.0001 = 0.01%). */
  fundingRate: number;
  /** Timestamp of the funding rate. */
  timestamp: Date;
  /** When this snapshot was fetched. */
  fetchedAt: Date;
  /** The next funding time, if known. */
  nextFundingTime?: Date;
  /** Estimated funding rate interval in ms (e.g. 8 hours). */
  fundingIntervalMs?: number;
}

/** A single ticker / price quote. */
export interface TickerSnapshot {
  symbol: string; // exchange-specific symbol, e.g. "BTCUSDT"
  bid: string;
  ask: string;
  last: string;
  volume24h: string;
  high24h: string;
  low24h: string;
  timestamp: Date;
}

/** One side of an order book. */
export interface OrderBookLevel {
  price: string;
  quantity: string;
}

export interface OrderBookSnapshot {
  symbol: string;
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp: Date;
}

/** A single executed trade. */
export interface TradeSnapshot {
  symbol: string;
  side: 'buy' | 'sell';
  price: string;
  quantity: string;
  timestamp: Date;
  tradeId?: string;
}

/** Market metadata the adapter can supply. */
export interface MarketInfo {
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  takerFee: string;
  makerFee: string;
  minOrderSize: string | null;
  maxOrderSize: string | null;
  minPriceTick: string | null;
  status: 'active' | 'inactive' | 'halted';
}

/** Withdrawal or deposit status for a coin on a network. */
export interface CoinNetworkStatus {
  coin: string;
  network: string | null;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  withdrawalFee: string;
  minWithdrawal: string | null;
  maxWithdrawal: string | null;
  confirmationBlocks: number | null;
}

/** Adapter capability flags. */
export interface AdapterCapabilities {
  supportsSpot: boolean;
  supportsFutures: boolean;
  supportsMargin: boolean;
  supportsWebSocket: boolean;
  supportsOrderBook: boolean;
  supportsTicker: boolean;
  supportsTrades: boolean;
}

/**
 * Every exchange integration must implement this interface.
 *
 * Adapters are stateless — the ExchangeService manages DB persistence.
 * Adapters only translate third-party API responses into the normalised
 * types above.
 */
export interface ExchangeAdapter {
  /** Unique slug that matches the `exchanges.slug` column. */
  readonly slug: string;

  /** Human-readable name for logs. */
  readonly name: string;

  /** Static capability descriptor. */
  readonly capabilities: AdapterCapabilities;

  /** Base URL for REST requests. */
  readonly baseUrl: string;

  // ── Lifecycle ────────────────────────────────────────────────────────

  /** One-time initialisation (validate config, warm caches, etc.). */
  initialize(): Promise<void>;

  /** Graceful shutdown (close connections, clear timers). */
  shutdown(): Promise<void>;

  // ── Market data ──────────────────────────────────────────────────────

  /** Fetch available markets from the exchange. */
  fetchMarkets(): Promise<MarketInfo[]>;

  /** Fetch a single ticker. */
  fetchTicker(symbol: string): Promise<TickerSnapshot>;

  /** Fetch a snapshot of the order book. */
  fetchOrderBook(symbol: string, depth?: number): Promise<OrderBookSnapshot>;

  /** Fetch recent trades. */
  fetchTrades(symbol: string, limit?: number): Promise<TradeSnapshot[]>;

  // ── Funding rates ────────────────────────────────────────────────────

  /**
   * Fetch the current funding rate for a perpetual swap symbol.
   * Returns null if the symbol is not a swap/perp or the exchange
   * does not support funding rate queries.
   */
  fetchFundingRate(symbol: string): Promise<FundingRateSnapshot | null>;

  /**
   * Fetch historical funding rates for a perpetual swap symbol.
   * @param symbol - e.g. "BTC/USDT:USDT" (perp format)
   * @param limit - max number of records (default 100)
   */
  fetchFundingRateHistory(symbol: string, limit?: number): Promise<FundingRateSnapshot[]>;

  // ── Coin / network info ──────────────────────────────────────────────

  /** List coins with their deposit/withdrawal status and network info. */
  fetchCoinNetworkStatus(): Promise<CoinNetworkStatus[]>;
}

/**
 * Registry of adapters keyed by exchange slug.
 * Populated at startup by the ExchangeService when adapters are registered.
 */
export type AdapterRegistry = Map<string, ExchangeAdapter>;
