import { OrderBookNormalizer } from '../../src/marketdata/orderbook/OrderBookNormalizer';
import { createMockOrderBook } from '../fixtures';

describe('OrderBookNormalizer', () => {
  const normalizer = new OrderBookNormalizer();

  describe('normalize', () => {
    it('returns null for empty order book', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [],
        asks: [],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });
      expect(result).toBeNull();
    });

    it('sorts bids descending and asks ascending', () => {
      const book = createMockOrderBook(
        [64998, 65000, 64999], // unsorted bids
        [65002, 65000, 65001], // unsorted asks
      );
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: book.bids,
        asks: book.asks,
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.bidDepth[0].price).toBe(65000); // best bid first
      expect(result!.askDepth[0].price).toBe(65000); // best ask first
    });

    it('deduplicates price levels keeping highest quantity', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [
          { price: '65000', quantity: '1.0' },
          { price: '65000', quantity: '2.0' }, // duplicate
        ],
        asks: [
          { price: '65001', quantity: '0.5' },
          { price: '65001', quantity: '1.5' }, // duplicate
        ],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.bidDepth).toHaveLength(1);
      expect(result!.bidDepth[0].quantity).toBe(2.0);
      expect(result!.askDepth).toHaveLength(1);
      expect(result!.askDepth[0].quantity).toBe(1.5);
    });

    it('filters out invalid levels (non-finite, zero, negative)', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [
          { price: '65000', quantity: '1.0' },
          { price: 'NaN', quantity: '1.0' },
          { price: '65000', quantity: '0' },
          { price: '-1', quantity: '1.0' },
        ],
        asks: [
          { price: '65001', quantity: '1.0' },
          { price: 'Infinity', quantity: '1.0' },
        ],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.bidDepth).toHaveLength(1);
      expect(result!.askDepth).toHaveLength(1);
    });

    it('computes cumulative depth correctly', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [
          { price: '65000', quantity: '1.0' },
          { price: '64999', quantity: '2.0' },
          { price: '64998', quantity: '3.0' },
        ],
        asks: [],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.bidDepth[0].cumulative).toBe(1.0);
      expect(result!.bidDepth[1].cumulative).toBe(3.0);
      expect(result!.bidDepth[2].cumulative).toBe(6.0);
    });

    it('computes metrics correctly', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [
          { price: '65000', quantity: '5.0' },
          { price: '64999', quantity: '3.0' },
        ],
        asks: [
          { price: '65001', quantity: '4.0' },
          { price: '65002', quantity: '2.0' },
        ],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.metrics.bestBid).toBe(65000);
      expect(result!.metrics.bestAsk).toBe(65001);
      expect(result!.metrics.spread).toBe(1);
      expect(result!.metrics.midPrice).toBe(65000.5);
      expect(result!.metrics.totalBidDepth).toBe(8.0);
      expect(result!.metrics.totalAskDepth).toBe(6.0);
    });

    it('handles single-sided book (bids only)', () => {
      const result = normalizer.normalize({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bids: [{ price: '65000', quantity: '1.0' }],
        asks: [],
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });

      expect(result).not.toBeNull();
      expect(result!.metrics.bestBid).toBe(65000);
      expect(result!.metrics.bestAsk).toBe(0);
    });
  });
});
