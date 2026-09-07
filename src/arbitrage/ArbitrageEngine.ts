import { EventEmitter } from 'events';
import {
  ArbitrageEngineConfig,
  ArbitrageOpportunity,
  ComparablePair,
  OpportunityStatus,
} from './types';
import { NormalizedBookWithMetrics } from '../marketdata/orderbook/OrderBookNormalizer';
import { OrderBookNormalizer } from '../marketdata/orderbook/OrderBookNormalizer';
import { FeeCalculator } from './FeeCalculator';
import { NetworkChecker } from './NetworkChecker';
import { CrossExchangeLiquidityChecker } from './LiquidityChecker';
import { OpportunityCalculator } from './OpportunityCalculator';
import { OpportunityRanker, RankerConfig } from './OpportunityRanker';
import { ExchangeAdapter } from '../exchanges/ExchangeAdapter';
import { logger } from '../utils/logger';
import { FingerprintStore } from '../cache/BookFingerprint';
import { feeCache, networkCache, bookCache } from '../cache/RedisCache';
import { getExchangeBreaker } from '../cache/CircuitBreaker';

// ──────────────────── Engine state ───────────────────────────────────────

interface ScanResult {
  /** All calculated opportunities from this scan. */
  opportunities: ArbitrageOpportunity[];
  /** Opportunities that are currently active (profitable + executable). */
  activeOpportunities: ArbitrageOpportunity[];
  /** Number of pairs scanned. */
  pairsScanned: number;
  /** Number of pairs with positive spread. */
  positiveSpreadPairs: number;
  /** When this scan completed. */
  completedAt: number;
  /** Duration of the scan in ms. */
  durationMs: number;
}

// ──────────────────── ArbitrageEngine ────────────────────────────────────

/**
 * Central orchestrator for cross-exchange spot arbitrage scanning.
 *
 * Responsibilities:
 * - Manages all sub-components (FeeCalculator, NetworkChecker, etc.)
 * - Fetches order books from registered adapters
 * - Builds comparable pairs across exchanges
 * - Delegates to OpportunityCalculator for spread analysis
 * - Ranks results via OpportunityRanker
 * - Emits events for downstream consumers (UI, alerts, execution)
 *
 * Usage:
 * ```ts
 * const engine = new ArbitrageEngine(adapters, {
 *   symbols: ['BTC/USDT', 'ETH/USDT'],
 *   exchanges: ['binance', 'bybit', 'okx'],
 * });
 *
 * await engine.initialize();
 * const results = await engine.scan();
 * console.log(results.activeOpportunities);
 *
 * // Or run continuously:
 * await engine.start();
 * engine.on('opportunities', (opps) => { ... });
 * ```
 */
export class ArbitrageEngine extends EventEmitter {
  // ── Sub-components ─────────────────────────────────────────────────
  private feeCalculator: FeeCalculator;
  private networkChecker: NetworkChecker;
  private liquidityChecker: CrossExchangeLiquidityChecker;
  private opportunityCalculator: OpportunityCalculator;
  private ranker: OpportunityRanker;
  private bookNormalizer: OrderBookNormalizer;

  // ── Performance ────────────────────────────────────────────────────
  private fingerprintStore: FingerprintStore;
  private skippedPairs = 0;

  // ── State ──────────────────────────────────────────────────────────
  private adapters: Map<string, ExchangeAdapter>;
  private config: Required<ArbitrageEngineConfig>;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastScanResult: ScanResult | null = null;

  constructor(adapters: ExchangeAdapter[], config: ArbitrageEngineConfig = {}) {
    super();

    // Build adapter map
    this.adapters = new Map();
    for (const adapter of adapters) {
      this.adapters.set(adapter.slug, adapter);
    }

    // Merge config with defaults
    this.config = {
      exchanges: adapters.map((a) => a.slug),
      symbols: [],
      tradeSize: 1.0,
      minGrossSpreadPct: 0.001,
      minNetRoi: 0.0005,
      maxBookAgeMs: 10_000,
      maxSlippage: 0.01,
      scanIntervalMs: 5_000,
      ...config,
    };

    // Initialize sub-components
    this.feeCalculator = new FeeCalculator();
    this.networkChecker = new NetworkChecker();
    this.liquidityChecker = new CrossExchangeLiquidityChecker(this.config.maxSlippage);
    this.opportunityCalculator = new OpportunityCalculator(
      this.feeCalculator,
      this.networkChecker,
      this.liquidityChecker,
    );
    this.ranker = new OpportunityRanker();
    this.bookNormalizer = new OrderBookNormalizer();
    this.fingerprintStore = new FingerprintStore();
  }

