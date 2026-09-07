import { NetworkChecker } from '../../src/arbitrage/NetworkChecker';
import { createMockExchangeAdapter } from '../fixtures';

describe('NetworkChecker', () => {
  let checker: NetworkChecker;

  beforeEach(() => {
    checker = new NetworkChecker(300_000);
  });

  describe('checkTransfer', () => {
    it('same exchange returns zero costs', () => {
      const result = checker.checkTransfer('BTC', 'binance', 'binance', 1.0);
      expect(result.sameExchange).toBe(true);
      expect(result.withdrawalFee).toBe(0);
      expect(result.withdrawalAvailable).toBe(true);
      expect(result.depositAvailable).toBe(true);
    });

    it('cross-exchange without cached data returns unavailable', () => {
      const result = checker.checkTransfer('BTC', 'binance', 'okx', 1.0);
      expect(result.sameExchange).toBe(false);
      expect(result.withdrawalAvailable).toBe(false);
    });
  });

  describe('refreshFromAdapters', () => {
    it('populates network info cache', async () => {
      const adapter = createMockExchangeAdapter({
        slug: 'binance',
        networkStatuses: [
          {
            coin: 'BTC',
            network: 'mainnet',
            depositEnabled: true,
            withdrawalEnabled: true,
            withdrawalFee: '0.0005',
            minWithdrawal: '0.001',
          },
        ],
      });
      await checker.refreshFromAdapters([adapter as any]);
      const info = checker.getNetworkInfo('binance', 'BTC');
      expect(info).toHaveLength(1);
      expect(info[0].withdrawalFee).toBe(0.0005);
    });

    it('handles adapter errors gracefully', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'failing' });
      (adapter.fetchCoinNetworkStatus as any) = jest
        .fn()
        .mockRejectedValue(new Error('Network error'));
      await checker.refreshFromAdapters([adapter as any]);
      // Should not throw
    });
  });

  describe('withdrawalFeeInQuote', () => {
    it('converts base fee to quote currency', () => {
      const result = checker.withdrawalFeeInQuote(0.0005, 65000);
      expect(result).toBeCloseTo(32.5); // 0.0005 * 65000
    });
  });

  describe('needsRefresh', () => {
    it('returns true when cache is empty', () => {
      expect(checker.needsRefresh()).toBe(true);
    });

    it('returns false after refresh', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance' });
      await checker.refreshFromAdapters([adapter as any]);
      expect(checker.needsRefresh()).toBe(false);
    });
  });
});
