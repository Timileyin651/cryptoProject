import { FundingRateService } from '../../src/funding/FundingRateService';
import type { ExchangeAdapter, FundingRateSnapshot } from '../../src/exchanges/ExchangeAdapter';

// ──────────────────── Mock adapter ──────────────────────────────────────

function makeMockAdapter(
  slug: string,
  options: {
    supportsFutures?: boolean;
    fundingRate?: FundingRateSnapshot | null;
    fundingHistory?: FundingRateSnapshot[];
    markets?: Array<{ symbol: string; status: string }>;
  } = {},
): ExchangeAdapter {
  const defaults = {
    supportsFutures: true,
    fundingRate: null as FundingRateSnapshot | null,
    fundingHistory: [] as FundingRateSnapshot[],
    markets: [
      { symbol: 'BTC/USDT', status: 'active' },
      { symbol: 'ETH/USDT', status: 'active' },
    ],
  };
  const opts = { ...defaults, ...options };

  return {
    slug,
    name: slug,
    baseUrl: `https://${slug}.example.com`,
    capabilities: {
      supportsSpot: true,
      supportsFutures: opts.supportsFutures,
      supportsMargin: false,
      supportsWebSocket: false,
      supportsOrderBook: false,
      supportsTicker: false,
      supportsTrades: false,
    },
    initialize: jest.fn().mockResolvedValue(undefined),
    shutdown: jest.fn().mockResolvedValue(undefined),
    fetchMarkets: jest.fn().mockResolvedValue(
      opts.markets.map((m) => ({
        symbol: m.symbol,
        baseCurrency: m.symbol.split('/')[0],
        quoteCurrency: m.symbol.split('/')[1],
        takerFee: '0.001',
        makerFee: '0.001',
        minOrderSize: null,
        maxOrderSize: null,
        minPriceTick: null,
        status: m.status,
      })),
    ),
    fetchTicker: jest.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      bid: '50000',
      ask: '50001',
      last: '50000.5',
      volume24h: '1000',
      high24h: '51000',
      low24h: '49000',
      timestamp: new Date(),
    }),
    fetchOrderBook: jest.fn().mockResolvedValue({
      symbol: 'BTC/USDT',
      bids: [{ price: '50000', quantity: '1' }],
      asks: [{ price: '50001', quantity: '1' }],
      timestamp: new Date(),
    }),
    fetchTrades: jest.fn().mockResolvedValue([]),
    fetchCoinNetworkStatus: jest.fn().mockResolvedValue([]),
    fetchFundingRate: jest.fn().mockResolvedValue(opts.fundingRate),
    fetchFundingRateHistory: jest.fn().mockResolvedValue(opts.fundingHistory),
  } as unknown as ExchangeAdapter;
}

// ──────────────────── Tests ─────────────────────────────────────────────

