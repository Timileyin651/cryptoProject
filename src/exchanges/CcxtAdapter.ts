import type CCXT from 'ccxt';
import {
  ExchangeAdapter,
  AdapterCapabilities,
  TickerSnapshot,
  OrderBookSnapshot,
  OrderBookLevel,
  TradeSnapshot,
  MarketInfo,
  CoinNetworkStatus,
  FundingRateSnapshot,
} from './ExchangeAdapter';
import {
  ExchangeError,
  ExchangeRateLimitError,
  ExchangeSymbolNotFoundError,
  ExchangeNetworkError,
  ExchangeDataError,
} from './errors';
import { logger } from '../utils/logger';

/**
 * Retry configuration for exchange API calls.
 * Only retries on transient network errors (timeouts, connection resets).
 * Does NOT retry on 4xx errors (bad symbol, auth, rate limit) or data errors.
 */
const RETRY_CONFIG = {
  maxAttempts: 5,
  baseDelayMs: 1000,
  maxDelayMs: 30_000,
  jitterFactor: 0.2, // ±20% jitter
};

/**
 * Check if an error is retryable (transient network issue).
 */
function isRetryableError(error: any): boolean {
  if (error instanceof ExchangeSymbolNotFoundError) return false;
  if (error instanceof ExchangeRateLimitError) {
    // Don't retry rate limits — the retryAfterMs is known from CCXT
    return false;
  }
  if (error instanceof ExchangeDataError) return false;

  const message = (error.message ?? String(error)).toLowerCase();
  const retryablePatterns = [
    'etimedout', 'econnrefused', 'econnreset', 'econnaborted',
    'connect timeout', 'connection timeout', 'connection reset',
    'socket hang up', 'network error', 'request timeout',
    'exchange not available', 'server temporarily unavailable',
  ];
  return retryablePatterns.some((p) => message.includes(p));
}

/**
 * Sleep for a given duration.
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate delay with exponential backoff + jitter.
 * delay = min(baseDelay * 2^attempt, maxDelay) + jitter
 */
function calculateBackoff(attempt: number): number {
  const exponential = Math.min(RETRY_CONFIG.baseDelayMs * Math.pow(2, attempt), RETRY_CONFIG.maxDelayMs);
  const jitter = exponential * RETRY_CONFIG.jitterFactor * (Math.random() * 2 - 1);
  return Math.round(exponential + jitter);
}


/**
 * Configuration passed to every CcxtAdapter subclass.
 * API keys are optional — public market data does not require auth.
 */
export interface CcxtConfig {
  apiKey?: string;
  secret?: string;
  password?: string; // OKX pass-phrase
  sandbox?: boolean;
  /** Extra CCXT options forwarded verbatim. */
  options?: Record<string, unknown>;
}

/**
 * Abstract base class that wraps a CCXT exchange instance and
 * translates its responses into the normalised types defined by
 * `ExchangeAdapter`.
 *
 * Subclasses only need to:
 *  1. Call `super()` with the CCXT class, slug, and config.
 *  2. Set `slug`, `name`, and `baseUrl` in their own declarations.
 *  3. Optionally override `buildCapabilities()` to refine the
 *     default capability detection.
 */
export abstract class CcxtAdapter implements ExchangeAdapter {
  abstract readonly slug: string;
  abstract readonly name: string;
  abstract readonly baseUrl: string;

  protected exchange: any; // CCXT instance (avoid generic typing issues)
  private config: CcxtConfig;
  private _capabilities?: AdapterCapabilities;

  constructor(
    private ExchangeClass: any, // new (config?) => ccxt.Exchange
    _slug: string,
    config: CcxtConfig = {},
  ) {
    this.config = config;
    this.exchange = null;
  }

  // ──────────────────── Lifecycle ───────────────────────────────────────

  async initialize(): Promise<void> {
    try {
      this.exchange = new this.ExchangeClass({
        apiKey: this.config.apiKey,
        secret: this.config.secret,
        password: this.config.password,
        enableRateLimit: true,
        options: {
          defaultType: 'spot',
          ...this.config.options,
        },
        ...(this.config.sandbox ? { sandbox: true } : {}),
      });

      // Build capabilities from CCXT's `has` + optional subclass refinement
      this._capabilities = this.buildCapabilities();

      logger.info(
        `CCXT adapter initialised: ${this.name} (${this.slug}) — ` +
          `spot=${this._capabilities.supportsSpot}, ` +
          `futures=${this._capabilities.supportsFutures}, ` +
          `ws=${this._capabilities.supportsWebSocket}`,
      );
    } catch (error) {
      logger.error(`Failed to initialise CCXT adapter for ${this.slug}:`, error);
      throw new ExchangeError(
        `Failed to initialise adapter for ${this.slug}`,
        this.slug,
        error as Error,
      );
    }
  }

