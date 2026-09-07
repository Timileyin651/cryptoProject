import { DepthLevel, NormalizedBookWithMetrics } from './OrderBookNormalizer';

// ──────────────────────────── Types ─────────────────────────────────────

export interface SlippageEstimate {
  /** Requested trade size in base currency. */
  requestedSize: number;
  /** Side of the trade. */
  side: 'buy' | 'sell';
  /** Best available price at the top of the book. */
  bestPrice: number;
  /**
   * Volume-weighted average price across all consumed levels.
   * This is the effective execution price.
   */
  averagePrice: number;
  /** Price of the worst (last) level consumed. */
  worstPrice: number;
  /** Slippage in absolute price terms (averagePrice - bestPrice for buys, reversed for sells). */
  slippageAbsolute: number;
  /** Slippage as a fraction of the best price (0..1+). */
  slippagePercent: number;
  /** Number of book levels consumed. */
  levelsConsumed: number;
  /** Total quote currency cost for the fill. */
  totalCost: number;
  /** How much of the requested size was filled (may be less if book is too thin). */
  filledBase: number;
  /** Fraction of requested size actually filled (0..1). */
  fillRatio: number;
  /**
   * Detailed breakdown of each level consumed.
   * Useful for debugging and visualization.
   */
  levelBreakdown: SlippageLevelDetail[];
}

export interface SlippageLevelDetail {
  /** Price of this level. */
  price: number;
  /** Quantity consumed from this level. */
  consumed: number;
  /** Cumulative base quantity up to and including this level. */
  cumulativeBase: number;
  /** Cumulative quote cost up to and including this level. */
  cumulativeCost: number;
  /** Running VWAP at this point. */
  vwapAtLevel: number;
}

// ──────────────────────────── SlippageCalculator ────────────────────────

/**
 * Estimates slippage for a given trade size by simulating a walk
 * through order-book depth levels.
 *
 * For a BUY order, it consumes ask levels from best ask downward.
 * For a SELL order, it consumes bid levels from best bid downward.
 */
export class SlippageCalculator {
  /**
   * Estimate slippage for the given trade parameters.
   */
  estimate(
    book: NormalizedBookWithMetrics | null,
    size: number,
    side: 'buy' | 'sell',
  ): SlippageEstimate {
    if (size <= 0 || !book) {
      return this.emptyEstimate(size, side);
    }

    const levels = side === 'buy' ? book.askDepth : book.bidDepth;

    if (levels.length === 0) {
      return this.emptyEstimate(size, side);
    }

    const bestPrice = levels[0].price;
    let remaining = size;
    let totalCost = 0;
    let filledBase = 0;
    let levelsConsumed = 0;
    let worstPrice = bestPrice;
    const levelBreakdown: SlippageLevelDetail[] = [];
    let cumulativeBase = 0;
    let cumulativeCost = 0;

    for (const level of levels) {
      if (remaining <= 0) break;

      const consumed = Math.min(level.quantity, remaining);
      const levelCost = consumed * level.price;

      cumulativeBase += consumed;
      cumulativeCost += levelCost;

      levelBreakdown.push({
        price: level.price,
        consumed,
        cumulativeBase,
        cumulativeCost,
        vwapAtLevel: cumulativeBase > 0 ? cumulativeCost / cumulativeBase : 0,
      });

      totalCost += levelCost;
      filledBase += consumed;
      remaining -= consumed;
      worstPrice = level.price;
      levelsConsumed++;
    }

    const averagePrice = filledBase > 0 ? totalCost / filledBase : 0;
    const slippageAbsolute = side === 'buy' ? averagePrice - bestPrice : bestPrice - averagePrice;
    const slippagePercent = bestPrice > 0 ? Math.abs(slippageAbsolute) / bestPrice : 0;

    return {
      requestedSize: size,
      side,
      bestPrice,
      averagePrice,
      worstPrice,
      slippageAbsolute,
      slippagePercent,
      levelsConsumed,
      totalCost,
      filledBase,
      fillRatio: filledBase / size,
      levelBreakdown,
    };
  }

  /**
   * Compare slippage between a theoretical spread and what's actually
   * executable given the book's liquidity.
   *
   * Returns the effective spread (considering liquidity constraints)
   * vs the raw spread visible from best bid/ask alone.
   */
  effectiveSpread(
    book: NormalizedBookWithMetrics | null,
    tradeSize: number,
  ): {
    rawSpread: number;
    rawSpreadPct: number;
    effectiveSpreadBuy: number;
    effectiveSpreadBuyPct: number;
    effectiveSpreadSell: number;
    effectiveSpreadSellPct: number;
  } {
    if (!book) {
      return {
        rawSpread: 0,
        rawSpreadPct: 0,
        effectiveSpreadBuy: 0,
        effectiveSpreadBuyPct: 0,
        effectiveSpreadSell: 0,
        effectiveSpreadSellPct: 0,
      };
    }
    const { metrics } = book;

    const buyEstimate = this.estimate(book, tradeSize, 'buy');
    const sellEstimate = this.estimate(book, tradeSize, 'sell');

    return {
      rawSpread: metrics.spread,
      rawSpreadPct: metrics.spreadPct,
      effectiveSpreadBuy: buyEstimate.averagePrice - metrics.bestBid,
      effectiveSpreadBuyPct:
        metrics.bestBid > 0 ? (buyEstimate.averagePrice - metrics.bestBid) / metrics.bestBid : 0,
      effectiveSpreadSell: metrics.bestAsk - sellEstimate.averagePrice,
      effectiveSpreadSellPct:
        metrics.bestAsk > 0 ? (metrics.bestAsk - sellEstimate.averagePrice) / metrics.bestAsk : 0,
    };
  }

  // ──────────────────── Internal ────────────────────────────────────────

  private emptyEstimate(size: number, side: 'buy' | 'sell'): SlippageEstimate {
    return {
      requestedSize: size,
      side,
      bestPrice: 0,
      averagePrice: 0,
      worstPrice: 0,
      slippageAbsolute: 0,
      slippagePercent: 0,
      levelsConsumed: 0,
      totalCost: 0,
      filledBase: 0,
      fillRatio: 0,
      levelBreakdown: [],
    };
  }
}