  // ──────────────────── Lifecycle ───────────────────────────────────────

  /**
   * Initialize the engine: refresh fees and network info from adapters.
   * Must be called before the first scan.
   */
  async initialize(): Promise<void> {
    logger.info('[ArbitrageEngine] Initializing...');

    // Refresh fee schedules
    const adapters = this.getActiveAdapters();
    await Promise.allSettled([
      this.feeCalculator.refreshFromAdapters(adapters),
      this.networkChecker.refreshFromAdapters(adapters),
    ]);

    logger.info(
      `[ArbitrageEngine] Initialized — ${adapters.length} adapter(s), ` +
        `${this.config.symbols.length} symbol(s)`,
    );
  }

  /**
   * Start continuous scanning.
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[ArbitrageEngine] Already running');
      return;
    }

    this.running = true;

    // Run first scan immediately
    await this.scan();

    // Schedule periodic scans
    this.scanTimer = setInterval(async () => {
      try {
        await this.scan();
      } catch (error) {
        logger.error('[ArbitrageEngine] Scan error:', error);
      }
    }, this.config.scanIntervalMs);

    logger.info(`[ArbitrageEngine] Started — scanning every ${this.config.scanIntervalMs}ms`);
  }

  /**
   * Stop the engine.
   */
  async stop(): Promise<void> {
    this.running = false;
    if (this.scanTimer) {
      clearInterval(this.scanTimer);
      this.scanTimer = null;
    }
    const stats = this.fingerprintStore.getStats();
    logger.info(
      `[ArbitrageEngine] Stopped — fingerprint cache: ${stats.size} entries, ` +
        `${(stats.hitRate * 100).toFixed(1)}% hit rate`,
    );
  }

  // ──────────────────── Single scan ─────────────────────────────────────

