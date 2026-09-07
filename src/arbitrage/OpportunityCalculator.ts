import crypto from 'crypto';
import {
  ArbitrageOpportunity,
  ComparablePair,
  ArbitrageSlippageEstimate,
  ArbitrageLiquidityCheck,
  NetworkCosts,
  OpportunityStatus,
} from './types';
import { NormalizedBookWithMetrics } from '../marketdata/orderbook/OrderBookNormalizer';
import { FeeCalculator } from './FeeCalculator';
import { NetworkChecker } from './NetworkChecker';
import { CrossExchangeLiquidityChecker } from './LiquidityChecker';
import { logger } from '../utils/logger';

/** Fast ID generation — 12 random bytes as hex (much faster than UUID v4). */
function fastId(): string {
  return crypto.randomBytes(12).toString('hex');
}

// ──────────────────── OpportunityCalculator ──────────────────────────────

/**
 * Calculates arbitrage opportunities from order-book data.
 *
 * For each comparable pair of exchange books:
 * 1. Finds cheapest executable buy (best ask on buy exchange).
 * 2. Finds highest executable sell (best bid on sell exchange).
 * 3. Calculates gross spread.
 * 4. Calculates buy-side trading fee.
 * 5. Calculates sell-side trading fee.
 * 6. Calculates withdrawal/network costs.
 * 7. Estimates slippage from order-book depth.
 * 8. Calculates net profit.
 * 9. Calculates ROI.
 * 10. Checks liquidity on both sides.
 * 11. Checks deposit/withdrawal availability.
 * 12. Timestamps the calculation.
 * 13. Assigns opportunity status.
 *
 * Uses order-book prices (best bid/ask), NOT last-traded price.
 */
export class OpportunityCalculator {
  private feeCalculator: FeeCalculator;
  private networkChecker: NetworkChecker;
  private liquidityChecker: CrossExchangeLiquidityChecker;

  constructor(
    feeCalculator: FeeCalculator,
    networkChecker: NetworkChecker,
    liquidityChecker?: CrossExchangeLiquidityChecker,
  ) {
    this.feeCalculator = feeCalculator;
    this.networkChecker = networkChecker;
    this.liquidityChecker = liquidityChecker || new CrossExchangeLiquidityChecker();
  }

