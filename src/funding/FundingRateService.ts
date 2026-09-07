import { EventEmitter } from 'events';
import { v4 as uuidv4 } from 'uuid';
import { FundingRateEntry, FundingRateHistoryRecord, SpotPerpPair } from './types';
import { ExchangeAdapter, FundingRateSnapshot } from '../exchanges/ExchangeAdapter';
import { logger } from '../utils/logger';

// ──────────────────── Known perp symbol suffixes ────────────────────────

/**
 * CCXT convention: perpetual swap symbols use a settlement-currency suffix.
 * e.g. "BTC/USDT:USDT" (Binance, OKX, Bybit) or "BTC/USDT:USDT-PERP"
 * Each exchange may vary — these are the common patterns.
 */
const PERP_SUFFIXES = [':USDT', ':USD', ':BUSD', ':USDC'];

/**
 * Strip the settlement suffix to recover the base/quote pair.
 * "BTC/USDT:USDT" → "BTC/USDT"
 * "BTC/USD:USD"   → "BTC/USD"
 */
function stripPerpSuffix(perpSymbol: string): string {
  for (const suffix of PERP_SUFFIXES) {
    if (perpSymbol.endsWith(suffix)) {
      return perpSymbol.slice(0, -suffix.length);
    }
  }
  return perpSymbol;
}

/**
 * Given a spot symbol, produce the likely perp symbol variants.
 * "BTC/USDT" → ["BTC/USDT:USDT", "BTC/USDT:USD"]
 */
function perpVariantsForSpot(spotSymbol: string): string[] {
  return PERP_SUFFIXES.map((s) => `${spotSymbol}${s}`);
}

// ──────────────────── FundingRateService ────────────────────────────────

/**
 * Fetches, caches, and stores funding rate data across exchanges.
 *
 * Responsibilities:
 * - Discovers spot/perp pairs on supported exchanges
 * - Fetches current funding rates from adapters
 * - Fetches historical funding rates for charting
 * - Maintains in-memory caches with configurable TTL
 * - Emits events when new data is available
 */
export class FundingRateService extends EventEmitter {
  /** Current funding rates keyed by "exchange:perpSymbol". */
  private rateCache = new Map<string, FundingRateEntry>();
  /** Historical rates keyed by "exchange:perpSymbol". */
  private historyCache = new Map<string, FundingRateHistoryRecord[]>();
  /** Discovered spot/perp pairs keyed by exchange. */
  private discoveredPairs = new Map<string, SpotPerpPair[]>();
  /** Adapters keyed by slug. */
  private adapters: Map<string, ExchangeAdapter>;
  /** Cache TTL in ms. */
  private cacheTtlMs: number;
  /** Max history records per pair. */
  private maxHistoryPerPair: number;
  /** Last time we refreshed current rates. */
  private lastRateRefreshAt = 0;
  /** Last time we discovered pairs. */
  private lastPairDiscoveryAt = 0;

  constructor(
    adapters: ExchangeAdapter[],
    options: { cacheTtlMs?: number; maxHistoryPerPair?: number } = {},
  ) {
    super();
    this.adapters = new Map();
    for (const a of adapters) {
      this.adapters.set(a.slug, a);
    }
    this.cacheTtlMs = options.cacheTtlMs ?? 60_000; // 1 min default
    this.maxHistoryPerPair = options.maxHistoryPerPair ?? 1000;
  }

  // ──────────────────── Pair Discovery ─────────────────────────────────

  /**
   * Discover spot/perp pairs on all exchanges that support futures.
   * Must be called before fetching rates.
   */
  async discoverPairs(exchanges?: string[]): Promise<SpotPerpPair[]> {
    const targetExchanges = exchanges ?? Array.from(this.adapters.keys());
    const allPairs: SpotPerpPair[] = [];

    for (const slug of targetExchanges) {
      const adapter = this.adapters.get(slug);
      if (!adapter || !adapter.capabilities.supportsFutures) continue;

      try {
        const pairs = await this.discoverPairsForExchange(slug, adapter);
        allPairs.push(...pairs);
        this.discoveredPairs.set(slug, pairs);
      } catch (error) {
        logger.warn(`[FundingRateService] Pair discovery failed for ${slug}:`, error);
      }
    }

    this.lastPairDiscoveryAt = Date.now();
    logger.info(
      `[FundingRateService] Discovered ${allPairs.length} spot/perp pairs ` +
        `across ${targetExchanges.length} exchange(s)`,
    );
    return allPairs;
  }

