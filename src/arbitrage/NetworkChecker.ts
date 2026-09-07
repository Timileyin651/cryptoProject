import { NetworkCosts, ExchangeNetworkInfo } from './types';
import { ExchangeAdapter } from '../exchanges/ExchangeAdapter';
import { getExchangeBreaker } from '../cache/CircuitBreaker';
import { logger } from '../utils/logger';

// ──────────────────── Known network confirmation times (seconds) ────────

/**
 * Approximate confirmation times for popular networks.
 * Used as fallback when adapters don't provide confirmation block data.
 * Values are rough estimates in seconds.
 */
const NETWORK_CONFIRMATION_TIMES: Record<string, number> = {
  // Layer 1
  btc: 600, // ~10 min, 1 block
  ethereum: 192, // ~12s * 16 confirmations
  tron: 60, // ~1 min
  solana: 30, // ~400ms * ~75 confirmations
  dogecoin: 600, // ~10 min
  litecoin: 600, // ~10 min
  xrp: 10, // ~3-5 seconds
  xlm: 10, // ~3-5 seconds

  // Layer 2 / sidechains
  arbitrum: 360, // ~12s * 30 confirmations
  optimism: 360, // ~12s * 30 confirmations
  polygon: 120, // ~2s * ~64 confirmations
  bsc: 60, // ~3s * ~20 confirmations
  avalanche: 60, // ~2s * ~30 confirmations
  base: 360, // ~12s * 30 confirmations

  // Exchange internal
  erc20: 192,
  trc20: 60,
  bep20: 60,
  spl: 30,
  mainnet: 600,
  native: 600,
};

// ──────────────────── NetworkChecker ─────────────────────────────────────

/**
 * Checks whether a cross-exchange transfer is feasible and estimates
 * the associated network costs.
 *
 * For same-exchange opportunities (same buy/sell exchange), no transfer
 * is needed so costs are zero. For cross-exchange, the scanner must
 * withdraw from the buy exchange and deposit on the sell exchange.
 */
export class NetworkChecker {
  /** Coin network info cache, keyed by "exchange:coin". */
  private networkInfoCache = new Map<string, ExchangeNetworkInfo[]>();
  private cacheExpiryMs: number;
  private lastRefreshAt = 0;

  constructor(cacheExpiryMs = 300_000) {
    // 5 min default
    this.cacheExpiryMs = cacheExpiryMs;
  }

  // ──────────────────── Public API ──────────────────────────────────────

  /**
   * Refresh network/coin info from all adapters.
   */
  async refreshFromAdapters(adapters: ExchangeAdapter[]): Promise<void> {
    for (const adapter of adapters) {
      const breaker = getExchangeBreaker(adapter.slug, 'NetworkChecker');
      if (!breaker.allowRequest()) {
        logger.debug(`[NetworkChecker] Circuit open for ${adapter.slug} — skipping`);
        continue;
      }
      try {
        const statuses = await adapter.fetchCoinNetworkStatus();
        breaker.recordSuccess();
        const byCoin = new Map<string, ExchangeNetworkInfo[]>();

        for (const status of statuses) {
          const info: ExchangeNetworkInfo = {
            coin: status.coin,
            network: status.network,
            depositEnabled: status.depositEnabled,
            withdrawalEnabled: status.withdrawalEnabled,
            withdrawalFee: parseFloat(status.withdrawalFee) || 0,
            minWithdrawal: status.minWithdrawal ? parseFloat(status.minWithdrawal) : null,
            maxWithdrawal: status.maxWithdrawal ? parseFloat(status.maxWithdrawal) : null,
            confirmationBlocks: status.confirmationBlocks,
          };

          const coinKey = status.coin.toUpperCase();
          const existing = byCoin.get(coinKey) || [];
          existing.push(info);
          byCoin.set(coinKey, existing);
        }

        // Store under exchange-level key
        for (const [coin, infos] of byCoin.entries()) {
          const cacheKey = `${adapter.slug}:${coin}`;
          this.networkInfoCache.set(cacheKey, infos);
        }
      } catch (error) {
        breaker.recordFailure();
        logger.warn(`[NetworkChecker] Failed to fetch network info from ${adapter.slug}:`, error);
      }
    }

    this.lastRefreshAt = Date.now();
    logger.info(
      `[NetworkChecker] Refreshed network info: ${this.networkInfoCache.size} coin entries`,
    );
  }

