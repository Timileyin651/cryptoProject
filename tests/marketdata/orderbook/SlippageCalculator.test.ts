import { OrderBookNormalizer } from '../../../src/marketdata/orderbook/OrderBookNormalizer';
import { SlippageCalculator } from '../../../src/marketdata/orderbook/SlippageCalculator';
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

const calculator = new SlippageCalculator();

// ── Tests ───────────────────────────────────────────────────────────────

describe('SlippageCalculator', () => {
  describe('estimate', () => {
    it('returns zero slippage for a single-level fill', () => {
      const book = normalize([['64999', '10']], [['65001', '10']]);

      const result = calculator.estimate(book, 1, 'buy');

      expect(result.bestPrice).toBe(65001);
      expect(result.averagePrice).toBe(65001);
      expect(result.slippageAbsolute).toBe(0);
      expect(result.slippagePercent).toBeCloseTo(0, 5);
      expect(result.levelsConsumed).toBe(1);
      expect(result.fillRatio).toBe(1.0);
      expect(result.levelBreakdown).toHaveLength(1);
      expect(result.levelBreakdown[0].consumed).toBe(1);
    });

    it('computes correct VWAP across multiple levels', () => {
      const book = normalize(
        [
          ['64998', '1'],
          ['64997', '1'],
          ['64996', '1'],
        ],
        [
          ['65001', '1'],
          ['65002', '1'],
          ['65003', '1'],
        ],
      );

      // Buy 3 BTC — consumes all 3 ask levels
      const result = calculator.estimate(book, 3, 'buy');

      // VWAP: (65001 + 65002 + 65003) / 3 = 65002
      expect(result.averagePrice).toBeCloseTo(65002, 5);
      expect(result.levelsConsumed).toBe(3);
      expect(result.worstPrice).toBeCloseTo(65003, 5);
      expect(result.filledBase).toBe(3);
      expect(result.fillRatio).toBe(1.0);
    });

    it('returns correct slippage for a sell side', () => {
      const book = normalize(
        [
          ['64999', '1'],
          ['64998', '1'],
          ['64997', '1'],
        ],
        [['65001', '10']],
      );

      // Sell 3 BTC — consumes all 3 bid levels
      const result = calculator.estimate(book, 3, 'sell');

      // VWAP: (64999 + 64998 + 64997) / 3 = 64998
      expect(result.averagePrice).toBeCloseTo(64998, 5);
      expect(result.slippageAbsolute).toBeCloseTo(1, 5); // 64999 - 64998 = 1
      expect(result.slippagePercent).toBeCloseTo(1 / 64999, 8);
    });

    it('handles partial fill when book is too thin', () => {
      const book = normalize([['64999', '0.3']], [['65001', '0.3']]);

      const result = calculator.estimate(book, 5, 'buy');

      expect(result.filledBase).toBeCloseTo(0.3, 5);
      expect(result.fillRatio).toBeCloseTo(0.06, 2); // 6%
      expect(result.levelsConsumed).toBe(1);
      expect(result.averagePrice).toBeCloseTo(65001, 5);
    });

    it('handles zero size', () => {
      const book = normalize([['100', '10']], [['101', '10']]);

      const result = calculator.estimate(book, 0, 'buy');
      expect(result.filledBase).toBe(0);
      expect(result.levelsConsumed).toBe(0);
    });

    it('handles empty book', () => {
      const book = normalize([], []);

      const result = calculator.estimate(book, 1, 'buy');
      expect(result.filledBase).toBe(0);
      expect(result.levelsConsumed).toBe(0);
    });

    it('provides correct level breakdown', () => {
      const book = normalize(
        [['100', '5']],
        [
          ['101', '1'],
          ['102', '1'],
          ['103', '1'],
        ],
      );

      const result = calculator.estimate(book, 2, 'buy');

      expect(result.levelBreakdown).toHaveLength(2);

      // Level 1: price 101, consumed 1
      expect(result.levelBreakdown[0].price).toBe(101);
      expect(result.levelBreakdown[0].consumed).toBe(1);
      expect(result.levelBreakdown[0].cumulativeBase).toBe(1);
      expect(result.levelBreakdown[0].vwapAtLevel).toBe(101);

      // Level 2: price 102, consumed 1
      expect(result.levelBreakdown[1].price).toBe(102);
      expect(result.levelBreakdown[1].consumed).toBe(1);
      expect(result.levelBreakdown[1].cumulativeBase).toBe(2);
      expect(result.levelBreakdown[1].vwapAtLevel).toBeCloseTo(101.5, 5);
    });

    it('handles asymmetric depth (many bids, few asks)', () => {
      const book = normalize(
        [
          ['100', '10'],
          ['99', '10'],
          ['98', '10'],
        ],
        [['101', '0.1']],
      );

      // Buy 0.05 — well within the 0.1 at best ask
      const result = calculator.estimate(book, 0.05, 'buy');
      expect(result.filledBase).toBeCloseTo(0.05, 5);
      expect(result.slippagePercent).toBeCloseTo(0, 5);
    });
  });

  describe('effectiveSpread', () => {
    it('raw spread equals the theoretical bid-ask spread', () => {
      const book = normalize([['100', '10']], [['101', '10']]);

      const result = calculator.effectiveSpread(book, 1);

      expect(result.rawSpread).toBe(1);
      expect(result.rawSpreadPct).toBeCloseTo(1 / 100.5, 8);
    });

    it('effective buy spread accounts for slippage on walk', () => {
      // Wide levels on ask side
      const book = normalize(
        [
          ['100', '10'],
          ['99', '10'],
        ],
        [
          ['101', '0.5'],
          ['110', '10'],
        ],
      );

      // Buy 1 BTC — walks both levels, significant slippage
      const result = calculator.effectiveSpread(book, 1);

      // Raw spread is 1 (101 - 100)
      expect(result.rawSpread).toBe(1);

      // Effective buy spread: avgPrice - bestBid
      // avgPrice = (101*0.5 + 110*0.5) / 1 = 105.5
      // effectiveSpreadBuy = 105.5 - 100 = 5.5
      expect(result.effectiveSpreadBuy).toBeCloseTo(5.5, 5);
      expect(result.effectiveSpreadBuyPct).toBeCloseTo(5.5 / 100, 5);
    });

    it('returns zeros for empty book', () => {
      const book = normalize([], []);

      const result = calculator.effectiveSpread(book, 1);
      expect(result.rawSpread).toBe(0);
      expect(result.rawSpreadPct).toBe(0);
    });

    it('effective sell spread accounts for slippage on walk', () => {
      const book = normalize(
        [
          ['100', '0.5'],
          ['90', '10'],
        ],
        [
          ['101', '10'],
          ['102', '10'],
        ],
      );

      // Sell 1 BTC — walks both bid levels
      const result = calculator.effectiveSpread(book, 1);

      // avgPrice = (100*0.5 + 90*0.5) / 1 = 95
      // effectiveSpreadSell = bestAsk - avgPrice = 101 - 95 = 6
      expect(result.effectiveSpreadSell).toBeCloseTo(6, 5);
    });
  });
});
