import { DepthLevel, NormalizedBookWithMetrics } from './OrderBookNormalizer';

// ──────────────────────────── Types ─────────────────────────────────────

export interface LiquidityCheckRequest {
  /** Trade size in base currency (e.g. 0.5 BTC). */
  size: number;
  /** 'buy' = consuming asks, 'sell' = consuming bids. */
  side: 'buy' | 'sell';
  /**
   * Maximum acceptable slippage as a fraction (0..1).
   * Default: 0.01 (1%).
   */
  maxSlippage?: number;
}

export interface LiquidityCheckResult {
  /** Whether the order book can support this trade. */
  executable: boolean;
  /** The side of the book consumed. */
  side: 'buy' | 'sell';
  /** Requested trade size in base currency. */
  requestedSize: number;
  /**
   * How much of the requested size can actually be filled.
   * May be less than `requestedSize` if the book is too thin.
   */
  executableSize: number;
  /** Fraction of the requested size that can be filled (0..1). */
  fillRatio: number;
  /**
   * The price you'd actually get if you consumed all available levels
   * up to `executableSize`. This is the volume-weighted average price
   * of the consumed levels.
   */
  averageFillPrice: number;
  /** Price of the worst (last) level consumed. */
  worstPrice: number;
  /** Number of book levels consumed. */
  levelsConsumed: number;
  /** Total depth available in base currency on this side. */
  totalAvailableDepth: number;
  /**
   * Human-readable reason why the trade is not executable (if applicable).
   */
  reason?: string;
}

// ──────────────────────────── LiquidityChecker ──────────────────────────

/**
 * Checks whether an order book has enough depth to execute a trade
 * of a given size within acceptable slippage bounds.
 *
 * The scanner must not treat a large theoretical spread as fully
 * executable when order-book liquidity can't support the trade size.
 * This class enforces that rule.
 */
export class LiquidityChecker {
  private readonly defaultMaxSlippage: number;

  constructor(defaultMaxSlippage = 0.01) {
    this.defaultMaxSlippage = defaultMaxSlippage;
  }

  /**
   * Check if the order book can support the requested trade.
   */
  check(
    book: NormalizedBookWithMetrics | null,
    request: LiquidityCheckRequest,
  ): LiquidityCheckResult {
    const { size, side } = request;
    const maxSlippage = request.maxSlippage ?? this.defaultMaxSlippage;

    if (size <= 0) {
      return {
        executable: false,
        side,
        requestedSize: size,
        executableSize: 0,
        fillRatio: 0,
        averageFillPrice: 0,
        worstPrice: 0,
        levelsConsumed: 0,
        totalAvailableDepth: 0,
        reason: 'Trade size must be positive',
      };
    }

    if (!book) {
      return {
        executable: false,
        side,
        requestedSize: size,
        executableSize: 0,
        fillRatio: 0,
        averageFillPrice: 0,
        worstPrice: 0,
        levelsConsumed: 0,
        totalAvailableDepth: 0,
        reason: 'Order book is empty or unavailable',
      };
    }

    const levels = side === 'buy' ? book.askDepth : book.bidDepth;
    const totalDepth = levels.length > 0 ? levels[levels.length - 1].cumulative : 0;

    if (totalDepth <= 0 || levels.length === 0) {
      return {
        executable: false,
        side,
        requestedSize: size,
        executableSize: 0,
        fillRatio: 0,
        averageFillPrice: 0,
        worstPrice: 0,
        levelsConsumed: 0,
        totalAvailableDepth: 0,
        reason: `No ${side === 'buy' ? 'ask' : 'bid'} liquidity available`,
      };
    }

    // Walk the book levels and simulate the fill
    let remaining = size;
    let totalCost = 0; // quote currency spent/received
    let levelsConsumed = 0;
    let worstPrice = 0;
    let filledBase = 0;

    for (const level of levels) {
      if (remaining <= 0) break;

      const fillQty = Math.min(level.quantity, remaining);
      totalCost += fillQty * level.price;
      filledBase += fillQty;
      remaining -= fillQty;
      worstPrice = level.price;
      levelsConsumed++;
    }

    const fillRatio = filledBase / size;
    const averageFillPrice = filledBase > 0 ? totalCost / filledBase : 0;

    // Compute slippage from best price
    const bestPrice = levels[0].price;
    const slippage = bestPrice > 0 ? Math.abs(averageFillPrice - bestPrice) / bestPrice : 0;

    const executable = fillRatio >= 1.0 && slippage <= maxSlippage;

    let reason: string | undefined;
    if (!executable) {
      if (fillRatio < 1.0) {
        const pctFilled = (fillRatio * 100).toFixed(1);
        reason = `Insufficient depth: only ${pctFilled}% of ${size} ${side === 'buy' ? 'can be bought' : 'can be sold'}`;
      } else if (slippage > maxSlippage) {
        const pctSlippage = (slippage * 100).toFixed(2);
        const pctMax = (maxSlippage * 100).toFixed(2);
        reason = `Slippage ${pctSlippage}% exceeds max ${pctMax}%`;
      }
    }

    return {
      executable,
      side,
      requestedSize: size,
      executableSize: filledBase,
      fillRatio,
      averageFillPrice,
      worstPrice,
      levelsConsumed,
      totalAvailableDepth: totalDepth,
      reason,
    };
  }