  /**
   * Check whether a transfer from `fromExchange` to `toExchange`
   * is feasible for the given base currency.
   *
   * @returns NetworkCosts with all transfer details.
   */
  checkTransfer(
    baseCurrency: string,
    fromExchange: string,
    toExchange: string,
    tradeSizeBase: number,
  ): NetworkCosts {
    // Same exchange — no transfer needed
    if (fromExchange === toExchange) {
      return {
        withdrawalCost: 0,
        withdrawalFee: 0,
        networkFee: 0,
        confirmationTimeSec: 0,
        withdrawalAvailable: true,
        depositAvailable: true,
        network: null,
        sameExchange: true,
      };
    }

    const coin = baseCurrency.toUpperCase();

    // ── Withdrawal availability ──
    const withdrawalInfo = this.findBestNetwork(fromExchange, coin, 'withdrawal');
    const depositInfo = this.findBestNetwork(toExchange, coin, 'deposit');

    const withdrawalAvailable = withdrawalInfo !== null;
    const depositAvailable = depositInfo !== null;

    if (!withdrawalAvailable) {
      return {
        withdrawalCost: 0,
        withdrawalFee: 0,
        networkFee: 0,
        confirmationTimeSec: null,
        withdrawalAvailable: false,
        depositAvailable,
        network: null,
        sameExchange: false,
      };
    }

    if (!depositAvailable) {
      return {
        withdrawalCost: 0,
        withdrawalFee: 0,
        networkFee: 0,
        confirmationTimeSec: null,
        withdrawalAvailable: true,
        depositAvailable: false,
        network: withdrawalInfo!.network,
        sameExchange: false,
      };
    }

    // ── Calculate costs ──
    const withdrawalFee = withdrawalInfo!.withdrawalFee;
    const network = withdrawalInfo!.network;

    // Check minimum/maximum withdrawal constraints
    const minWithdrawal = withdrawalInfo!.minWithdrawal;
    if (minWithdrawal !== null && tradeSizeBase < minWithdrawal) {
      return {
        withdrawalCost: 0,
        withdrawalFee: 0,
        networkFee: 0,
        confirmationTimeSec: null,
        withdrawalAvailable: false,
        depositAvailable: true,
        network,
        sameExchange: false,
      };
    }

    // Estimate confirmation time
    const confirmationTimeSec = this.estimateConfirmationTime(
      network,
      withdrawalInfo!.confirmationBlocks,
    );

    return {
      withdrawalCost: withdrawalFee,
      withdrawalFee,
      networkFee: 0, // Already included in withdrawal fee for most exchanges
      confirmationTimeSec,
      withdrawalAvailable: true,
      depositAvailable: true,
      network,
      sameExchange: false,
    };
  }

  /**
   * Convert withdrawal fee (in base currency) to quote currency cost.
   */
  withdrawalFeeInQuote(withdrawalFeeBase: number, currentPrice: number): number {
    return withdrawalFeeBase * currentPrice;
  }

  /**
   * Check if the cache needs refreshing.
   */
  needsRefresh(): boolean {
    return Date.now() - this.lastRefreshAt > this.cacheExpiryMs;
  }

  /**
   * Get cached network info for a specific exchange and coin.
   */
  getNetworkInfo(exchange: string, coin: string): ExchangeNetworkInfo[] {
    return this.networkInfoCache.get(`${exchange}:${coin.toUpperCase()}`) || [];
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /**
   * Find the best network for a given operation (withdrawal or deposit).
   * Prefers the cheapest network that supports the operation.
   */
  private findBestNetwork(
    exchange: string,
    coin: string,
    operation: 'withdrawal' | 'deposit',
  ): ExchangeNetworkInfo | null {
    const infos = this.networkInfoCache.get(`${exchange}:${coin}`);
    if (!infos || infos.length === 0) return null;

    // Filter to networks supporting the operation
    const supported = infos.filter((info) =>
      operation === 'withdrawal' ? info.withdrawalEnabled : info.depositEnabled,
    );

    if (supported.length === 0) return null;

    // Sort by fee (cheapest first), with null network last
    supported.sort((a, b) => {
      if (a.withdrawalFee !== b.withdrawalFee) return a.withdrawalFee - b.withdrawalFee;
      return (a.network ? 0 : 1) - (b.network ? 0 : 1);
    });

    return supported[0];
  }

  /**
   * Estimate total confirmation time in seconds.
   */
  private estimateConfirmationTime(
    network: string | null,
    confirmationBlocks: number | null,
  ): number | null {
    if (!network) return null;

    const normalizedNetwork = network.toLowerCase();
    const blockTime = NETWORK_CONFIRMATION_TIMES[normalizedNetwork];

    if (blockTime === undefined) {
      // Unknown network — use a conservative estimate
      logger.debug(`[NetworkChecker] Unknown network '${network}' — using 600s estimate`);
      return 600;
    }

    if (confirmationBlocks && confirmationBlocks > 1) {
      return blockTime * confirmationBlocks;
    }

    return blockTime;
  }
}
