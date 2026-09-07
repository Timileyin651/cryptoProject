import { CrossExchangeLiquidityChecker } from '../../src/arbitrage/LiquidityChecker';
import { createOrderBookWithMetrics } from '../fixtures';

describe('CrossExchangeLiquidityChecker', () => {
  let checker: CrossExchangeLiquidityChecker;

  beforeEach(() => {
    checker = new CrossExchangeLiquidityChecker(0.01);
  });

  describe('check', () => {
    it('returns executable=true when both sides have depth', () => {
      const buyBook = createOrderBookWithMetrics(
        [65000, 64999, 64998],
        [65001, 65002, 65003],
        [1.0, 2.0, 3.0],
        [1.0, 2.0, 3.0],
      );
      const sellBook = createOrderBookWithMetrics(
        [65010, 65009, 65008],
        [65011, 65012, 65013],
        [1.0, 2.0, 3.0],
        [1.0, 2.0, 3.0],
      );

      const result = checker.check(buyBook as any, sellBook as any, 1.0);
      expect(result.executable).toBe(true);
      expect(result.buyFillRatio).toBeGreaterThanOrEqual(0.9);
      expect(result.sellFillRatio).toBeGreaterThanOrEqual(0.9);
    });

    it('returns not executable when trade size exceeds depth', () => {
      const buyBook = createOrderBookWithMetrics([65000], [65001], [0.5], [0.5]);
      const sellBook = createOrderBookWithMetrics([65010], [65011], [10.0], [10.0]);

      const result = checker.check(buyBook as any, sellBook as any, 1.0);
      expect(result.executable).toBe(false);
    });

    it('returns not executable with null buy book', () => {
      const result = checker.check(null, createOrderBookWithMetrics([65000], [65001]) as any, 1.0);
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('Buy exchange order book is empty');
    });

    it('returns not executable with null sell book', () => {
      const result = checker.check(createOrderBookWithMetrics([65000], [65001]) as any, null, 1.0);
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('Sell exchange order book is empty');
    });

    it('returns not executable with zero trade size', () => {
      const result = checker.check(
        createOrderBookWithMetrics([65000], [65001]) as any,
        createOrderBookWithMetrics([65010], [65011]) as any,
        0,
      );
      expect(result.executable).toBe(false);
      expect(result.reason).toContain('Trade size must be positive');
    });
  });

  describe('estimateSlippage', () => {
    it('returns zero slippage for deep books', () => {
      const buyBook = createOrderBookWithMetrics(
        [65000, 64999, 64998],
        [65001, 65002, 65003],
        [100.0, 100.0, 100.0],
        [100.0, 100.0, 100.0],
      );
      const sellBook = createOrderBookWithMetrics(
        [65010, 65009, 65008],
        [65011, 65012, 65013],
        [100.0, 100.0, 100.0],
        [100.0, 100.0, 100.0],
      );

      const result = checker.estimateSlippage(buyBook as any, sellBook as any, 1.0);
      expect(result.buySlippage).toBeCloseTo(0, 3);
      expect(result.sellSlippage).toBeCloseTo(0, 3);
    });

    it('returns positive slippage for thin books', () => {
      const buyBook = createOrderBookWithMetrics(
        [65000, 65010, 65020],
        [65001, 65011, 65021],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
      );
      const sellBook = createOrderBookWithMetrics(
        [65100, 65090, 65080],
        [65101, 65091, 65081],
        [0.5, 0.5, 0.5],
        [0.5, 0.5, 0.5],
      );

      const result = checker.estimateSlippage(buyBook as any, sellBook as any, 1.0);
      expect(result.buySlippage).toBeGreaterThan(0);
      expect(result.totalSlippage).toBeGreaterThan(0);
    });

    it('returns empty result for null books', () => {
      const result = checker.estimateSlippage(null, null, 1.0);
      expect(result.buySlippage).toBe(0);
      expect(result.sellSlippage).toBe(0);
      expect(result.totalSlippage).toBe(0);
    });

    it('returns zero for zero trade size', () => {
      const result = checker.estimateSlippage(
        createOrderBookWithMetrics([65000], [65001]) as any,
        createOrderBookWithMetrics([65010], [65011]) as any,
        0,
      );
      expect(result.buySlippage).toBe(0);
    });
  });
});
