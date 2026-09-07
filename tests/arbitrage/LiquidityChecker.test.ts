import { CrossExchangeLiquidityChecker } from '../../src/arbitrage/LiquidityChecker';
import type { NormalizedBookWithMetrics } from '../../src/marketdata/orderbook/OrderBookNormalizer';

function makeBook(
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
): NormalizedBookWithMetrics {
  let bidCum = 0;
  const bidDepth = bids.map(([price, qty]) => {
    bidCum += qty;
    return { price, quantity: qty, cumulative: bidCum };
  });

  let askCum = 0;
  const askDepth = asks.map(([price, qty]) => {
    askCum += qty;
    return { price, quantity: qty, cumulative: askCum };
  });

  const bestBid = bids.length > 0 ? bids[0][0] : 0;
  const bestAsk = asks.length > 0 ? asks[0][0] : 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;

  return {
    exchange: 'test',
    symbol: 'BTC/USDT',
    bids: bids.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
    asks: asks.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
    timestamp: Date.now(),
    receivedAt: Date.now(),
    metrics: {
      bestBid,
      bestAsk,
      spread,
      spreadPct: midPrice > 0 ? spread / midPrice : 0,
      midPrice,
      totalBidDepth: bidCum,
      totalAskDepth: askCum,
    },
    bidDepth,
    askDepth,
  };
}

describe('CrossExchangeLiquidityChecker', () => {
  let checker: CrossExchangeLiquidityChecker;

  beforeEach(() => {
    checker = new CrossExchangeLiquidityChecker();
  });

  describe('check', () => {
    it('passes when both sides have sufficient depth', () => {
      const buyBook = makeBook(
        [[49000, 10]], // bids
        [[50000, 10]], // asks — we buy here
      );
      const sellBook = makeBook(
        [[50500, 10]], // bids — we sell here
        [[51000, 10]], // asks
      );

      const result = checker.check(buyBook, sellBook, 5.0);
      expect(result.executable).toBe(true);
      expect(result.buyFillRatio).toBe(1.0);
      expect(result.sellFillRatio).toBe(1.0);
    });

    it('fails when buy side has insufficient depth', () => {
      const buyBook = makeBook(
        [[49000, 1]],
        [[50000, 1]], // Only 1 BTC available
      );
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);

      const result = checker.check(buyBook, sellBook, 5.0);
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('Insufficient depth');
    });

    it('fails when sell side has insufficient depth', () => {
      const buyBook = makeBook([[49000, 10]], [[50000, 10]]);
      const sellBook = makeBook(
        [[50500, 1]], // Only 1 BTC
        [[51000, 10]],
      );

      const result = checker.check(buyBook, sellBook, 5.0);
      expect(result.executable).toBe(false);
    });

    it('fails with null buy book', () => {
      const result = checker.check(null, makeBook([[50000, 10]], [[51000, 10]]), 1.0);
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('empty or unavailable');
    });

    it('fails with null sell book', () => {
      const result = checker.check(makeBook([[49000, 10]], [[50000, 10]]), null, 1.0);
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('empty or unavailable');
    });

    it('fails with zero trade size', () => {
      const buyBook = makeBook([[49000, 10]], [[50000, 10]]);
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);
      const result = checker.check(buyBook, sellBook, 0);
      expect(result.executable).toBe(false);
    });

    it('fails on excessive slippage', () => {
      // Single level with tiny quantity — slippage will be high for large size
      const buyBook = makeBook(
        [[49000, 10]],
        [
          [50000, 0.1],
          [50100, 0.1],
        ], // Very thin asks
      );
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);

      // With strict slippage limit
      const strictChecker = new CrossExchangeLiquidityChecker(0.001);
      const result = strictChecker.check(buyBook, sellBook, 1.0);
      expect(result.executable).toBe(false);
    });
  });

  describe('estimateSlippage', () => {
    it('returns zero for empty books', () => {
      const result = checker.estimateSlippage(null, null, 1.0);
      expect(result.buySlippage).toBe(0);
      expect(result.sellSlippage).toBe(0);
      expect(result.totalSlippage).toBe(0);
    });

    it('computes VWAP correctly for single level', () => {
      const buyBook = makeBook([[49000, 10]], [[50000, 10]]);
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);

      const result = checker.estimateSlippage(buyBook, sellBook, 1.0);
      expect(result.buyVwap).toBe(50000);
      expect(result.sellVwap).toBe(50500);
      expect(result.buySlippage).toBe(0);
      expect(result.sellSlippage).toBe(0);
      expect(result.buyFillRatio).toBe(1.0);
      expect(result.sellFillRatio).toBe(1.0);
    });

    it('computes VWAP correctly for multi-level', () => {
      const buyBook = makeBook(
        [[49000, 10]],
        [
          [50000, 1],
          [50010, 1],
        ], // 2 ask levels
      );
      const sellBook = makeBook(
        [
          [50500, 1],
          [50490, 1],
        ], // 2 bid levels
        [[51000, 10]],
      );

      const result = checker.estimateSlippage(buyBook, sellBook, 2.0);
      // Buy VWAP: (50000*1 + 50010*1) / 2 = 50005
      expect(result.buyVwap).toBeCloseTo(50005, 0);
      // Buy slippage: (50005 - 50000) / 50000 = 0.0001
      expect(result.buySlippage).toBeCloseTo(0.0001, 5);
      expect(result.buyLevelsConsumed).toBe(2);
      expect(result.buyFillRatio).toBe(1.0);
    });

    it('reports partial fill when depth is insufficient', () => {
      const buyBook = makeBook(
        [[49000, 10]],
        [[50000, 1]], // Only 1 BTC
      );
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);

      const result = checker.estimateSlippage(buyBook, sellBook, 5.0);
      expect(result.buyFillRatio).toBeCloseTo(0.2, 1);
      expect(result.buyFillRatio).toBeLessThan(1.0);
    });

    it('handles zero trade size', () => {
      const buyBook = makeBook([[49000, 10]], [[50000, 10]]);
      const sellBook = makeBook([[50500, 10]], [[51000, 10]]);

      const result = checker.estimateSlippage(buyBook, sellBook, 0);
      expect(result.buySlippage).toBe(0);
      expect(result.sellSlippage).toBe(0);
    });
  });
});
