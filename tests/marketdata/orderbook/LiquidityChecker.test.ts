import { OrderBookNormalizer } from '../../../src/marketdata/orderbook/OrderBookNormalizer';
import { LiquidityChecker } from '../../../src/marketdata/orderbook/LiquidityChecker';
import type { NormalizedOrderBook } from '../../../src/marketdata/types';
import type { NormalizedBookWithMetrics } from '../../../src/marketdata/orderbook/OrderBookNormalizer';

// ── Helpers ─────────────────────────────────────────────────────────────

function makeBook(bids: [string, string][], asks: [string, string][]): NormalizedOrderBook {
  return {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    bids: bids.map(([price, quantity]) => ({ price, quantity })),
    asks: asks.map(([price, quantity]) => ({ price, quantity })),
    timestamp: Date.now(),
    receivedAt: Date.now(),
  };
}

function normalize(bids: [string, string][], asks: [string, string][]): NormalizedBookWithMetrics {
  const normalizer = new OrderBookNormalizer();
  const book = makeBook(bids, asks);
  return normalizer.normalize(book)!;
}

const checker = new LiquidityChecker(0.01); // 1% default max slippage

// ── Tests ───────────────────────────────────────────────────────────────

describe('LiquidityChecker', () => {
  describe('check', () => {
    it('returns executable=true for a small buy within tight book', () => {
      const book = normalize(
        [
          ['64999', '10'],
          ['64998', '20'],
          ['64997', '30'],
        ],
        [
          ['65001', '10'],
          ['65002', '20'],
          ['65003', '30'],
        ],
      );

      // Buy 1 BTC — well within the 10 BTC at best ask
      const result = checker.check(book, { size: 1, side: 'buy' });

      expect(result.executable).toBe(true);
      expect(result.executableSize).toBe(1);
      expect(result.fillRatio).toBe(1.0);
      expect(result.levelsConsumed).toBe(1);
      expect(result.averageFillPrice).toBeCloseTo(65001, 5);
      expect(result.reason).toBeUndefined();
    });

    it('returns executable=true for a small sell within tight book', () => {
      const book = normalize(
        [
          ['64999', '10'],
          ['64998', '20'],
          ['64997', '30'],
        ],
        [
          ['65001', '10'],
          ['65002', '20'],
          ['65003', '30'],
        ],
      );

      // Sell 1 BTC — well within the 10 BTC at best bid
      const result = checker.check(book, { size: 1, side: 'sell' });

      expect(result.executable).toBe(true);
      expect(result.executableSize).toBe(1);
      expect(result.fillRatio).toBe(1.0);
      expect(result.averageFillPrice).toBeCloseTo(64999, 5);
    });

    it('returns executable=false when book is too thin (insufficient depth)', () => {
      const book = normalize([['64999', '0.5']], [['65001', '0.5']]);

      // Try to buy 5 BTC — only 0.5 available
      const result = checker.check(book, { size: 5, side: 'buy' });

      expect(result.executable).toBe(false);
      expect(result.executableSize).toBeCloseTo(0.5, 5);
      expect(result.fillRatio).toBeCloseTo(0.1, 5); // 10% fill
      expect(result.levelsConsumed).toBe(1);
      expect(result.reason).toContain('Insufficient depth');
    });

    it('returns executable=false when slippage exceeds max', () => {
      // Thin book with wide spread — buying 1 BTC will walk multiple levels
      const book = normalize(
        [
          ['64000', '0.3'],
          ['63500', '0.3'],
          ['63000', '0.4'],
        ],
        [
          ['66000', '0.3'],
          ['67000', '0.3'],
          ['68000', '0.4'],
        ],
      );

      // Buy 1 BTC — walk through 3 levels
      // avgPrice = (66000*0.3 + 67000*0.3 + 68000*0.4) / 1 = 67100
      // slippage = (67100 - 66000) / 66000 ≈ 1.67%
      const result = checker.check(book, { size: 1, side: 'buy', maxSlippage: 0.01 });

      expect(result.executable).toBe(false);
      expect(result.fillRatio).toBe(1.0); // Can fill, but slippage too high
      expect(result.reason).toContain('Slippage');
    });

    it('handles zero trade size gracefully', () => {
      const book = normalize([['64999', '10']], [['65001', '10']]);

      const result = checker.check(book, { size: 0, side: 'buy' });
      expect(result.executable).toBe(false);
      expect(result.reason).toBe('Trade size must be positive');
    });

    it('handles empty book (no asks) for buy', () => {
      const book = normalize([['64999', '10']], []);

      const result = checker.check(book, { size: 1, side: 'buy' });
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('No ask liquidity');
    });

    it('handles empty book (no bids) for sell', () => {
      const book = normalize([], [['65001', '10']]);

      const result = checker.check(book, { size: 1, side: 'sell' });
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('No bid liquidity');
    });

    it('computes correct multi-level fill with VWAP', () => {
      const book = normalize(
        [
          ['64999', '1'],
          ['64998', '1'],
          ['64997', '1'],
        ],
        [
          ['65001', '1'],
          ['65002', '1'],
          ['65003', '1'],
        ],
      );

      // Buy 3 BTC — walks all 3 ask levels
      const result = checker.check(book, { size: 3, side: 'buy', maxSlippage: 1 });

      expect(result.executable).toBe(true);
      expect(result.fillRatio).toBe(1.0);
      expect(result.levelsConsumed).toBe(3);
      // VWAP: (65001*1 + 65002*1 + 65003*1) / 3 = 65002
      expect(result.averageFillPrice).toBeCloseTo(65002, 5);
      expect(result.worstPrice).toBeCloseTo(65003, 5);
    });

    it('reports correct totalAvailableDepth', () => {
      const book = normalize(
        [
          ['100', '5'],
          ['99', '10'],
        ],
        [
          ['101', '3'],
          ['102', '7'],
        ],
      );

      const buyResult = checker.check(book, { size: 1, side: 'buy' });
      expect(buyResult.totalAvailableDepth).toBe(10); // 3 + 7

      const sellResult = checker.check(book, { size: 1, side: 'sell' });
      expect(sellResult.totalAvailableDepth).toBe(15); // 5 + 10
    });

    it('uses custom maxSlippage when provided', () => {
      const book = normalize(
        [
          ['64000', '0.5'],
          ['63500', '0.5'],
        ],
        [
          ['66000', '0.5'],
          ['66500', '0.5'],
        ],
      );

      // Very tight slippage bound — should reject
      const strict = checker.check(book, { size: 1, side: 'buy', maxSlippage: 0.001 });
      expect(strict.executable).toBe(false);

      // Loose slippage bound — should accept
      const loose = checker.check(book, { size: 1, side: 'buy', maxSlippage: 0.05 });
      expect(loose.executable).toBe(true);
    });
  });

  describe('hasDepth', () => {
    it('returns true when book has enough depth', () => {
      const book = normalize([['100', '10']], [['101', '10']]);

      expect(checker.hasDepth(book, 5, 'buy')).toBe(true);
      expect(checker.hasDepth(book, 5, 'sell')).toBe(true);
      expect(checker.hasDepth(book, 10, 'buy')).toBe(true);
    });

    it('returns false when book is too thin', () => {
      const book = normalize([['100', '1']], [['101', '2']]);

      expect(checker.hasDepth(book, 5, 'buy')).toBe(false);
      expect(checker.hasDepth(book, 5, 'sell')).toBe(false);
    });

    it('returns false for empty book', () => {
      const book = normalize([], []);
      expect(checker.hasDepth(book, 1, 'buy')).toBe(false);
    });
  });

  describe('maxExecutableSize', () => {
    it('returns the full depth when slippage stays within bounds', () => {
      const book = normalize(
        [
          ['100', '5'],
          ['99', '5'],
          ['98', '5'],
        ],
        [
          ['101', '5'],
          ['102', '5'],
          ['103', '5'],
        ],
      );

      // Wide slippage bound — can use full depth
      const max = checker.maxExecutableSize(book, 'buy', 0.1);
      expect(max).toBeCloseTo(15, 5);
    });

    it('returns 0 for empty book', () => {
      const book = normalize([], []);
      expect(checker.maxExecutableSize(book, 'buy')).toBe(0);
    });

    it('limits size when slippage would exceed bound', () => {
      // Each level is 1 unit, price jumps by 1 each time
      const book = normalize(
        [
          ['100', '1'],
          ['99', '1'],
          ['98', '1'],
        ],
        [
          ['101', '1'],
          ['102', '1'],
          ['103', '1'],
        ],
      );

      // Max slippage 1% from best ask (101)
      // Level 1: avg = 101, slippage = 0%
      // Level 2: avg = (101+102)/2 = 101.5, slippage = (101.5-101)/101 ≈ 0.495%
      // Level 3: avg = (101+102+103)/3 = 102, slippage = (102-101)/101 ≈ 0.99%
      // So max should be around 3 units (just under 1%)
      const max = checker.maxExecutableSize(book, 'buy', 0.01);
      expect(max).toBeGreaterThanOrEqual(2.9);
      expect(max).toBeLessThanOrEqual(3.0);
    });
  });
});
