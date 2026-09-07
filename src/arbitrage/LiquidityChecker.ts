import { ArbitrageLiquidityCheck, ArbitrageSlippageEstimate } from './types';
import { NormalizedBookWithMetrics, DepthLevel } from '../marketdata/orderbook/OrderBookNormalizer';
import { logger } from '../utils/logger';

// ──────────────────── CrossExchangeLiquidityChecker ──────────────────────

/**
 * Validates that BOTH sides of an arbitrage trade have sufficient
 * order-book depth to execute at the claimed prices.
 *
 * This is distinct from the single-book LiquidityChecker in
 * marketdata/orderbook — it checks both the buy side (asks on
 * the buy exchange) and the sell side (bids on the sell exchange)
 * and reports combined slippage impact on profitability.
 */
export class CrossExchangeLiquidityChecker {
  private readonly defaultMaxSlippage: number;

  constructor(defaultMaxSlippage = 0.01) {
    this.defaultMaxSlippage = defaultMaxSlippage;
  }

  /**
   * Check liquidity on both exchanges for the given trade size.
   *
   * @param buyBook - Order book on the buy exchange (we consume asks).
   * @param sellBook - Order book on the sell exchange (we consume bids).
   * @param tradeSizeBase - Trade size in base currency.
   * @param maxSlippage - Maximum acceptable slippage fraction.
   * @returns Combined liquidity check result.
   */
  check(
    buyBook: NormalizedBookWithMetrics | null,
    sellBook: NormalizedBookWithMetrics | null,
    tradeSizeBase: number,
    maxSlippage = this.defaultMaxSlippage,
  ): ArbitrageLiquidityCheck {
    // ── Validate inputs ──
    if (tradeSizeBase <= 0) {
      return this.fail('Trade size must be positive');
    }

    if (!buyBook) {
      return this.fail('Buy exchange order book is empty or unavailable');
    }

    if (!sellBook) {
      return this.fail('Sell exchange order book is empty or unavailable');
    }

    // ── Check buy side (consume asks) ──
    const buyResult = this.checkSide(buyBook, tradeSizeBase, 'buy', maxSlippage);
    if (!buyResult.executable) {
      return {
        executable: false,
        buyDepth: buyResult.totalDepth,
        sellDepth: 0,
        buyFillRatio: buyResult.fillRatio,
        sellFillRatio: 0,
        buyWorstPrice: buyResult.worstPrice,
        sellWorstPrice: 0,
        reason: `Buy side: ${buyResult.reason}`,
      };
    }

    // ── Check sell side (consume bids) ──
    const sellResult = this.checkSide(sellBook, tradeSizeBase, 'sell', maxSlippage);
    if (!sellResult.executable) {
      return {
        executable: false,
        buyDepth: buyResult.totalDepth,
        sellDepth: sellResult.totalDepth,
        buyFillRatio: buyResult.fillRatio,
        sellFillRatio: sellResult.fillRatio,
        buyWorstPrice: buyResult.worstPrice,
        sellWorstPrice: sellResult.worstPrice,
        reason: `Sell side: ${sellResult.reason}`,
      };
    }

    // ── Cross-validate: sell-side depth must cover buy-side cost ──
    // The proceeds from selling must be at least enough to cover the buy.
    // This is a sanity check — not a hard requirement for the scanner.
    const buyCost = buyResult.averageFillPrice * tradeSizeBase;
    const sellProceeds = sellResult.averageFillPrice * tradeSizeBase;

    if (sellProceeds < buyCost * 0.99) {
      return {
        executable: false,
        buyDepth: buyResult.totalDepth,
        sellDepth: sellResult.totalDepth,
        buyFillRatio: buyResult.fillRatio,
        sellFillRatio: sellResult.fillRatio,
        buyWorstPrice: buyResult.worstPrice,
        sellWorstPrice: sellResult.worstPrice,
        reason: `Sell proceeds (${sellProceeds.toFixed(2)}) < buy cost (${buyCost.toFixed(2)})`,
      };
    }

    return {
      executable: true,
      buyDepth: buyResult.totalDepth,
      sellDepth: sellResult.totalDepth,
      buyFillRatio: buyResult.fillRatio,
      sellFillRatio: sellResult.fillRatio,
      buyWorstPrice: buyResult.worstPrice,
      sellWorstPrice: sellResult.worstPrice,
    };
  }

