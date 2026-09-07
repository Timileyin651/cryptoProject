import { EventEmitter } from 'events';
import {
  FundingEngineConfig,
  BasisSpreadResult,
  FundingRateEntry,
  SpotPerpPair,
  FundingOpportunityStatus,
} from './types';
import { FundingRateService } from './FundingRateService';
import { BasisSpreadCalculator } from './BasisSpreadCalculator';
import { FeeCalculator } from '../arbitrage/FeeCalculator';
import { ExchangeAdapter, TickerSnapshot } from '../exchanges/ExchangeAdapter';
import { logger } from '../utils/logger';
import { getExchangeBreaker } from '../cache/RedisCache';

// ──────────────────── Scan Result ───────────────────────────────────────

interface FundingScanResult {
  /** All calculated opportunities from this scan. */
  opportunities: BasisSpreadResult[];
  /** Opportunities with positive net return. */
  activeOpportunities: BasisSpreadResult[];
  /** Number of pairs scanned. */
  pairsScanned: number;
  /** Number of exchanges scanned. */
  exchangesScanned: number;
  /** When this scan completed. */
  completedAt: number;
  /** Duration of the scan in ms. */
  durationMs: number;
}

// ──────────────────── FundingArbitrageEngine ────────────────────────────

/**
 * Central orchestrator for funding-rate / cash-and-carry arbitrage.
 *
 * This is DISTINCT from the spot-to-spot ArbitrageEngine.
 * - Different math: basis + funding accrual, not cross-exchange price diff.
 * - Different risk: funding rates change, basis can widen, position requires
 *   capital on both spot and derivatives books.
 * - Different time horizon: typically hours to days, not seconds.
 *
 * Responsibilities:
 * - Manages FundingRateService (rate fetching, caching, history)
 * - Manages BasisSpreadCalculator (returns estimation)
 * - Fetches spot + perp tickers from adapters
 * - Ranks and filters opportunities
 * - Emits events for downstream consumers
 *
 * IMPORTANT: All outputs are estimates. Funding rates change and basis
 * can move against the position. Do not imply guaranteed returns.
 *
 * Usage:
 * ```ts
 * const engine = new FundingArbitrageEngine(adapters, {
 *   spotSymbols: ['BTC/USDT', 'ETH/USDT'],
 *   exchanges: ['binance', 'bybit', 'okx'],
 *   holdingHorizonHours: 24,
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
export class FundingArbitrageEngine extends EventEmitter {
  // ── Sub-components ─────────────────────────────────────────────────
  private fundingRateService: FundingRateService;
  private basisCalculator: BasisSpreadCalculator;
  private feeCalculator: FeeCalculator;

  // ── State ──────────────────────────────────────────────────────────
  private adapters: Map<string, ExchangeAdapter>;
  private config: Required<FundingEngineConfig>;
  private scanTimer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private lastScanResult: FundingScanResult | null = null;
  private initialized = false;

  constructor(adapters: ExchangeAdapter[], config: FundingEngineConfig = {}) {
    super();

    // Build adapter map
    this.adapters = new Map();
    for (const adapter of adapters) {
      this.adapters.set(adapter.slug, adapter);
    }

    // Merge config with defaults
    this.config = {
      exchanges: adapters.map((a) => a.slug),
      spotSymbols: [],
      tradeSize: 1.0,
      holdingHorizonHours: 24,
      minFundingRate: 0.00005,
      maxDataAgeMs: 30_000,
      scanIntervalMs: 30_000,
      leverage: 1,
      maxHistoryPerPair: 1000,
      ...config,
    };

    // Initialize sub-components
    this.feeCalculator = new FeeCalculator();
    this.fundingRateService = new FundingRateService(adapters, {
      maxHistoryPerPair: this.config.maxHistoryPerPair,
    });
    this.basisCalculator = new BasisSpreadCalculator(this.feeCalculator, this.config.leverage);
  }

  // ──────────────────── Lifecycle ───────────────────────────────────────

  /**
   * Initialize the engine: discover pairs and refresh fees.
   * Must be called before the first scan.
   */
  async initialize(): Promise<void> {
    logger.info('[FundingArbitrageEngine] Initializing...');

    const adapters = this.getActiveAdapters();

    // Refresh fee schedules (reuse from spot arb)
    await this.feeCalculator.refreshFromAdapters(adapters);

    // Discover spot/perp pairs
    const pairs = await this.fundingRateService.discoverPairs(this.config.exchanges);

    this.initialized = true;

    logger.info(
      `[FundingArbitrageEngine] Initialized — ${pairs.length} spot/perp pair(s), ` +
        `${adapters.length} adapter(s), ` +
        `holding horizon: ${this.config.holdingHorizonHours}h`,
    );
  }

  /**
   * Start continuous scanning.
   */
  async start(): Promise<void> {
    if (this.running) {
      logger.warn('[FundingArbitrageEngine] Already running');
      return;
    }

    if (!this.initialized) {
      logger.warn('[FundingArbitrageEngine] Not initialized — calling initialize() first');
      await this.initialize();
    }

    this.running = true;

    // Run first scan immediately
    await this.scan();

    // Schedule periodic scans
    this.scanTimer = setInterval(async () => {
      try {
        await this.scan();
      } catch (error) {
        logger.error('[FundingArbitrageEngine] Scan error:', error);
      }
    }, this.config.scanIntervalMs);

    logger.info(
      `[FundingArbitrageEngine] Started — scanning every ${this.config.scanIntervalMs}ms`,
    );
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
    logger.info('[FundingArbitrageEngine] Stopped');
  }

  // ──────────────────── Single scan ─────────────────────────────────────

  /**
   * Perform a single scan: fetch prices + funding rates, calculate
   * opportunities, rank and return results.
   */
  async scan(): Promise<FundingScanResult> {
    const scanStart = Date.now();

    // Re-discover pairs if needed
    if (this.fundingRateService.needsPairDiscovery()) {
      await this.fundingRateService.discoverPairs(this.config.exchanges);
    }

    // Refresh funding rates if stale
    if (this.fundingRateService.needsRateRefresh()) {
      await this.fundingRateService.refreshRates(this.config.exchanges);
    }

    // Get all pairs to scan
    let pairs = this.fundingRateService.getAllPairs();

    // Filter by configured spot symbols if provided
    if (this.config.spotSymbols.length > 0) {
      const symbolSet = new Set(this.config.spotSymbols);
      pairs = pairs.filter((p) => symbolSet.has(p.spotSymbol));
    }

    // Filter by configured exchanges
    const exchangeSet = new Set(this.config.exchanges);
    pairs = pairs.filter((p) => exchangeSet.has(p.exchange));

    if (pairs.length === 0) {
      const result: FundingScanResult = {
        opportunities: [],
        activeOpportunities: [],
        pairsScanned: 0,
        exchangesScanned: 0,
        completedAt: Date.now(),
        durationMs: Date.now() - scanStart,
      };
      this.lastScanResult = result;
      return result;
    }

    // ── Fetch spot tickers ──
    const spotTickers = await this.fetchTickers(pairs, 'spot');

    // ── Fetch perp tickers ──
    const perpTickers = await this.fetchTickers(pairs, 'perp');

    // ── Build funding rate map ──
    const fundingRates = new Map<string, FundingRateEntry>();
    const allRates = this.fundingRateService.getAllRates();
    for (const rate of allRates) {
      fundingRates.set(`${rate.exchange}:${rate.symbol}`, rate);
    }

    // ── Calculate opportunities ──
    const allOpportunities = this.basisCalculator.calculateAll(
      pairs,
      spotTickers,
      perpTickers,
      fundingRates,
      this.config.tradeSize,
      this.config.holdingHorizonHours,
    );

    // ── Filter: minimum funding rate ──
    const filtered = allOpportunities.filter(
      (opp) => Math.abs(opp.currentFundingRate) >= this.config.minFundingRate,
    );

    // ── Sort by net return descending ──
    filtered.sort((a, b) => b.netReturnPct - a.netReturnPct);

    // ── Active opportunities ──
    const activeOpportunities = filtered.filter(
      (opp) => opp.status === 'active' || opp.status === 'marginal',
    );

    // Count unique exchanges scanned
    const exchangesScanned = new Set(pairs.map((p) => p.exchange)).size;

    const scanResult: FundingScanResult = {
      opportunities: filtered,
      activeOpportunities,
      pairsScanned: pairs.length,
      exchangesScanned,
      completedAt: Date.now(),
      durationMs: Date.now() - scanStart,
    };

    this.lastScanResult = scanResult;

    // ── Emit events ──
    this.emit('scanComplete', scanResult);

    if (activeOpportunities.length > 0) {
      this.emit('opportunities', activeOpportunities);
      logger.info(
        `[FundingArbitrageEngine] Found ${activeOpportunities.length} active opportunity(ies) ` +
          `in ${scanResult.durationMs}ms`,
      );
    }

    // Log summary
    const statusCounts = new Map<FundingOpportunityStatus, number>();
    for (const opp of filtered) {
      statusCounts.set(opp.status, (statusCounts.get(opp.status) ?? 0) + 1);
    }

    const parts: string[] = [];
    for (const [status, count] of statusCounts.entries()) {
      parts.push(`${count} ${status}`);
    }

    if (filtered.length > 0) {
      const bestReturn = filtered[0].netReturnPct;
      logger.info(
        `[FundingArbitrageEngine] Summary: ${parts.join(', ')}, ` +
          `best return: ${(bestReturn * 100).toFixed(4)}%`,
      );
    }

    return scanResult;
  }

  // ──────────────────── Ticker Fetching ─────────────────────────────────

  /**
   * Fetch tickers for all pairs (spot or perp side).
   */
  private async fetchTickers(
    pairs: SpotPerpPair[],
    side: 'spot' | 'perp',
  ): Promise<Map<string, TickerSnapshot>> {
    const tickers = new Map<string, TickerSnapshot>();
    const fetchPromises: Promise<void>[] = [];

    for (const pair of pairs) {
      const adapter = this.adapters.get(pair.exchange);
      if (!adapter) continue;

      const breaker = getExchangeBreaker(pair.exchange);
      if (!breaker.allowRequest()) {
        logger.debug(`[FundingArbitrageEngine] Circuit open for ${pair.exchange} — skipping`);
        continue;
      }

      const symbol = side === 'spot' ? pair.spotSymbol : pair.perpSymbol;
      const key = `${pair.exchange}:${symbol}`;

      fetchPromises.push(
        adapter
          .fetchTicker(symbol)
          .then((ticker) => {
            breaker.recordSuccess();
            tickers.set(key, ticker);
          })
          .catch((error) => {
            breaker.recordFailure();
            logger.debug(
              `[FundingArbitrageEngine] Failed to fetch ${side} ticker ` +
                `${symbol} from ${pair.exchange}: ${error.message}`,
            );
          }),
      );
    }

    await Promise.allSettled(fetchPromises);
    return tickers;
  }

  // ──────────────────── Public Accessors ────────────────────────────────

  /**
   * Get the last scan result.
   */
  getLastScanResult(): FundingScanResult | null {
    return this.lastScanResult;
  }

  /**
   * Get the funding rate service (for inspection).
   */
  getFundingRateService(): FundingRateService {
    return this.fundingRateService;
  }

  /**
   * Get the basis calculator (for inspection).
   */
  getBasisCalculator(): BasisSpreadCalculator {
    return this.basisCalculator;
  }

  /**
   * Get the fee calculator (for inspection).
   */
  getFeeCalculator(): FeeCalculator {
    return this.feeCalculator;
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
  updateConfig(config: Partial<FundingEngineConfig>): void {
    Object.assign(this.config, config);

    // Restart timer if interval changed
    if (config.scanIntervalMs !== undefined && this.running) {
      if (this.scanTimer) clearInterval(this.scanTimer);
      this.scanTimer = setInterval(async () => {
        try {
          await this.scan();
        } catch (error) {
          logger.error('[FundingArbitrageEngine] Scan error:', error);
        }
      }, this.config.scanIntervalMs);
    }

    logger.info('[FundingArbitrageEngine] Config updated');
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