  async shutdown(): Promise<void> {
    if (this.exchange?.close) {
      await this.exchange.close();
    }
    logger.info(`CCXT adapter shut down: ${this.name}`);
  }

  // ──────────────────── Capabilities ────────────────────────────────────

  get capabilities(): AdapterCapabilities {
    if (!this._capabilities) {
      throw new ExchangeError(
        `Adapter ${this.slug} not initialised — call initialize() first`,
        this.slug,
      );
    }
    return this._capabilities;
  }

  /**
   * Build capabilities from CCXT's `has` flags.
   * Subclasses can override to correct known inaccuracies.
   */
  protected buildCapabilities(): AdapterCapabilities {
    const h = this.exchange.has;
    return {
      supportsSpot: !!h.spot,
      supportsFutures: !!h.future || !!h.swap,
      supportsMargin: !!h.margin,
      supportsWebSocket: !!h.ws,
      supportsOrderBook: !!h.fetchOrderBook,
      supportsTicker: !!h.fetchTicker,
      supportsTrades: !!h.fetchTrades,
    };
  }

  // ──────────────────── Market data ─────────────────────────────────────

  async fetchMarkets(): Promise<MarketInfo[]> {
    return this.retryWithBackoff(async () => {
      const raw = await this.exchange.loadMarkets();
      const markets: MarketInfo[] = [];

      for (const symbol of Object.keys(raw)) {
        const m = raw[symbol];
        // Skip contracts that are not spot if we only want spot
        if (m.contract) continue;

        markets.push({
          symbol: m.symbol,
          baseCurrency: m.base,
          quoteCurrency: m.quote,
          takerFee: String(m.taker ?? 0),
          makerFee: String(m.maker ?? 0),
          minOrderSize: m.limits?.amount?.min != null ? String(m.limits.amount.min) : null,
          maxOrderSize: m.limits?.amount?.max != null ? String(m.limits.amount.max) : null,
          minPriceTick: m.limits?.price?.min != null ? String(m.limits.price.min) : null,
          status: m.active ? 'active' : 'inactive',
        });
      }

      return markets;
    }, `${this.slug}: loadMarkets`);
  }

  async fetchTicker(symbol: string): Promise<TickerSnapshot> {
    return this.retryWithBackoff(async () => {
      this.validateSymbol(symbol);
      const raw = await this.exchange.fetchTicker(symbol);
      return {
        symbol: raw.symbol,
        bid: String(raw.bid ?? 0),
        ask: String(raw.ask ?? 0),
        last: String(raw.last ?? 0),
        volume24h: String(raw.baseVolume ?? raw.quoteVolume ?? 0),
        high24h: String(raw.high ?? 0),
        low24h: String(raw.low ?? 0),
        timestamp: new Date(raw.timestamp ?? Date.now()),
      };
    }, `${this.slug}: ${symbol} ticker`);
  }

  async fetchOrderBook(symbol: string, depth = 20): Promise<OrderBookSnapshot> {
    const originalDepth = depth;
    const adjustedDepth = this.validateOrderBookDepth(depth);
    const context = `${this.slug}: ${symbol} order book (depth=${originalDepth} -> ${adjustedDepth})`;
    return this.retryWithBackoff(async () => {
      this.validateSymbol(symbol);
      const raw = await this.exchange.fetchOrderBook(symbol, adjustedDepth);
      const mapLevel = (l: any[]): OrderBookLevel => ({
        price: String(l[0]),
        quantity: String(l[1]),
      });
      return {
        symbol,
        bids: (raw.bids ?? []).slice(0, adjustedDepth).map(mapLevel),
        asks: (raw.asks ?? []).slice(0, adjustedDepth).map(mapLevel),
        timestamp: new Date(raw.timestamp ?? Date.now()),
      };
    }, context);
  }

  /**
   * Validate and adjust the order book depth for exchange-specific limits.
   * Subclasses can override this to enforce exchange-specific constraints
   * (e.g., KuCoin only accepts 20 or 100).
   */
  protected validateOrderBookDepth(depth: number): number {
    return depth;
  }

  async fetchTrades(symbol: string, limit = 50): Promise<TradeSnapshot[]> {
    return this.retryWithBackoff(async () => {
      this.validateSymbol(symbol);
      const raw = await this.exchange.fetchTrades(symbol, undefined, limit);
      return raw.map((t: any): TradeSnapshot => ({
        symbol: t.symbol,
        side: t.side as 'buy' | 'sell',
        price: String(t.price),
        quantity: String(t.amount),
        timestamp: new Date(t.timestamp),
        tradeId: t.id ?? undefined,
      }));
    }, `${this.slug}: ${symbol} trades`);
  }

