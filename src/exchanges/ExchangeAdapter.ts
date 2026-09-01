/**
 * Normalised data types returned by every ExchangeAdapter.
 * These are plain objects — adapters translate their native API shapes
 * into these types before returning.
 */

/** A single ticker / price quote. */
export interface TickerSnapshot {
  symbol: string;          // exchange-specific symbol, e.g. "BTCUSDT"
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

  // ── Coin / network info ──────────────────────────────────────────────

  /** List coins with their deposit/withdrawal status and network info. */
  fetchCoinNetworkStatus(): Promise<CoinNetworkStatus[]>;
}

/**
 * Registry of adapters keyed by exchange slug.
 * Populated at startup by the ExchangeService when adapters are registered.
 */
export type AdapterRegistry = Map<string, ExchangeAdapter>;