  /**
   * Perform a single scan of all configured symbols across exchanges.
   *
   * Fetches order books, builds comparable pairs, calculates opportunities,
   * and returns ranked results.
   */
  async scan(): Promise<ScanResult> {
    const scanStart = Date.now();

    // Refresh fees if stale (with Redis cache)
    if (this.feeCalculator.needsRefresh()) {
      this.feeCalculator
        .refreshFromAdapters(this.getActiveAdapters())
        .then(() => feeCache.set('schedules', this.feeCalculator, 900_000))
        .catch((err) => logger.warn('[ArbitrageEngine] Background fee refresh failed:', err));
    }

    // Refresh network info if stale (with Redis cache)
    if (this.networkChecker.needsRefresh()) {
      this.networkChecker
        .refreshFromAdapters(this.getActiveAdapters())
        .then(() => networkCache.set('status', this.networkChecker, 300_000))
        .catch((err) => logger.warn('[ArbitrageEngine] Background network refresh failed:', err));
    }

    // ── Fetch order books ──
    const books = await this.fetchAllOrderBooks();

    // ── Build comparable pairs ──
    const pairs = this.buildComparablePairs(books);
    const positiveSpreadPairs = pairs.filter((p) =>
      this.opportunityCalculator.hasPositiveSpread(
        p.buyBook,
        p.sellBook,
        this.config.minGrossSpreadPct,
      ),
    );

    // ── Dedup: skip pairs whose books haven't changed ──
    const unchangedPairs = positiveSpreadPairs.filter((p) => {
      const buyKey = `${p.buyExchange}:${p.symbol}`;
      const sellKey = `${p.sellExchange}:${p.symbol}`;
      return (
        this.fingerprintStore.isUnchanged(buyKey, p.buyBook) &&
        this.fingerprintStore.isUnchanged(sellKey, p.sellBook)
      );
    });
    this.skippedPairs = unchangedPairs.length;

    const pairsToCalc = positiveSpreadPairs.filter((p) => !unchangedPairs.includes(p));

    if (pairsToCalc.length === 0 && positiveSpreadPairs.length > 0) {
      logger.debug(
        `[ArbitrageEngine] All ${positiveSpreadPairs.length} positive-spread pairs unchanged — skipping recalc`,
      );
      // Return cached result if available
      if (this.lastScanResult) {
        return { ...this.lastScanResult, completedAt: Date.now(), durationMs: Date.now() - scanStart };
      }
    }

    logger.debug(
      `[ArbitrageEngine] ${pairs.length} comparable pairs, ` +
        `${positiveSpreadPairs.length} with positive spread, ` +
        `${pairsToCalc.length} to calculate (${unchangedPairs.length} cached)`,
    );

    // ── Calculate opportunities ──
    const allOpportunities = this.opportunityCalculator.calculateAll(
      pairsToCalc.length > 0 ? pairsToCalc : positiveSpreadPairs,
      this.config.tradeSize,
      this.config.maxSlippage,
    );

    // ── Rank and filter ──
    const activeOpportunities = this.ranker.rank(allOpportunities, {
      includeStatuses: ['active', 'marginal'],
      sortBy: 'roi',
      sortDirection: 'desc',
      maxResults: 50,
    });

    const allRanked = this.ranker.rank(allOpportunities, {
      maxResults: 200,
    });

    const scanResult: ScanResult = {
      opportunities: allRanked,
      activeOpportunities,
      pairsScanned: pairs.length,
      positiveSpreadPairs: positiveSpreadPairs.length,
      completedAt: Date.now(),
      durationMs: Date.now() - scanStart,
    };

    this.lastScanResult = scanResult;

    // ── Emit events ──
    this.emit('scanComplete', scanResult);

    if (activeOpportunities.length > 0) {
      this.emit('opportunities', activeOpportunities);
      logger.info(
        `[ArbitrageEngine] Found ${activeOpportunities.length} active opportunity(ies) ` +
          `in ${scanResult.durationMs}ms`,
      );
    }

    // Log summary
    const summary = this.ranker.summarize(allOpportunities);
    const activeCount = summary.active?.count ?? 0;
    const marginalCount = summary.marginal?.count ?? 0;

    if (activeCount > 0 || marginalCount > 0) {
      logger.info(
        `[ArbitrageEngine] Summary: ${activeCount} active, ${marginalCount} marginal, ` +
          `best ROI: ${(summary.active?.bestRoi ?? 0) * 100}%`,
      );
    }

    return scanResult;
  }

  // ──────────────────── Order book fetching ─────────────────────────────

  /**
   * Fetch order books from all configured exchanges for all configured symbols.
   */
  private async fetchAllOrderBooks(): Promise<Map<string, NormalizedBookWithMetrics>> {
    const books = new Map<string, NormalizedBookWithMetrics>();
    const now = Date.now();
    const depth = 50; // 50 levels deep

    const fetchPromises: Promise<void>[] = [];

    for (const exchange of this.config.exchanges) {
      const adapter = this.adapters.get(exchange);
      if (!adapter) continue;

      for (const symbol of this.config.symbols) {
        const breaker = getExchangeBreaker(exchange, 'ArbitrageEngine');
        if (!breaker.allowRequest()) {
          logger.debug(`[ArbitrageEngine] Circuit open for ${exchange} — skipping ${symbol}`);
          continue;
        }

        fetchPromises.push(
          adapter
            .fetchOrderBook(symbol, depth)
            .then((snapshot) => {
              breaker.recordSuccess();
              // Convert adapter format to normalized format
              const normalizedBook = {
                exchange,
                symbol,
                bids: snapshot.bids,
                asks: snapshot.asks,
                timestamp: snapshot.timestamp.getTime(),
                receivedAt: now,
              };

              const enriched = this.bookNormalizer.normalize(normalizedBook);
              if (enriched) {
                books.set(`${exchange}:${symbol}`, enriched);
              }
            })
            .catch((error) => {
              breaker.recordFailure();
              // Don't log every failure — too noisy for missing symbols
              logger.debug(
                `[ArbitrageEngine] Failed to fetch ${symbol} from ${exchange}: ${error.message}`,
              );
            }),
        );
      }
    }

    await Promise.allSettled(fetchPromises);
    return books;
  }