  /**
   * Calculate an arbitrage opportunity for a single comparable pair.
   *
   * @param pair - Two exchange order books for the same symbol.
   * @param tradeSizeBase - Trade size in base currency.
   * @param maxSlippage - Maximum acceptable slippage fraction.
   * @returns Full ArbitrageOpportunity with all 13 fields populated.
   */
  calculate(pair: ComparablePair, tradeSizeBase: number, maxSlippage = 0.01): ArbitrageOpportunity {
    const now = Date.now();
    const { symbol, buyExchange, buyBook, sellExchange, sellBook } = pair;

    // Parse symbol into base/quote
    const [baseCurrency, quoteCurrency] = symbol.split('/');

    // ── 1. Cheapest executable buy (best ask on buy exchange) ───────────
    const buyPrice = buyBook.metrics.bestAsk;

    // ── 2. Highest executable sell (best bid on sell exchange) ──────────
    const sellPrice = sellBook.metrics.bestBid;

    // ── 3. Gross spread ────────────────────────────────────────────────
    const grossSpread = sellPrice - buyPrice;
    const grossSpreadPct = buyPrice > 0 ? grossSpread / buyPrice : 0;

    // ── 4 & 5. Trading fees ────────────────────────────────────────────
    const buyQuoteCost = buyPrice * tradeSizeBase;
    const sellQuoteRevenue = sellPrice * tradeSizeBase;
    const fees = this.feeCalculator.calculateArbitrageFees(
      buyExchange,
      sellExchange,
      symbol,
      buyQuoteCost,
      sellQuoteRevenue,
    );

    // ── 6. Network / withdrawal costs ──────────────────────────────────
    const networkCosts = this.networkChecker.checkTransfer(
      baseCurrency,
      buyExchange,
      sellExchange,
      tradeSizeBase,
    );

    // Convert withdrawal fee to quote currency
    const networkCostQuote = networkCosts.sameExchange
      ? 0
      : this.networkChecker.withdrawalFeeInQuote(networkCosts.withdrawalFee, buyPrice);

    // ── 7. Slippage estimate ───────────────────────────────────────────
    const slippage = this.liquidityChecker.estimateSlippage(buyBook, sellBook, tradeSizeBase);

    // Slippage cost in quote currency:
    // - Buying at higher VWAP costs more
    // - Selling at lower VWAP earns less
    const slippageCostBuy = slippage.buySlippage * buyPrice * tradeSizeBase;
    const slippageCostSell = slippage.sellSlippage * sellPrice * tradeSizeBase;
    const slippageCostTotal = slippageCostBuy + slippageCostSell;

    // ── 10. Liquidity check ────────────────────────────────────────────
    const liquidity = this.liquidityChecker.check(buyBook, sellBook, tradeSizeBase, maxSlippage);

    // ── 11. Deposit/withdrawal availability ─────────────────────────────
    // Already incorporated in networkCosts above

    // ── 8. Net profit ──────────────────────────────────────────────────
    const totalCost = fees.totalFees + networkCostQuote + slippageCostTotal;
    const netProfit = grossSpread * tradeSizeBase - totalCost;

    // ── 9. ROI ─────────────────────────────────────────────────────────
    const capitalRequired = buyQuoteCost + fees.buyFee + networkCostQuote;
    const roi = capitalRequired > 0 ? netProfit / capitalRequired : 0;

    // ── 12. Timestamp ──────────────────────────────────────────────────
    const bookAgeMs = Math.max(pair.buyBookAgeMs, pair.sellBookAgeMs);

    // ── 13. Status ─────────────────────────────────────────────────────
    const { status, statusReason } = this.determineStatus(
      netProfit,
      roi,
      liquidity,
      networkCosts,
      grossSpreadPct,
      slippage,
      bookAgeMs,
    );

    const id = fastId();

    return {
      id,
      symbol,
      baseCurrency,
      quoteCurrency,
      arbitrageType: 'direct',
      direction: { buyExchange, sellExchange },

      buyPrice,
      sellPrice,
      grossSpread,
      grossSpreadPct,

      buyFee: fees.buyFee,
      sellFee: fees.sellFee,
      totalTradingFees: fees.totalFees,

      networkCosts: {
        ...networkCosts,
        withdrawalCost: networkCostQuote,
      },

      slippage,

      liquidity,

      totalCost,
      netProfit,
      roi,

      tradeSizeBase,
      capitalRequired,

      calculatedAt: now,
      bookAgeMs,
      status,
      statusReason,
    };
  }

  /**
   * Calculate opportunities for multiple comparable pairs.
   * Returns all calculated opportunities (including unprofitable ones
   * for analysis purposes — filtering is done by OpportunityRanker).
   */
  calculateAll(
    pairs: ComparablePair[],
    tradeSizeBase: number,
    maxSlippage = 0.01,
  ): ArbitrageOpportunity[] {
    const results: ArbitrageOpportunity[] = [];

    for (const pair of pairs) {
      try {
        // Early termination: skip full calculation for spreads
        // too small to be profitable after fees (saves ~60% of compute)
        const grossSpreadPct =
          pair.buyBook.metrics.bestAsk > 0
            ? (pair.sellBook.metrics.bestBid - pair.buyBook.metrics.bestAsk) /
              pair.buyBook.metrics.bestAsk
            : 0;

        // Typical taker fees total ~0.2%, so any spread below 0.05%
        // is almost certainly unprofitable — emit a lightweight result
        if (grossSpreadPct < 0.0005) {
          const baseCurrency = pair.symbol.split('/')[0];
          const quoteCurrency = pair.symbol.split('/')[1];
          results.push({
            id: fastId(),
            symbol: pair.symbol,
            baseCurrency,
            quoteCurrency,
            arbitrageType: 'direct',
            direction: { buyExchange: pair.buyExchange, sellExchange: pair.sellExchange },
            buyPrice: pair.buyBook.metrics.bestAsk,
            sellPrice: pair.sellBook.metrics.bestBid,
            grossSpread: pair.sellBook.metrics.bestBid - pair.buyBook.metrics.bestAsk,
            grossSpreadPct,
            buyFee: 0,
            sellFee: 0,
            totalTradingFees: 0,
            networkCosts: {
              withdrawalCost: 0, withdrawalFee: 0, networkFee: 0,
              confirmationTimeSec: null, withdrawalAvailable: true,
              depositAvailable: true, network: null, sameExchange: false,
            },
            slippage: {
              buySlippage: 0, sellSlippage: 0, totalSlippage: 0,
              buyVwap: 0, sellVwap: 0, buyBestPrice: 0, sellBestPrice: 0,
              buyLevelsConsumed: 0, sellLevelsConsumed: 0,
              buyFillRatio: 0, sellFillRatio: 0,
            },
            liquidity: {
              executable: false, buyDepth: 0, sellDepth: 0,
              buyFillRatio: 0, sellFillRatio: 0,
              buyWorstPrice: 0, sellWorstPrice: 0,
              reason: 'Spread too small for profitability',
            },
            totalCost: 0,
            netProfit: 0,
            roi: 0,
            tradeSizeBase,
            capitalRequired: 0,
            calculatedAt: Date.now(),
            bookAgeMs: Math.max(pair.buyBookAgeMs, pair.sellBookAgeMs),
            status: 'unprofitable' as OpportunityStatus,
            statusReason: `Gross spread ${(grossSpreadPct * 100).toFixed(4)}% below fee threshold`,
          });
          continue;
        }

        const opp = this.calculate(pair, tradeSizeBase, maxSlippage);
        results.push(opp);
      } catch (error) {
        logger.error(
          `[OpportunityCalculator] Error calculating ${pair.symbol} ` +
            `${pair.buyExchange}→${pair.sellExchange}:`,
          error,
        );
      }
    }

    return results;
  }

