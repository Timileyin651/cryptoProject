import { createMockExchangeAdapter } from '../fixtures';
import {
  ExchangeError,
  ExchangeRateLimitError,
  ExchangeSymbolNotFoundError,
  ExchangeNetworkError,
  ExchangeDataError,
} from '../../src/exchanges/errors';

describe('Exchange Adapter', () => {
  describe('Mock Adapter', () => {
    it('implements the ExchangeAdapter interface', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance' });
      expect(adapter.slug).toBe('binance');
      expect(adapter.name).toBe('Binance');
      expect(adapter.baseUrl).toBeDefined();
      expect(adapter.capabilities).toBeDefined();
      expect(typeof adapter.initialize).toBe('function');
      expect(typeof adapter.shutdown).toBe('function');
      expect(typeof adapter.fetchMarkets).toBe('function');
      expect(typeof adapter.fetchTicker).toBe('function');
      expect(typeof adapter.fetchOrderBook).toBe('function');
      expect(typeof adapter.fetchFundingRate).toBe('function');
      expect(typeof adapter.fetchCoinNetworkStatus).toBe('function');
    });

    it('returns markets with correct structure', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', spotFee: 0.001 });
      const markets = await adapter.fetchMarkets();
      expect(markets.length).toBeGreaterThan(0);
      expect(markets[0].symbol).toBe('BTC/USDT');
      expect(markets[0].baseCurrency).toBe('BTC');
      expect(markets[0].quoteCurrency).toBe('USDT');
      expect(parseFloat(markets[0].takerFee)).toBe(0.001);
    });

    it('returns ticker with correct structure', async () => {
      const adapter = createMockExchangeAdapter({ bidPrice: '65000', askPrice: '65001' });
      const ticker = await adapter.fetchTicker('BTC/USDT');
      expect(ticker.symbol).toBe('BTC/USDT');
      expect(ticker.bid).toBe('65000');
      expect(ticker.ask).toBe('65001');
      expect(ticker.last).toBeDefined();
    });

    it('returns order book with correct structure', async () => {
      const adapter = createMockExchangeAdapter();
      const book = await adapter.fetchOrderBook('BTC/USDT', 10);
      expect(book.symbol).toBe('BTC/USDT');
      expect(book.bids.length).toBeGreaterThan(0);
      expect(book.asks.length).toBeGreaterThan(0);
      expect(book.bids[0].price).toBeDefined();
      expect(book.bids[0].quantity).toBeDefined();
    });

    it('returns funding rate when configured', async () => {
      const adapter = createMockExchangeAdapter({ fundingRate: 0.0001 });
      const rate = await adapter.fetchFundingRate('BTC/USDT:USDT');
      expect(rate).not.toBeNull();
      expect(rate!.fundingRate).toBe(0.0001);
    });

    it('returns null funding rate for non-perp symbols', async () => {
      const adapter = createMockExchangeAdapter();
      const rate = await adapter.fetchFundingRate('BTC/USDT');
      expect(rate).toBeNull();
    });

    it('returns network statuses', async () => {
      const adapter = createMockExchangeAdapter({
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
      const statuses = await adapter.fetchCoinNetworkStatus();
      expect(statuses.length).toBe(1);
      expect(statuses[0].coin).toBe('BTC');
      expect(statuses[0].network).toBe('mainnet');
      expect(statuses[0].withdrawalEnabled).toBe(true);
    });
  });

  describe('Exchange errors', () => {
    it('ExchangeError has correct properties', () => {
      const err = new ExchangeError('test error', 'binance');
      expect(err.message).toBe('test error');
      expect(err.exchangeSlug).toBe('binance');
      expect(err.statusCode).toBe(502);
      expect(err).toBeInstanceOf(Error);
    });

    it('ExchangeRateLimitError has retry info', () => {
      const err = new ExchangeRateLimitError('binance', 5000);
      expect(err.retryAfterMs).toBe(5000);
      expect(err.statusCode).toBe(429);
    });

    it('ExchangeSymbolNotFoundError has correct status', () => {
      const err = new ExchangeSymbolNotFoundError('binance', 'FAKE/USDT');
      expect(err.message).toContain('FAKE/USDT');
      expect(err.message).toContain('binance');
      expect(err.statusCode).toBe(404);
    });

    it('ExchangeNetworkError wraps original error', () => {
      const original = new Error('ECONNREFUSED');
      const err = new ExchangeNetworkError('binance', original);
      expect(err.originalError).toBe(original);
    });

    it('ExchangeDataError has correct status', () => {
      const err = new ExchangeDataError('binance', 'malformed response');
      expect(err.message).toContain('binance');
      expect(err.message).toContain('malformed response');
    });
  });
});