  /**
   * Get discovered pairs for an exchange (from cache).
   */
  getPairs(exchange: string): SpotPerpPair[] {
    return this.discoveredPairs.get(exchange) ?? [];
  }

  /**
   * Get all discovered pairs across all exchanges.
   */
  getAllPairs(): SpotPerpPair[] {
    const all: SpotPerpPair[] = [];
    for (const pairs of this.discoveredPairs.values()) {
      all.push(...pairs);
    }
    return all;
  }

  // ──────────────────── Rate Fetching ──────────────────────────────────

  /**
   * Fetch current funding rates for all discovered pairs.
   * Results are cached in memory and emitted as events.
   */
  async refreshRates(exchanges?: string[]): Promise<FundingRateEntry[]> {
    const pairs = exchanges
      ? this.getAllPairs().filter((p) => exchanges.includes(p.exchange))
      : this.getAllPairs();

    if (pairs.length === 0) {
      logger.debug('[FundingRateService] No pairs to fetch rates for');
      return [];
    }

    const results: FundingRateEntry[] = [];
    const fetchPromises: Promise<void>[] = [];

    for (const pair of pairs) {
      fetchPromises.push(
        this.fetchRateForPair(pair)
          .then((entry) => {
            if (entry) results.push(entry);
          })
          .catch((err) => {
            logger.debug(
              `[FundingRateService] Failed to fetch rate for ${pair.exchange}:${pair.perpSymbol}: ${err.message}`,
            );
          }),
      );
    }

    await Promise.allSettled(fetchPromises);
    this.lastRateRefreshAt = Date.now();

    if (results.length > 0) {
      this.emit('ratesUpdated', results);
    }

    logger.info(`[FundingRateService] Refreshed ${results.length} funding rates`);
    return results;
  }

  /**
   * Fetch historical funding rates for a specific pair.
   */
  async fetchHistory(
    exchange: string,
    perpSymbol: string,
    limit = 100,
  ): Promise<FundingRateHistoryRecord[]> {
    const adapter = this.adapters.get(exchange);
    if (!adapter) return [];

    try {
      const snapshots = await adapter.fetchFundingRateHistory(perpSymbol, limit);
      const records: FundingRateHistoryRecord[] = snapshots.map((s) => ({
        exchange,
        symbol: perpSymbol,
        fundingRate: s.fundingRate,
        timestamp: s.timestamp.getTime(),
      }));

      // Merge into history cache
      const cacheKey = `${exchange}:${perpSymbol}`;
      const existing = this.historyCache.get(cacheKey) ?? [];
      const merged = this.mergeHistory(existing, records);
      this.historyCache.set(cacheKey, merged);

      return merged;
    } catch (error) {
      logger.debug(
        `[FundingRateService] History fetch failed for ${exchange}:${perpSymbol}: ${error}`,
      );
      return this.historyCache.get(`${exchange}:${perpSymbol}`) ?? [];
    }
  }

  // ──────────────────── Cache Accessors ────────────────────────────────

  /**
   * Get the current cached funding rate for a specific pair.
   */
  getRate(exchange: string, perpSymbol: string): FundingRateEntry | undefined {
    return this.rateCache.get(`${exchange}:${perpSymbol}`);
  }

  /**
   * Get all cached current rates.
   */
  getAllRates(): FundingRateEntry[] {
    return Array.from(this.rateCache.values());
  }

  /**
   * Get cached history for a pair.
   */
  getHistory(exchange: string, perpSymbol: string): FundingRateHistoryRecord[] {
    return this.historyCache.get(`${exchange}:${perpSymbol}`) ?? [];
  }

  /**
   * Check if rate cache needs refreshing.
   */
  needsRateRefresh(): boolean {
    return Date.now() - this.lastRateRefreshAt > this.cacheTtlMs;
  }

