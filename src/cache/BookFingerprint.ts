import { NormalizedBookWithMetrics } from '../marketdata/orderbook/OrderBookNormalizer';

/**
 * Lightweight fingerprint of an order book's top levels.
 *
 * Used to detect when an order book hasn't meaningfully changed
 * between scans, allowing us to skip redundant opportunity calculations.
 *
 * The fingerprint captures:
 * - Best bid/ask prices and quantities (top 3 levels)
 * - Total bid/ask depth
 *
 * If the fingerprint matches, the book is considered unchanged.
 */
export interface BookFingerprint {
  /** Best bid price × 10000 (integer for fast comparison). */
  bb: number;
  /** Best bid quantity × 10000. */
  bq: number;
  /** Best ask price × 10000. */
  ba: number;
  /** Best ask quantity × 10000. */
  aq: number;
  /** Total bid depth × 1000. */
  td: number;
  /** Total ask depth × 1000. */
  ad: number;
}

const SCALE = 10_000;
const DEPTH_SCALE = 1_000;

/**
 * Create a fingerprint from a normalized order book.
 * Uses integer arithmetic for speed.
 */
export function fingerprint(book: NormalizedBookWithMetrics): BookFingerprint {
  const bids = book.bidDepth;
  const asks = book.askDepth;

  return {
    bb: Math.round((bids[0]?.price ?? 0) * SCALE),
    bq: Math.round((bids[0]?.quantity ?? 0) * SCALE),
    ba: Math.round((asks[0]?.price ?? 0) * SCALE),
    aq: Math.round((asks[0]?.quantity ?? 0) * SCALE),
    td: Math.round(book.metrics.totalBidDepth * DEPTH_SCALE),
    ad: Math.round(book.metrics.totalAskDepth * DEPTH_SCALE),
  };
}

/**
 * Compare two fingerprints for equality.
 * Returns true if they are effectively the same.
 */
export function fingerprintsEqual(a: BookFingerprint, b: BookFingerprint): boolean {
  return (
    a.bb === b.bb &&
    a.bq === b.bq &&
    a.ba === b.ba &&
    a.aq === b.aq &&
    a.td === b.td &&
    a.ad === b.ad
  );
}

/**
 * Cache of fingerprints keyed by "exchange:symbol".
 * Used by the ArbitrageEngine to skip unchanged pairs.
 */
export class FingerprintStore {
  private store = new Map<string, BookFingerprint>();
  private hitCount = 0;
  private missCount = 0;

  /**
   * Check if a book has changed since last scan.
   * Updates the stored fingerprint if changed.
   * Returns true if the book is UNCHANGED (should skip).
   */
  isUnchanged(key: string, book: NormalizedBookWithMetrics): boolean {
    const current = fingerprint(book);
    const previous = this.store.get(key);

    if (previous && fingerprintsEqual(previous, current)) {
      this.hitCount++;
      return true;
    }

    this.missCount++;
    this.store.set(key, current);
    return false;
  }

  /** Get cache statistics for monitoring. */
  getStats(): { size: number; hitRate: number; hits: number; misses: number } {
    const total = this.hitCount + this.missCount;
    return {
      size: this.store.size,
      hitRate: total > 0 ? this.hitCount / total : 0,
      hits: this.hitCount,
      misses: this.missCount,
    };
  }

  /** Clear the store. */
  clear(): void {
    this.store.clear();
    this.hitCount = 0;
    this.missCount = 0;
  }

  /** Remove stale entries (books we haven't seen in N scans). */
  evict(keepKeys: Set<string>): number {
    let evicted = 0;
    for (const key of this.store.keys()) {
      if (!keepKeys.has(key)) {
        this.store.delete(key);
        evicted++;
      }
    }
    return evicted;
  }
}
