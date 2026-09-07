import { NetworkChecker } from '../../src/arbitrage/NetworkChecker';

describe('NetworkChecker', () => {
  let checker: NetworkChecker;

  beforeEach(() => {
    checker = new NetworkChecker();
  });

  describe('same-exchange transfers', () => {
    it('returns zero costs for same-exchange opportunity', () => {
      const result = checker.checkTransfer('BTC', 'binance', 'binance', 1.0);

      expect(result.sameExchange).toBe(true);
      expect(result.withdrawalCost).toBe(0);
      expect(result.withdrawalFee).toBe(0);
      expect(result.networkFee).toBe(0);
      expect(result.confirmationTimeSec).toBe(0);
      expect(result.withdrawalAvailable).toBe(true);
      expect(result.depositAvailable).toBe(true);
    });
  });

  describe('cross-exchange transfers with no cache', () => {
    it('returns unavailable when no network info cached', () => {
      const result = checker.checkTransfer('BTC', 'binance', 'bybit', 1.0);

      expect(result.sameExchange).toBe(false);
      expect(result.withdrawalAvailable).toBe(false);
      expect(result.depositAvailable).toBe(false);
    });
  });

  describe('withdrawalFeeInQuote', () => {
    it('converts base fee to quote correctly', () => {
      const quoteCost = checker.withdrawalFeeInQuote(0.0005, 50000);
      // 0.0005 * 50000 = 25
      expect(quoteCost).toBe(25);
    });

    it('handles zero fee', () => {
      const quoteCost = checker.withdrawalFeeInQuote(0, 50000);
      expect(quoteCost).toBe(0);
    });
  });

  describe('needsRefresh', () => {
    it('needs refresh initially', () => {
      expect(checker.needsRefresh()).toBe(true);
    });
  });

  describe('getNetworkInfo', () => {
    it('returns empty array for unknown coins', () => {
      const info = checker.getNetworkInfo('binance', 'NONEXISTENT');
      expect(info).toEqual([]);
    });
  });
});