  /**
   * Check if pair discovery needs refreshing (daily).
   */
  needsPairDiscovery(): boolean {
    return Date.now() - this.lastPairDiscoveryAt > 86_400_000; // 24h
  }

  /**
   * Get total number of cached history records.
   */
  getHistorySize(): number {
    let total = 0;
    for (const records of this.historyCache.values()) {
      total += records.length;
    }
    return total;
  }

  // ──────────────────── Internal ───────────────────────────────────────

  /**
   * Discover spot/perp pairs for a single exchange by listing markets
   * and matching spot symbols with their perp counterparts.
   */
  private async discoverPairsForExchange(
    exchange: string,
    adapter: ExchangeAdapter,
  ): Promise<SpotPerpPair[]> {
    const markets = await adapter.fetchMarkets();
    const spotSymbols = new Set<string>();

    // Collect active spot symbols
    for (const m of markets) {
      if (m.status === 'active') {
        spotSymbols.add(m.symbol);
      }
    }

    // For each spot symbol, check if a perp variant exists
    const pairs: SpotPerpPair[] = [];
    const perpSymbols = new Set<string>();

    // We need to check if the exchange has perp markets
    // Try fetching a known perp symbol to see if fetchFundingRate works
    // A simpler heuristic: if the exchange supports futures, try common perp patterns
    if (!adapter.capabilities.supportsFutures) return pairs;

    for (const spotSymbol of spotSymbols) {
      const [baseCurrency, quoteCurrency] = spotSymbol.split('/');

      // Try common perp symbol patterns
      const candidates = perpVariantsForSpot(spotSymbol);

      for (const perpCandidate of candidates) {
        if (perpSymbols.has(perpCandidate)) continue;

        // Try fetching a funding rate — if it works, the perp exists
        try {
          const rate = await adapter.fetchFundingRate(perpCandidate);
          if (rate !== null) {
            pairs.push({
              exchange,
              spotSymbol,
              perpSymbol: perpCandidate,
              baseCurrency,
              quoteCurrency,
            });
            perpSymbols.add(perpCandidate);
            break; // Found a perp for this spot, move to next
          }
        } catch {
          // Symbol doesn't exist or fetch failed — try next variant
        }
      }
    }

    return pairs;
  }

  /**
   * Fetch the current funding rate for one pair.
   */
  private async fetchRateForPair(pair: SpotPerpPair): Promise<FundingRateEntry | null> {
    const adapter = this.adapters.get(pair.exchange);
    if (!adapter) return null;

    const snapshot = await adapter.fetchFundingRate(pair.perpSymbol);
    if (!snapshot) return null;

    const entry: FundingRateEntry = {
      exchange: pair.exchange,
      symbol: pair.perpSymbol,
      fundingRate: snapshot.fundingRate,
      timestamp: snapshot.timestamp.getTime(),
      fetchedAt: snapshot.fetchedAt.getTime(),
      nextFundingTime: snapshot.nextFundingTime?.getTime(),
      fundingIntervalMs: snapshot.fundingIntervalMs,
    };

    const cacheKey = `${pair.exchange}:${pair.perpSymbol}`;
    this.rateCache.set(cacheKey, entry);

    return entry;
  }

  /**
   * Merge new history records into existing ones, dedup by timestamp,
   * and enforce the max history limit.
   */
  private mergeHistory(
    existing: FundingRateHistoryRecord[],
    incoming: FundingRateHistoryRecord[],
  ): FundingRateHistoryRecord[] {
    const byTimestamp = new Map<number, FundingRateHistoryRecord>();

    for (const r of existing) {
      byTimestamp.set(r.timestamp, r);
    }
    for (const r of incoming) {
      byTimestamp.set(r.timestamp, r); // incoming overwrites same timestamp
    }

    const merged = Array.from(byTimestamp.values());
    merged.sort((a, b) => a.timestamp - b.timestamp);

    // Enforce max limit
    if (merged.length > this.maxHistoryPerPair) {
      return merged.slice(merged.length - this.maxHistoryPerPair);
    }

    return merged;
  }
}