describe('FundingRateService', () => {
  let service: FundingRateService;
  let mockAdapter: ExchangeAdapter;

  beforeEach(() => {
    mockAdapter = makeMockAdapter('binance', {
      fundingRate: {
        symbol: 'BTC/USDT:USDT',
        fundingRate: 0.0001,
        timestamp: new Date(),
        fetchedAt: new Date(),
        nextFundingTime: new Date(Date.now() + 8 * 60 * 60 * 1000),
        fundingIntervalMs: 8 * 60 * 60 * 1000,
      },
      fundingHistory: [
        {
          symbol: 'BTC/USDT:USDT',
          fundingRate: 0.0001,
          timestamp: new Date(Date.now() - 8 * 60 * 60 * 1000),
          fetchedAt: new Date(),
        },
        {
          symbol: 'BTC/USDT:USDT',
          fundingRate: 0.00015,
          timestamp: new Date(Date.now() - 16 * 60 * 60 * 1000),
          fetchedAt: new Date(),
        },
      ],
    });

    service = new FundingRateService([mockAdapter], {
      cacheTtlMs: 60_000,
      maxHistoryPerPair: 500,
    });
  });

  describe('discoverPairs', () => {
    it('discovers spot/perp pairs on futures-capable exchanges', async () => {
      const pairs = await service.discoverPairs(['binance']);

      // Should find BTC/USDT:USDT at minimum
      expect(pairs.length).toBeGreaterThan(0);

      const btcPair = pairs.find((p) => p.baseCurrency === 'BTC');
      expect(btcPair).toBeDefined();
      expect(btcPair!.exchange).toBe('binance');
      expect(btcPair!.spotSymbol).toBe('BTC/USDT');
      expect(btcPair!.perpSymbol).toBe('BTC/USDT:USDT');
    });

    it('skips exchanges without futures support', async () => {
      const spotOnlyAdapter = makeMockAdapter('kucoin', {
        supportsFutures: false,
      });
      const spotService = new FundingRateService([spotOnlyAdapter]);

      const pairs = await spotService.discoverPairs(['kucoin']);
      expect(pairs.length).toBe(0);
    });

    it('returns empty for unknown exchanges', async () => {
      const pairs = await service.discoverPairs(['nonexistent']);
      expect(pairs.length).toBe(0);
    });
  });

  describe('refreshRates', () => {
    it('fetches and caches current funding rates', async () => {
      await service.discoverPairs(['binance']);
      const rates = await service.refreshRates(['binance']);

      expect(rates.length).toBeGreaterThan(0);

      const btcRate = rates.find((r) => r.symbol.includes('BTC'));
      expect(btcRate).toBeDefined();
      expect(btcRate!.fundingRate).toBe(0.0001);
      expect(btcRate!.exchange).toBe('binance');
    });

    it('caches rates accessible via getRate', async () => {
      await service.discoverPairs(['binance']);
      await service.refreshRates(['binance']);

      const cached = service.getRate('binance', 'BTC/USDT:USDT');
      expect(cached).toBeDefined();
      expect(cached!.fundingRate).toBe(0.0001);
    });

    it('emits ratesUpdated event', async () => {
      const handler = jest.fn();
      service.on('ratesUpdated', handler);

      await service.discoverPairs(['binance']);
      await service.refreshRates(['binance']);

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].length).toBeGreaterThan(0);
    });
  });

  describe('fetchHistory', () => {
    it('fetches and stores historical funding rates', async () => {
      const history = await service.fetchHistory('binance', 'BTC/USDT:USDT', 100);

      expect(history.length).toBe(2);
      // Sorted by timestamp ascending — older first
      expect(history[0].fundingRate).toBe(0.00015);
      expect(history[1].fundingRate).toBe(0.0001);
    });

    it('merges history with existing cache', async () => {
      // First fetch
      await service.fetchHistory('binance', 'BTC/USDT:USDT', 100);

      // Mock adapter returns same data — should dedup
      const history2 = await service.fetchHistory('binance', 'BTC/USDT:USDT', 100);
      expect(history2.length).toBe(2); // Not 4
    });

    it('returns cached history for unknown exchanges', async () => {
      const history = await service.fetchHistory('nonexistent', 'BTC/USDT:USDT');
      expect(history.length).toBe(0);
    });
  });

  describe('cache management', () => {
    it('reports needsRateRefresh correctly', async () => {
      // Initially needs refresh
      expect(service.needsRateRefresh()).toBe(true);

      await service.discoverPairs(['binance']);
      await service.refreshRates(['binance']);

      // After refresh, should not need refresh immediately
      expect(service.needsRateRefresh()).toBe(false);
    });

    it('reports needsPairDiscovery correctly', () => {
      // Initially needs discovery
      expect(service.needsPairDiscovery()).toBe(true);
    });

    it('tracks history size', async () => {
      await service.fetchHistory('binance', 'BTC/USDT:USDT', 100);
      expect(service.getHistorySize()).toBe(2);
    });

    it('getAllRates returns all cached rates', async () => {
      await service.discoverPairs(['binance']);
      await service.refreshRates(['binance']);

      const allRates = service.getAllRates();
      expect(allRates.length).toBeGreaterThan(0);
    });
  });

  describe('getPairs', () => {
    it('returns pairs for known exchanges', async () => {
      await service.discoverPairs(['binance']);
      const pairs = service.getPairs('binance');
      expect(pairs.length).toBeGreaterThan(0);
    });

    it('returns empty for unknown exchanges', () => {
      const pairs = service.getPairs('nonexistent');
      expect(pairs.length).toBe(0);
    });

    it('getAllPairs returns all pairs', async () => {
      await service.discoverPairs(['binance']);
      const allPairs = service.getAllPairs();
      expect(allPairs.length).toBeGreaterThan(0);
    });
  });
});