  // ──────────────────── Funding rates ──────────────────────────────────

  async fetchFundingRate(symbol: string): Promise<FundingRateSnapshot | null> {
    return this.retryWithBackoff(async () => {
      if (!this.exchange.has.fetchFundingRate) {
        logger.debug(`${this.slug}: fetchFundingRate not supported`);
        return null;
      }

      const raw = await this.exchange.fetchFundingRate(symbol);
      if (!raw || raw.fundingRate == null) return null;

      return {
        symbol: raw.symbol,
        fundingRate: parseFloat(String(raw.fundingRate)),
        timestamp: new Date(raw.timestamp ?? Date.now()),
        fetchedAt: new Date(),
        nextFundingTime: raw.nextFundingTime ? new Date(raw.nextFundingTime) : undefined,
        fundingIntervalMs:
          raw.fundingTimestamp && raw.timestamp ? raw.fundingTimestamp - raw.timestamp : undefined,
      };
    }, `${this.slug}: ${symbol} funding rate`);
  }

  async fetchFundingRateHistory(symbol: string, limit = 100): Promise<FundingRateSnapshot[]> {
    return this.retryWithBackoff(async () => {
      if (!this.exchange.has.fetchFundingRateHistory) {
        logger.debug(`${this.slug}: fetchFundingRateHistory not supported`);
        return [];
      }

      const raw = await this.exchange.fetchFundingRateHistory(symbol, undefined, limit);
      if (!Array.isArray(raw)) return [];

      return raw.map((entry: any): FundingRateSnapshot => ({
        symbol: entry.symbol ?? symbol,
        fundingRate: parseFloat(String(entry.fundingRate ?? 0)),
        timestamp: new Date(entry.timestamp ?? Date.now()),
        fetchedAt: new Date(),
        nextFundingTime: entry.nextFundingTime ? new Date(entry.nextFundingTime) : undefined,
      }));
    }, `${this.slug}: ${symbol} funding rate history`);
  }

  // ──────────────────── Coin / network info ─────────────────────────────

  async fetchCoinNetworkStatus(): Promise<CoinNetworkStatus[]> {
    return this.retryWithBackoff(async () => {
      // CCXT fetchCurrencies is the standard way to get deposit/withdraw info
      if (!this.exchange.has.fetchCurrencies) {
        logger.warn(`${this.slug}: fetchCurrencies not supported — returning empty`);
        return [];
      }

      const currencies = await this.exchange.fetchCurrencies();
      const results: CoinNetworkStatus[] = [];

      for (const [code, currency] of Object.entries(currencies) as [string, any][]) {
        const networks = currency.networks ?? {};
        const networkKeys = Object.keys(networks);

        if (networkKeys.length === 0) {
          // Exchange does not break down by network — emit one entry
          results.push({
            coin: code,
            network: null,
            depositEnabled: currency.active ?? false,
            withdrawalEnabled: currency.active ?? false,
            withdrawalFee: String(currency.fees?.withdraw ?? 0),
            minWithdrawal:
              currency.limits?.withdraw?.min != null ? String(currency.limits.withdraw.min) : null,
            maxWithdrawal:
              currency.limits?.withdraw?.max != null ? String(currency.limits.withdraw.max) : null,
            confirmationBlocks: null,
          });
          continue;
        }

        for (const [netId, net] of Object.entries(networks) as [string, any][]) {
          results.push({
            coin: code,
            network: netId,
            depositEnabled: net.active ?? net.deposit ?? false,
            withdrawalEnabled: net.active ?? net.withdraw ?? false,
            withdrawalFee: String(net.fees?.withdraw ?? 0),
            minWithdrawal:
              net.limits?.withdraw?.min != null ? String(net.limits.withdraw.min) : null,
            maxWithdrawal:
              net.limits?.withdraw?.max != null ? String(net.limits.withdraw.max) : null,
            confirmationBlocks: null,
          });
        }
      }

      return results;
    }, `${this.slug}: fetchCurrencies`);
  }

  // ──────────────────── Error translation ───────────────────────────────

