import { NormalizedOrderBook, OrderBookLevel } from '../types';

// ──────────────────────────── Types ─────────────────────────────────────

/** Internal numeric level used during computation (avoids repeated parsing). */
interface NumericLevel {
  price: number;
  quantity: number;
}

export interface OrderBookMetrics {
  /** Best bid price (highest). */
  bestBid: number;
  /** Best ask price (lowest). */
  bestAsk: number;
  /** Bid-ask spread in quote currency. */
  spread: number;
  /** Relative spread as a fraction of mid price (0..1). */
  spreadPct: number;
  /** Mid price = (bestBid + bestAsk) / 2. */
  midPrice: number;
  /** Total bid quantity across all levels (base currency). */
  totalBidDepth: number;
  /** Total ask quantity across all levels (base currency). */
  totalAskDepth: number;
}

export interface DepthLevel {
  price: number;
  quantity: number;
  /** Cumulative quantity from the best price down to this level. */
  cumulative: number;
}

export interface NormalizedBookWithMetrics extends NormalizedOrderBook {
  /** Metrics computed from the raw levels. */
  metrics: OrderBookMetrics;
  /** Bid levels with cumulative depth, best-first. */
  bidDepth: DepthLevel[];
  /** Ask levels with cumulative depth, best-first. */
  askDepth: DepthLevel[];
}

// ──────────────────────────── Normalizer ────────────────────────────────

/**
 * Validates, sorts, deduplicates, and enriches an `NormalizedOrderBook`.
 *
 * Guarantees:
 *  - Bids are sorted descending by price (best first)
 *  - Asks are sorted ascending by price (best first)
 *  - No duplicate price levels (highest quantity wins)
 *  - All levels have positive, finite numeric price and quantity
 *  - Returns null if the book is empty or invalid
 */
export class OrderBookNormalizer {
  /**
   * Normalize a raw order book snapshot.
   * Returns null if the book has no usable levels.
   */
  normalize(book: NormalizedOrderBook): NormalizedBookWithMetrics | null {
    const bids = this.cleanLevels(book.bids);
    const asks = this.cleanLevels(book.asks);

    if (bids.length === 0 && asks.length === 0) {
      return null;
    }

    // Deduplicate by price: keep the highest quantity for duplicate prices
    const dedupedBids = this.deduplicate(bids, 'desc');
    const dedupedAsks = this.deduplicate(asks, 'asc');

    const bidDepth = this.computeCumulative(dedupedBids);
    const askDepth = this.computeCumulative(dedupedAsks);

    const metrics = this.computeMetrics(dedupedBids, dedupedAsks);

    return {
      ...book,
      bids: dedupedBids.map((l) => ({ price: String(l.price), quantity: String(l.quantity) })),
      asks: dedupedAsks.map((l) => ({ price: String(l.price), quantity: String(l.quantity) })),
      metrics,
      bidDepth,
      askDepth,
    };
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /** Parse, filter, and sort raw string levels into numeric levels. */
  private cleanLevels(levels: OrderBookLevel[]): NumericLevel[] {
    const parsed: NumericLevel[] = [];

    for (const level of levels) {
      const price = parseFloat(level.price);
      const quantity = parseFloat(level.quantity);

      if (!Number.isFinite(price) || !Number.isFinite(quantity)) continue;
      if (price <= 0 || quantity <= 0) continue;

      parsed.push({ price, quantity });
    }

    return parsed;
  }

  /**
   * Deduplicate levels by price.
   * For bids (desc), duplicates keep the higher quantity.
   * For asks (asc), same rule — highest quantity wins.
   */
  private deduplicate(levels: NumericLevel[], sortDir: 'asc' | 'desc'): NumericLevel[] {
    const map = new Map<number, number>(); // price → quantity

    for (const level of levels) {
      const existing = map.get(level.price);
      if (existing === undefined || level.quantity > existing) {
        map.set(level.price, level.quantity);
      }
    }

    const result: NumericLevel[] = [];
    for (const [price, quantity] of map.entries()) {
      result.push({ price, quantity });
    }

    result.sort((a, b) => (sortDir === 'asc' ? a.price - b.price : b.price - a.price));

    return result;
  }

  /** Compute cumulative depth for each level from the best price. */
  private computeCumulative(levels: NumericLevel[]): DepthLevel[] {
    let cumulative = 0;
    return levels.map((level) => {
      cumulative += level.quantity;
      return {
        price: level.price,
        quantity: level.quantity,
        cumulative,
      };
    });
  }

  /** Compute spread, mid price, and total depth. */
  private computeMetrics(bids: NumericLevel[], asks: NumericLevel[]): OrderBookMetrics {
    const bestBid = bids.length > 0 ? bids[0].price : 0;
    const bestAsk = asks.length > 0 ? asks[0].price : 0;
    const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
    const midPrice = bestAsk > 0 && bestBid > 0 ? (bestBid + bestAsk) / 2 : 0;
    const spreadPct = midPrice > 0 ? spread / midPrice : 0;

    let totalBidDepth = 0;
    for (const b of bids) totalBidDepth += b.quantity;

    let totalAskDepth = 0;
    for (const a of asks) totalAskDepth += a.quantity;

    return {
      bestBid,
      bestAsk,
      spread,
      spreadPct,
      midPrice,
      totalBidDepth,
      totalAskDepth,
    };
  }
}