  /**
   * Estimate slippage on both sides of the trade.
   */
  estimateSlippage(
    buyBook: NormalizedBookWithMetrics | null,
    sellBook: NormalizedBookWithMetrics | null,
    tradeSizeBase: number,
  ): ArbitrageSlippageEstimate {
    const empty: ArbitrageSlippageEstimate = {
      buySlippage: 0,
      sellSlippage: 0,
      totalSlippage: 0,
      buyVwap: 0,
      sellVwap: 0,
      buyBestPrice: 0,
      sellBestPrice: 0,
      buyLevelsConsumed: 0,
      sellLevelsConsumed: 0,
      buyFillRatio: 0,
      sellFillRatio: 0,
    };

    if (tradeSizeBase <= 0 || !buyBook || !sellBook) return empty;

    const buyEstimate = this.walkBook(buyBook, tradeSizeBase, 'buy');
    const sellEstimate = this.walkBook(sellBook, tradeSizeBase, 'sell');

    const buySlippage =
      buyEstimate.bestPrice > 0
        ? Math.abs(buyEstimate.vwap - buyEstimate.bestPrice) / buyEstimate.bestPrice
        : 0;

    const sellSlippage =
      sellEstimate.bestPrice > 0
        ? Math.abs(sellEstimate.bestPrice - sellEstimate.vwap) / sellEstimate.bestPrice
        : 0;

    return {
      buySlippage,
      sellSlippage,
      totalSlippage: buySlippage + sellSlippage,
      buyVwap: buyEstimate.vwap,
      sellVwap: sellEstimate.vwap,
      buyBestPrice: buyEstimate.bestPrice,
      sellBestPrice: sellEstimate.bestPrice,
      buyLevelsConsumed: buyEstimate.levelsConsumed,
      sellLevelsConsumed: sellEstimate.levelsConsumed,
      buyFillRatio: buyEstimate.fillRatio,
      sellFillRatio: sellEstimate.fillRatio,
    };
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /**
   * Check a single side of the book for sufficient depth and slippage.
   */
  private checkSide(
    book: NormalizedBookWithMetrics,
    size: number,
    side: 'buy' | 'sell',
    maxSlippage: number,
  ): {
    executable: boolean;
    fillRatio: number;
    averageFillPrice: number;
    worstPrice: number;
    totalDepth: number;
    reason?: string;
  } {
    const levels = side === 'buy' ? book.askDepth : book.bidDepth;

    if (levels.length === 0) {
      return {
        executable: false,
        fillRatio: 0,
        averageFillPrice: 0,
        worstPrice: 0,
        totalDepth: 0,
        reason: `No ${side === 'buy' ? 'ask' : 'bid'} liquidity`,
      };
    }

    const totalDepth = levels[levels.length - 1].cumulative;

    if (totalDepth < size) {
      return {
        executable: false,
        fillRatio: totalDepth / size,
        averageFillPrice: 0,
        worstPrice: levels[levels.length - 1].price,
        totalDepth,
        reason: `Insufficient depth: ${totalDepth.toFixed(4)} available, ${size.toFixed(4)} needed`,
      };
    }

    // Walk the book
    let remaining = size;
    let totalCost = 0;
    let filledBase = 0;
    let worstPrice = 0;

    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(level.quantity, remaining);
      totalCost += fillQty * level.price;
      filledBase += fillQty;
      remaining -= fillQty;
      worstPrice = level.price;
    }

    const averageFillPrice = filledBase > 0 ? totalCost / filledBase : 0;
    const bestPrice = levels[0].price;
    const slippage = bestPrice > 0 ? Math.abs(averageFillPrice - bestPrice) / bestPrice : 0;

    if (slippage > maxSlippage) {
      return {
        executable: false,
        fillRatio: filledBase / size,
        averageFillPrice,
        worstPrice,
        totalDepth,
        reason: `Slippage ${(slippage * 100).toFixed(2)}% exceeds max ${(maxSlippage * 100).toFixed(2)}%`,
      };
    }

    return {
      executable: true,
      fillRatio: filledBase / size,
      averageFillPrice,
      worstPrice,
      totalDepth,
    };
  }

  /**
   * Walk the book to compute VWAP, fill ratio, and level consumption.
   */
  private walkBook(
    book: NormalizedBookWithMetrics,
    size: number,
    side: 'buy' | 'sell',
  ): {
    bestPrice: number;
    vwap: number;
    worstPrice: number;
    levelsConsumed: number;
    fillRatio: number;
  } {
    const levels = side === 'buy' ? book.askDepth : book.bidDepth;

    if (levels.length === 0 || size <= 0) {
      return { bestPrice: 0, vwap: 0, worstPrice: 0, levelsConsumed: 0, fillRatio: 0 };
    }

    const bestPrice = levels[0].price;
    let remaining = size;
    let totalCost = 0;
    let filledBase = 0;
    let worstPrice = bestPrice;
    let levelsConsumed = 0;

    for (const level of levels) {
      if (remaining <= 0) break;
      const fillQty = Math.min(level.quantity, remaining);
      totalCost += fillQty * level.price;
      filledBase += fillQty;
      remaining -= fillQty;
      worstPrice = level.price;
      levelsConsumed++;
    }

    return {
      bestPrice,
      vwap: filledBase > 0 ? totalCost / filledBase : 0,
      worstPrice,
      levelsConsumed,
      fillRatio: filledBase / size,
    };
  }

  private fail(reason: string): ArbitrageLiquidityCheck {
    return {
      executable: false,
      buyDepth: 0,
      sellDepth: 0,
      buyFillRatio: 0,
      sellFillRatio: 0,
      buyWorstPrice: 0,
      sellWorstPrice: 0,
      reason,
    };
  }
}