  /**
   * Quick pre-filter: does this pair have a positive gross spread
   * worth investigating further?
   */
  hasPositiveSpread(
    buyBook: NormalizedBookWithMetrics,
    sellBook: NormalizedBookWithMetrics,
    minSpreadPct = 0.0001, // 0.01%
  ): boolean {
    const buyAsk = buyBook.metrics.bestAsk;
    const sellBid = sellBook.metrics.bestBid;

    if (buyAsk <= 0 || sellBid <= 0) return false;

    const spreadPct = (sellBid - buyAsk) / buyAsk;
    return spreadPct > minSpreadPct;
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /**
   * Determine the opportunity status based on all calculated metrics.
   */
  private determineStatus(
    netProfit: number,
    roi: number,
    liquidity: ArbitrageLiquidityCheck,
    networkCosts: NetworkCosts,
    grossSpreadPct: number,
    slippage: ArbitrageSlippageEstimate,
    bookAgeMs: number,
  ): { status: OpportunityStatus; statusReason?: string } {
    // ── Check data freshness first ──

    // Expired data
    if (bookAgeMs > 30_000) {
      return {
        status: 'expired',
        statusReason: `Order book data is ${(bookAgeMs / 1000).toFixed(0)}s old`,
      };
    }

    // ── Check profitability next — fundamental economic signal ──

    if (netProfit <= 0) {
      return {
        status: 'unprofitable',
        statusReason: `Net profit ${netProfit.toFixed(4)} is negative`,
      };
    }

    // ── Then check execution feasibility ──

    // Illiquid: not enough depth — check BEFORE network because
    // illiquid trades can't execute regardless of transfer feasibility.
    if (!liquidity.executable) {
      return {
        status: 'illiquid',
        statusReason: liquidity.reason || 'Insufficient order-book liquidity',
      };
    }

    // Blocked: deposit or withdrawal unavailable
    if (!networkCosts.sameExchange) {
      if (!networkCosts.withdrawalAvailable) {
        return { status: 'blocked', statusReason: 'Withdrawal unavailable on buy exchange' };
      }
      if (!networkCosts.depositAvailable) {
        return { status: 'blocked', statusReason: 'Deposit unavailable on sell exchange' };
      }
    }

    // Marginal: positive but very thin margin
    if (roi < 0.0005) {
      return {
        status: 'marginal',
        statusReason: `ROI ${(roi * 100).toFixed(4)}% is marginal`,
      };
    }

    // Active: profitable and executable
    return {
      status: 'active',
      statusReason: `Net profit ${netProfit.toFixed(4)}, ROI ${(roi * 100).toFixed(4)}%`,
    };
  }
}