  // ──────────────────── Pair building ───────────────────────────────────

  /**
   * Build all comparable pairs from the fetched order books.
   * For each symbol, creates pairs of (buy_exchange, sell_exchange)
   * where buy_exchange has a lower ask than sell_exchange has a bid.
   */
  private buildComparablePairs(books: Map<string, NormalizedBookWithMetrics>): ComparablePair[] {
    const pairs: ComparablePair[] = [];
    const now = Date.now();

    // Group books by symbol
    const booksBySymbol = new Map<
      string,
      Array<{
        exchange: string;
        book: NormalizedBookWithMetrics;
        ageMs: number;
      }>
    >();

    for (const [key, book] of books.entries()) {
      const [exchange, ...symbolParts] = key.split(':');
      const symbol = symbolParts.join(':');
      const ageMs = now - book.receivedAt;

      if (ageMs > this.config.maxBookAgeMs) continue;

      const entry = { exchange, book, ageMs };
      const existing = booksBySymbol.get(symbol) || [];
      existing.push(entry);
      booksBySymbol.set(symbol, existing);
    }

    // Create pairs
    for (const [symbol, entries] of booksBySymbol.entries()) {
      for (let i = 0; i < entries.length; i++) {
        for (let j = 0; j < entries.length; j++) {
          if (i === j) continue;

          const buyEntry = entries[i];
          const sellEntry = entries[j];

          // Quick pre-check: is there a positive spread at all?
          const buyAsk = buyEntry.book.metrics.bestAsk;
          const sellBid = sellEntry.book.metrics.bestBid;

          if (buyAsk > 0 && sellBid > 0 && sellBid > buyAsk) {
            pairs.push({
              symbol,
              buyExchange: buyEntry.exchange,
              buyBook: buyEntry.book,
              sellExchange: sellEntry.exchange,
              sellBook: sellEntry.book,
              buyBookAgeMs: buyEntry.ageMs,
              sellBookAgeMs: sellEntry.ageMs,
            });
          }
        }
      }
    }

    return pairs;
  }

  // ──────────────────── Public accessors ────────────────────────────────

  /**
   * Get the last scan result.
   */
  getLastScanResult(): ScanResult | null {
    return this.lastScanResult;
  }

  /**
   * Get current fee calculator (for inspection).
   */
  getFeeCalculator(): FeeCalculator {
    return this.feeCalculator;
  }

  /**
   * Get current network checker (for inspection).
   */
  getNetworkChecker(): NetworkChecker {
    return this.networkChecker;
  }

  /**
   * Get current ranker (for inspection).
   */
  getRanker(): OpportunityRanker {
    return this.ranker;
  }

  /**
   * Check if the engine is currently running.
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Update configuration at runtime.
   */
  updateConfig(config: Partial<ArbitrageEngineConfig>): void {
    Object.assign(this.config, config);

    // Update sub-component config
    if (config.maxSlippage !== undefined) {
      this.liquidityChecker = new CrossExchangeLiquidityChecker(config.maxSlippage);
      this.opportunityCalculator = new OpportunityCalculator(
        this.feeCalculator,
        this.networkChecker,
        this.liquidityChecker,
      );
    }

    // Restart timer if interval changed
    if (config.scanIntervalMs !== undefined && this.running) {
      if (this.scanTimer) clearInterval(this.scanTimer);
      this.scanTimer = setInterval(async () => {
        try {
          await this.scan();
        } catch (error) {
          logger.error('[ArbitrageEngine] Scan error:', error);
        }
      }, this.config.scanIntervalMs);
    }

    logger.info('[ArbitrageEngine] Config updated');
  }

  /**
   * Get the set of active (connected) adapters.
   */
  private getActiveAdapters(): ExchangeAdapter[] {
    const adapters: ExchangeAdapter[] = [];
    for (const slug of this.config.exchanges) {
      const adapter = this.adapters.get(slug);
      if (adapter) adapters.push(adapter);
    }
    return adapters;
  }
}