  protected translateError(error: any): ExchangeError {
    if (error instanceof ExchangeError) {
      return error;
    }

    const name: string = error.constructor?.name ?? error.name ?? '';
    const originalMsg: string = error.message ?? String(error);

    // Extract full HTTP context — CCXT puts these on the error object
    const httpStatus: number | null = error.statusCode ?? error.status ?? null;
    const responseBody: unknown = error.body ?? error.response?.body ?? error.json ?? null;
    const requestUrl: string | null = error.url ?? null;

    // Build a detailed diagnostic string that preserves all context
    const detailParts: string[] = [originalMsg];
    if (httpStatus) detailParts.push(`HTTP ${httpStatus}`);
    if (requestUrl) detailParts.push(`url=${requestUrl}`);
    if (responseBody != null) {
      const bodyStr = typeof responseBody === 'string' ? responseBody : JSON.stringify(responseBody);
      detailParts.push(`body=${bodyStr.slice(0, 300)}`);
    }
    const detail = detailParts.join(' | ');

    // Rate limiting
    if (
      name === 'DDoSProtection' ||
      name === 'RateLimitExceeded' ||
      httpStatus === 429 ||
      originalMsg.includes('429') ||
      originalMsg.toLowerCase().includes('rate limit')
    ) {
      const retryAfter = originalMsg.match(/(\d+)/)?.[1];
      logger.warn(`[${this.slug}] Rate limit error: ${detail}`);
      return new ExchangeRateLimitError(
        this.slug,
        retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      );
    }

    // Symbol / market not found
    if (
      name === 'BadSymbol' ||
      name === 'SymbolNotFound' ||
      originalMsg.includes('does not have market') ||
      originalMsg.includes('symbol')
    ) {
      const symbol = originalMsg.match(/['"]([^'"]+)['"]/)?.[1] ?? 'unknown';
      return new ExchangeSymbolNotFoundError(this.slug, symbol);
    }

    // Network / connectivity
    if (
      name === 'NetworkError' ||
      name === 'RequestTimeout' ||
      name === 'ExchangeNotAvailable' ||
      originalMsg.includes('ECONNREFUSED') ||
      originalMsg.includes('ETIMEDOUT')
    ) {
      logger.warn(`[${this.slug}] Network error: ${detail}`);
      return new ExchangeNetworkError(this.slug, error);
    }

    // HTTP 5xx / 502 from exchange (KuCoin/OKX WAF blocks)
    if (httpStatus && httpStatus >= 500) {
      logger.warn(`[${this.slug}] HTTP ${httpStatus} from exchange: ${detail}`);
      return new ExchangeNetworkError(this.slug, error);
    }

    // Auth
    if (
      name === 'AuthenticationError' ||
      originalMsg.includes('API key') ||
      originalMsg.includes('authorization')
    ) {
      logger.warn(`[${this.slug}] Auth error: ${detail}`);
      return new ExchangeError(detail, this.slug, error);
    }

    // Data / parsing
    if (name === 'ExchangeError' || name === 'InvalidOrder' || name === 'BadRequest') {
      logger.warn(`[${this.slug}] Data error: ${detail}`);
      return new ExchangeDataError(this.slug, detail);
    }

    // Generic fallback — log full detail
    logger.warn(`[${this.slug}] Unknown error: ${detail}`);
    return new ExchangeError(detail, this.slug, error);
  }

  protected validateSymbol(symbol: string): void {
    if (!symbol || !symbol.includes('/')) {
      throw new ExchangeDataError(
        this.slug,
        `Invalid symbol format '${symbol}' — expected 'BASE/QUOTE'`,
      );
    }
  }

  /**
   * Execute a volatile operation with retry and exponential backoff.
   * Only retries on transient network errors.
   *
   * @param operation - The async operation to run (returns the result)
   * @param context - Description for logging (e.g. "okx: BTC/USDT order book")
   * @returns The operation result
   */
  protected async retryWithBackoff<T>(
    operation: () => Promise<T>,
    context: string,
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt < RETRY_CONFIG.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;

        // Translate the error first (so our typed errors propagate correctly)
        const translated = this.translateError(error);

        // If it's our own typed error, decide whether to retry
        if (translated instanceof ExchangeError && translated instanceof ExchangeNetworkError) {
          // Network errors are retryable — fall through to retry logic
          lastError = translated;
        } else {
          // Non-retryable typed errors (rate limit, symbol not found, data error)
          throw translated;
        }

        if (!isRetryableError(lastError)) {
          throw lastError;
        }

        if (attempt < RETRY_CONFIG.maxAttempts - 1) {
          const delay = calculateBackoff(attempt);
          logger.info(`[CcxtAdapter] Retry ${attempt + 1}/${RETRY_CONFIG.maxAttempts - 1} for ${context} — waiting ${delay}ms (error: ${lastError.message})`);
          await sleep(delay);
        } else {
          logger.warn(`[CcxtAdapter] All ${RETRY_CONFIG.maxAttempts} attempts failed for ${context}: ${lastError.message}`);
        }
      }
    }

    // After all retries exhausted, throw the last error
    throw lastError;
  }
}
