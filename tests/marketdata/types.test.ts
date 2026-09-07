import { marketDataKey, exchangeKeySet, tickerToHashFields } from '../../src/marketdata/types';
import type { NormalizedTicker } from '../../src/marketdata/types';

describe('marketdata/types', () => {
  describe('marketDataKey', () => {
    it('builds correct Redis key', () => {
      expect(marketDataKey('binance', 'BTC/USDT')).toBe('md:binance:BTC_USDT');
    });

    it('handles symbols with multiple separators', () => {
      expect(marketDataKey('okx', 'BTC/USDT')).toBe('md:okx:BTC_USDT');
    });
  });

  describe('exchangeKeySet', () => {
    it('builds correct set key', () => {
      expect(exchangeKeySet('binance')).toBe('md:binance:keys');
    });
  });

  describe('tickerToHashFields', () => {
    it('converts a ticker to flat hash fields with pre-computed spread and mid', () => {
      const ticker: NormalizedTicker = {
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bid: '64999.50',
        ask: '65000.50',
        last: '65000',
        volume24h: '12345.67',
        high24h: '65500',
        low24h: '64200',
        timestamp: 1700000000000,
        receivedAt: 1700000000100,
      };

      const fields = tickerToHashFields(ticker);

      expect(fields.exchange).toBe('binance');
      expect(fields.symbol).toBe('BTC/USDT');
      expect(fields.bid).toBe('64999.50');
      expect(fields.ask).toBe('65000.50');
      expect(fields.spread).toBe('1');
      expect(fields.midPrice).toBe('65000');
      expect(fields.timestamp).toBe('1700000000000');
      expect(fields.receivedAt).toBe('1700000000100');
    });

    it('handles zero bid/ask gracefully', () => {
      const ticker: NormalizedTicker = {
        exchange: 'bybit',
        symbol: 'ETH/USDT',
        bid: '0',
        ask: '0',
        last: '3500',
        volume24h: '100',
        high24h: '3600',
        low24h: '3400',
        timestamp: Date.now(),
        receivedAt: Date.now(),
      };

      const fields = tickerToHashFields(ticker);
      expect(fields.spread).toBe('0');
      expect(fields.midPrice).toBe('0');
    });
  });
});
