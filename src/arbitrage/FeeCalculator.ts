import { ExchangeFees, TradingFeeSchedule } from './types';
import { ExchangeAdapter } from '../exchanges/ExchangeAdapter';
import { getExchangeBreaker } from '../cache/CircuitBreaker';
import { logger } from '../utils/logger';

// ──────────────────────────── Default fee schedules ──────────────────────

/**
 * Fallback fee schedules when adapters cannot supply market-level fees.
 * These are typical taker fees and should be overridden with real data
 * whenever possible.
 */
const DEFAULT_FEE_SCHEDULES: Record<string, TradingFeeSchedule> = {
  binance: { exchange: 'binance', symbol: '*', takerFee: 0.001, makerFee: 0.001 },
  bybit: { exchange: 'bybit', symbol: '*', takerFee: 0.001, makerFee: 0.001 },
  okx: { exchange: 'okx', symbol: '*', takerFee: 0.001, makerFee: 0.0008 },
  kucoin: { exchange: 'kucoin', symbol: '*', takerFee: 0.001, makerFee: 0.001 },
  gateio: { exchange: 'gateio', symbol: '*', takerFee: 0.002, makerFee: 0.002 },
  mexc: { exchange: 'mexc', symbol: '*', takerFee: 0.001, makerFee: 0.001 },
  bitget: { exchange: 'bitget', symbol: '*', takerFee: 0.001, makerFee: 0.001 },
};

// ──────────────────────────── FeeCalculator ──────────────────────────────

/**
 * Calculates trading fees for cross-exchange arbitrage.
 *
 * For each side of the arbitrage:
 * - Buy exchange: you place a market buy → taker fee applies.
 * - Sell exchange: you place a market sell → taker fee applies.
 *
 * If the order book depth allows a limit order (maker), the maker fee
 * could be used — but for scanner evaluation we conservatively use taker
 * fees since execution speed matters.
 */
export class FeeCalculator {
  private feeCache = new Map<string, ExchangeFees>();
  private cacheExpiryMs: number;
  private lastRefreshAt = 0;

  constructor(cacheExpiryMs = 60_000) {
    this.cacheExpiryMs = cacheExpiryMs;
  }

  // ──────────────────── Public API ──────────────────────────────────────

  /**
   * Refresh fee schedules from all adapters. Should be called periodically.
   */
  async refreshFromAdapters(adapters: ExchangeAdapter[]): Promise<void> {
    for (const adapter of adapters) {
      const breaker = getExchangeBreaker(adapter.slug, 'FeeCalculator');
      if (!breaker.allowRequest()) {
        logger.debug(`[FeeCalculator] Circuit open for ${adapter.slug} — skipping`);
        continue;
      }
      try {
        const markets = await adapter.fetchMarkets();
        breaker.recordSuccess();
        for (const market of markets) {
          const key = `${adapter.slug}:${market.symbol}`;
          const takerFee = parseFloat(market.takerFee);
          const makerFee = parseFloat(market.makerFee);

          if (Number.isFinite(takerFee) && Number.isFinite(makerFee)) {
            this.feeCache.set(key, {
              exchange: adapter.slug,
              symbol: market.symbol,
              takerFee,
              makerFee,
              known: true,
            });
          }
        }
      } catch (error) {
        breaker.recordFailure();
        logger.warn(`[FeeCalculator] Failed to fetch fees from ${adapter.slug}:`, error);
      }
    }
    this.lastRefreshAt = Date.now();
    logger.info(`[FeeCalculator] Refreshed fees: ${this.feeCache.size} symbol-level entries`);
  }

  /**
   * Get the trading fee for a specific exchange and symbol.
   * Falls back to exchange-level defaults, then to a global fallback.
   */
  getFee(exchange: string, symbol: string): ExchangeFees {
    // 1. Exact symbol-level match
    const symbolKey = `${exchange}:${symbol}`;
    const symbolFee = this.feeCache.get(symbolKey);
    if (symbolFee) return symbolFee;

    // 2. Exchange-level wildcard (from defaults)
    const defaultFee = DEFAULT_FEE_SCHEDULES[exchange];
    if (defaultFee) {
      return {
        exchange,
        symbol,
        takerFee: defaultFee.takerFee,
        makerFee: defaultFee.makerFee,
        known: false,
      };
    }

    // 3. Global fallback: 0.1% taker
    logger.warn(`[FeeCalculator] No fee data for ${exchange}:${symbol} — using 0.1% fallback`);
    return { exchange, symbol, takerFee: 0.001, makerFee: 0.001, known: false };
  }

  /**
   * Calculate the trading fee in quote currency for a given trade.
   *
   * @param exchange - The exchange where the trade happens.
   * @param symbol - The trading pair symbol.
   * @param quoteCost - The cost in quote currency (price × quantity).
   * @param isMaker - If true, use maker fee instead of taker fee.
   * @returns The fee amount in quote currency.
   */
  calculateTradingFee(
    exchange: string,
    symbol: string,
    quoteCost: number,
    isMaker = false,
  ): number {
    const fees = this.getFee(exchange, symbol);
    const rate = isMaker ? fees.makerFee : fees.takerFee;
    return quoteCost * rate;
  }

  /**
   * Calculate total arbitrage fees for a buy+sell pair.
   *
   * @param buyExchange - Exchange where the buy happens.
   * @param sellExchange - Exchange where the sell happens.
   * @param symbol - The trading pair.
   * @param buyQuoteCost - Quote currency cost of the buy (price × qty).
   * @param sellQuoteRevenue - Quote currency revenue from the sell (price × qty).
   * @returns Object with individual and total fees.
   */
  calculateArbitrageFees(
    buyExchange: string,
    sellExchange: string,
    symbol: string,
    buyQuoteCost: number,
    sellQuoteRevenue: number,
  ): {
    buyFee: number;
    sellFee: number;
    totalFees: number;
    buyFeeRate: number;
    sellFeeRate: number;
  } {
    const buyFee = this.calculateTradingFee(buyExchange, symbol, buyQuoteCost);
    const sellFee = this.calculateTradingFee(sellExchange, symbol, sellQuoteRevenue);
    const buyFeeRate = this.getFee(buyExchange, symbol).takerFee;
    const sellFeeRate = this.getFee(sellExchange, symbol).takerFee;

    return {
      buyFee,
      sellFee,
      totalFees: buyFee + sellFee,
      buyFeeRate,
      sellFeeRate,
    };
  }

  /**
   * Check if the fee cache needs refreshing.
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastRefreshAt > this.cacheExpiryMs;
  }

  /**
   * Get all cached fee entries (for diagnostics).
   */
  getAllFees(): ExchangeFees[] {
    return Array.from(this.feeCache.values());
  }
}
