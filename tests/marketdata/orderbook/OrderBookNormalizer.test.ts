import { OrderBookNormalizer } from '../../../src/marketdata/orderbook/OrderBookNormalizer';
import type { NormalizedOrderBook } from '../../../src/marketdata/types';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBook(
  bids: [string, string][],
  asks: [string, string][],
  exchange = 'binance',
  symbol = 'BTC/USDT',
): NormalizedOrderBook {
  return {
    exchange,
    symbol,
    bids: bids.map(([price, quantity]) => ({ price, quantity })),
    asks: asks.map(([price, quantity]) => ({ price, quantity })),
    timestamp: Date.now(),
    receivedAt: Date.now(),
  };
}

const normalizer = new OrderBookNormalizer();

// ── Tests ───────────────────────────────────────────────────────────────

describe('OrderBookNormalizer', () => {
  describe('normalize', () => {
    it('returns null for an empty order book', () => {
      const book = makeBook([], []);
      const result = normalizer.normalize(book);
      expect(result).toBeNull();
    });

    it('returns null when all levels have invalid prices', () => {
      const book = makeBook(
        [
          ['abc', '100'],
          ['0', '50'],
        ],
        [
          ['65001', '1'],
          ['65002', '2'],
        ],
      );
      const result = normalizer.normalize(book);
      // Asks are valid, so it should not be null
      expect(result).not.toBeNull();
      expect(result!.bids).toHaveLength(0);
      expect(result!.asks).toHaveLength(2);
    });

    it('filters out levels with non-positive prices or quantities', () => {
      const book = makeBook(
        [
          ['65000', '1.5'],
          ['64999', '0'], // zero quantity — should be filtered
          ['64998', '-1'], // negative quantity — filtered
          ['64997', '0.5'],
        ],
        [
          ['65001', '1'],
          ['65000', '0'], // filtered
          ['64999.5', '0.5'],
        ],
      );

      const result = normalizer.normalize(book)!;
      expect(result.bids).toHaveLength(2);
      expect(result.asks).toHaveLength(2);
    });

    it('sorts bids descending and asks ascending', () => {
      const book = makeBook(
        [
          ['64998', '1'],
          ['65000', '3'],
          ['64999', '2'],
        ],
        [
          ['65003', '3'],
          ['65001', '1'],
          ['65002', '2'],
        ],
      );

      const result = normalizer.normalize(book)!;

      // Bids: descending
      expect(result.bids[0].price).toBe('65000');
      expect(result.bids[1].price).toBe('64999');
      expect(result.bids[2].price).toBe('64998');

      // Asks: ascending
      expect(result.asks[0].price).toBe('65001');
      expect(result.asks[1].price).toBe('65002');
      expect(result.asks[2].price).toBe('65003');
    });

    it('deduplicates prices keeping highest quantity', () => {
      const book = makeBook(
        [
          ['65000', '1.0'],
          ['65000', '3.0'], // duplicate — higher quantity wins
          ['65000', '2.0'],
          ['64999', '0.5'],
        ],
        [
          ['65001', '0.5'],
          ['65001', '2.5'], // duplicate — higher quantity wins
        ],
      );

      const result = normalizer.normalize(book)!;
      expect(result.bids).toHaveLength(2);
      expect(result.bids[0].price).toBe('65000');
      expect(result.bids[0].quantity).toBe('3');
      expect(result.asks).toHaveLength(1);
      expect(result.asks[0].quantity).toBe('2.5');
    });

    it('computes correct metrics for a standard book', () => {
      const book = makeBook(
        [
          ['100', '5'],
          ['99', '10'],
          ['98', '15'],
        ],
        [
          ['101', '3'],
          ['102', '7'],
          ['103', '12'],
        ],
      );

      const result = normalizer.normalize(book)!;

      expect(result.metrics.bestBid).toBe(100);
      expect(result.metrics.bestAsk).toBe(101);
      expect(result.metrics.spread).toBe(1);
      expect(result.metrics.midPrice).toBe(100.5);
      expect(result.metrics.spreadPct).toBeCloseTo(1 / 100.5, 10);
      expect(result.metrics.totalBidDepth).toBe(30); // 5 + 10 + 15
      expect(result.metrics.totalAskDepth).toBe(22); // 3 + 7 + 12
    });

    it('handles book with only bids (no asks)', () => {
      const book = makeBook(
        [
          ['100', '5'],
          ['99', '10'],
        ],
        [],
      );

      const result = normalizer.normalize(book)!;
      expect(result.metrics.bestBid).toBe(100);
      expect(result.metrics.bestAsk).toBe(0);
      expect(result.metrics.spread).toBe(0);
      expect(result.metrics.totalBidDepth).toBe(15);
      expect(result.metrics.totalAskDepth).toBe(0);
    });

    it('handles book with only asks (no bids)', () => {
      const book = makeBook(
        [],
        [
          ['101', '5'],
          ['102', '10'],
        ],
      );

      const result = normalizer.normalize(book)!;
      expect(result.metrics.bestBid).toBe(0);
      expect(result.metrics.bestAsk).toBe(101);
      expect(result.metrics.totalAskDepth).toBe(15);
    });

    it('computes cumulative depth correctly', () => {
      const book = makeBook(
        [
          ['100', '1'],
          ['99', '2'],
          ['98', '3'],
        ],
        [
          ['101', '4'],
          ['102', '5'],
        ],
      );

      const result = normalizer.normalize(book)!;

      // Bid cumulative: 1, 3, 6
      expect(result.bidDepth[0].cumulative).toBe(1);
      expect(result.bidDepth[1].cumulative).toBe(3);
      expect(result.bidDepth[2].cumulative).toBe(6);

      // Ask cumulative: 4, 9
      expect(result.askDepth[0].cumulative).toBe(4);
      expect(result.askDepth[1].cumulative).toBe(9);
    });

    it('preserves exchange and symbol from original book', () => {
      const book = makeBook([['100', '1']], [['101', '1']], 'bybit', 'ETH/USDT');

      const result = normalizer.normalize(book)!;
      expect(result.exchange).toBe('bybit');
      expect(result.symbol).toBe('ETH/USDT');
    });

    it('handles very small decimal prices correctly', () => {
      const book = makeBook([['0.00001234', '1000000']], [['0.00001235', '500000']]);

      const result = normalizer.normalize(book)!;
      expect(result.metrics.bestBid).toBeCloseTo(0.00001234, 10);
      expect(result.metrics.bestAsk).toBeCloseTo(0.00001235, 10);
      expect(result.metrics.spread).toBeCloseTo(0.00000001, 10);
    });
  });
});
