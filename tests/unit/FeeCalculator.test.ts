import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import { createMockExchangeAdapter } from '../fixtures';

describe('FeeCalculator', () => {
  let calculator: FeeCalculator;

  beforeEach(() => {
    calculator = new FeeCalculator(60_000);
  });

  describe('getFee', () => {
    it('returns default fees for known exchanges', () => {
      const fee = calculator.getFee('binance', 'BTC/USDT');
      expect(fee.takerFee).toBe(0.001);
      expect(fee.makerFee).toBe(0.001);
      expect(fee.known).toBe(false);
    });

    it('returns 0.001 fallback for unknown exchanges', () => {
      const fee = calculator.getFee('unknown_exchange', 'BTC/USDT');
      expect(fee.takerFee).toBe(0.001);
      expect(fee.known).toBe(false);
    });

    it('okx has lower maker fee', () => {
      const fee = calculator.getFee('okx', 'BTC/USDT');
      expect(fee.takerFee).toBe(0.001);
      expect(fee.makerFee).toBe(0.0008);
    });

    it('gateio has higher fees', () => {
      const fee = calculator.getFee('gateio', 'BTC/USDT');
      expect(fee.takerFee).toBe(0.002);
      expect(fee.makerFee).toBe(0.002);
    });
  });

  describe('calculateTradingFee', () => {
    it('calculates taker fee correctly', () => {
      const fee = calculator.calculateTradingFee('binance', 'BTC/USDT', 10000);
      expect(fee).toBeCloseTo(10); // 10000 * 0.001
    });

    it('calculates maker fee when isMaker=true', () => {
      const fee = calculator.calculateTradingFee('okx', 'BTC/USDT', 10000, true);
      expect(fee).toBeCloseTo(8); // 10000 * 0.0008
    });

    it('handles zero quote cost', () => {
      const fee = calculator.calculateTradingFee('binance', 'BTC/USDT', 0);
      expect(fee).toBe(0);
    });
  });

  describe('calculateArbitrageFees', () => {
    it('calculates fees for both sides', () => {
      const result = calculator.calculateArbitrageFees('binance', 'okx', 'BTC/USDT', 65000, 65100);
      expect(result.buyFee).toBeCloseTo(65); // 65000 * 0.001
      expect(result.sellFee).toBeCloseTo(65.1); // 65100 * 0.001
      expect(result.totalFees).toBeCloseTo(130.1);
      expect(result.buyFeeRate).toBe(0.001);
      expect(result.sellFeeRate).toBe(0.001);
    });
  });

  describe('needsRefresh', () => {
    it('returns true when cache is empty', () => {
      expect(calculator.needsRefresh()).toBe(true);
    });

    it('returns false after refresh', () => {
      calculator['lastRefreshAt'] = Date.now();
      expect(calculator.needsRefresh()).toBe(false);
    });
  });

  describe('refreshFromAdapters', () => {
    it('fetches fees from adapters and caches them', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', spotFee: 0.00075 });
      await calculator.refreshFromAdapters([adapter as any]);
      expect(calculator.getAllFees().length).toBeGreaterThan(0);
      expect(calculator.needsRefresh()).toBe(false);
    });

    it('handles adapter errors gracefully', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'failing' });
      (adapter.fetchMarkets as any) = jest.fn().mockRejectedValue(new Error('Network error'));
      await calculator.refreshFromAdapters([adapter as any]);
      // Should not throw
      expect(calculator.needsRefresh()).toBe(false);
    });

    it('populates symbol-level fees from adapter data', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', spotFee: 0.0005 });
      await calculator.refreshFromAdapters([adapter as any]);
      const fee = calculator.getFee('binance', 'BTC/USDT');
      expect(fee.known).toBe(true);
      expect(fee.takerFee).toBe(0.0005);
    });
  });

  describe('getAllFees', () => {
    it('returns empty array initially', () => {
      expect(calculator.getAllFees()).toEqual([]);
    });
  });
});