  /**
   * Quick check: is the book deep enough to fill the full size?
   * Does not consider slippage — just raw depth.
   */
  hasDepth(book: NormalizedBookWithMetrics | null, size: number, side: 'buy' | 'sell'): boolean {
    if (!book) return false;
    const levels = side === 'buy' ? book.askDepth : book.bidDepth;
    if (levels.length === 0) return false;
    const totalDepth = levels[levels.length - 1].cumulative;
    return totalDepth >= size;
  }

  /**
   * Compute the maximum trade size the book can support
   * within the given slippage bound.
   */
  maxExecutableSize(
    book: NormalizedBookWithMetrics | null,
    side: 'buy' | 'sell',
    maxSlippage = this.defaultMaxSlippage,
  ): number {
    if (!book) return 0;
    const levels = side === 'buy' ? book.askDepth : book.bidDepth;
    if (levels.length === 0) return 0;

    const bestPrice = levels[0].price;
    if (bestPrice <= 0) return 0;

    // Level-by-level walk: find the exact point where slippage exceeds the bound
    let cumBase = 0;
    let prevCumBase = 0;
    let prevAvgPrice = bestPrice;

    for (const level of levels) {
      prevCumBase = cumBase;
      cumBase += level.quantity;
      const avgPrice = this.cumulativeAvgPrice(levels, cumBase);
      const slippage = Math.abs(avgPrice - bestPrice) / bestPrice;

      if (slippage > maxSlippage) {
        // Slippage exceeded at the end of this level.
        // Interpolate to find the exact cutoff within this level.
        const prevSlippage = Math.abs(prevAvgPrice - bestPrice) / bestPrice;
        if (prevSlippage >= maxSlippage || level.quantity === 0) {
          return prevCumBase;
        }
        // Linear interpolation: fraction of the level we can use
        const fraction = (maxSlippage - prevSlippage) / (slippage - prevSlippage);
        return prevCumBase + fraction * level.quantity;
      }

      prevAvgPrice = avgPrice;
    }

    return cumBase;
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /** Compute the volume-weighted average price for a given cumulative base quantity. */
  private cumulativeAvgPrice(levels: DepthLevel[], cumBase: number): number {
    let cost = 0;
    let remaining = cumBase;

    for (const level of levels) {
      const fillQty = Math.min(level.quantity, remaining);
      cost += fillQty * level.price;
      remaining -= fillQty;
      if (remaining <= 0) break;
    }

    return cumBase > 0 ? cost / cumBase : 0;
  }
}
