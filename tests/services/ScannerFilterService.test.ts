import { ScannerFilterService, FILTER_FEATURE_MAP } from '../../src/services/ScannerFilterService';
import { STABLECOIN_QUOTES, FIAT_QUOTES } from '../../src/models/ScannerPreference';

// Mock the subscription service
jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    resolvePlan: jest.fn().mockResolvedValue({
      id: 1,
      slug: 'free',
      name: 'Free',
      max_scans_per_day: 10,
      max_saved_preferences: 3,
    }),
  },
}));

// Mock the ScannerPreference model
jest.mock('../../src/models/ScannerPreference', () => {
  const actual = jest.requireActual('../../src/models/ScannerPreference');
  const mockPrefs: any[] = [];
  let nextId = 1;

  return {
    ...actual,
    ScannerPreference: {
      findAll: jest.fn().mockImplementation(() => Promise.resolve(mockPrefs)),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          mockPrefs.find((p) => p.id === where.id && p.user_id === where.user_id) ?? null,
        );
      }),
      count: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(mockPrefs.filter((p) => p.user_id === where.user_id).length);
      }),
      create: jest.fn().mockImplementation((data: any) => {
        const pref = { id: nextId++, ...data, reload: jest.fn().mockResolvedValue(this) };
        mockPrefs.push(pref);
        return Promise.resolve(pref);
      }),
      update: jest.fn().mockResolvedValue([1]),
      destroy: jest.fn().mockResolvedValue(1),
    },
  };
});

describe('ScannerFilterService', () => {
  let service: ScannerFilterService;

  beforeEach(() => {
    service = new ScannerFilterService();
  });

  describe('resolveLimits', () => {
    it('returns free tier limits for free users', async () => {
      const limits = await service.resolveLimits(1);
      expect(limits.maxPageSize).toBe(25);
      expect(limits.allowAdvancedFilters).toBe(false);
      expect(limits.allowSpreadFilters).toBe(false);
      expect(limits.maxSavedPreferences).toBe(3);
    });
  });

  describe('enforceLimits', () => {
    it('strips advanced filters for free users', async () => {
      const { sanitized, restrictions } = await service.enforceLimits(1, {
        minSpread: 0.001,
        maxProfit: 100,
        network: 'btc',
        minRoi: 0.01,
      });

      expect(sanitized.minSpread).toBeUndefined();
      expect(sanitized.maxProfit).toBeUndefined();
      expect(sanitized.network).toBeUndefined();
      expect(sanitized.minRoi).toBeUndefined();
      expect(restrictions.length).toBe(4);
    });

    it('allows basic filters for free users', async () => {
      const { sanitized } = await service.enforceLimits(1, {
        symbol: 'BTC/USDT',
        exchange: 'binance',
        status: 'active',
        search: 'btc',
      });

      expect(sanitized.symbol).toBe('BTC/USDT');
      expect(sanitized.exchange).toBe('binance');
      expect(sanitized.status).toBe('active');
      expect(sanitized.search).toBe('btc');
    });

    it('clamps page size to plan limit', async () => {
      const { sanitized } = await service.enforceLimits(1, {
        limit: 200,
      });

      expect(sanitized.limit).toBe(25); // free tier max
    });
  });

  describe('validateFilters', () => {
    it('returns errors for restricted filters on free plan', async () => {
      const result = await service.validateFilters(1, {
        minSpread: 0.001,
        network: 'btc',
        stablecoinPairs: true,
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(3);
    });

    it('returns no errors for basic filters on free plan', async () => {
      const result = await service.validateFilters(1, {
        symbol: 'BTC/USDT',
        exchange: 'binance',
      });

      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });
  });

  describe('filtersToQueryOptions', () => {
    it('converts basic filters', () => {
      const options = service.filtersToQueryOptions({
        symbol: 'BTC/USDT',
        exchange: 'binance',
        status: 'active',
      });

      expect(options.symbol).toBe('BTC/USDT');
      expect(options.exchange).toBe('binance');
      expect(options.status).toBe('active');
    });

    it('converts advanced filters', () => {
      const options = service.filtersToQueryOptions({
        minSpread: 0.001,
        maxSpread: 0.05,
        minProfit: 10,
        minRoi: 0.01,
      });

      expect(options.minSpread).toBe(0.001);
      expect(options.maxSpread).toBe(0.05);
      expect(options.minProfit).toBe(10);
      expect(options.minRoi).toBe(0.01);
    });

    it('sets _stablecoinFilter flag', () => {
      const options = service.filtersToQueryOptions({
        stablecoinPairs: true,
      });

      expect((options as any)._stablecoinFilter).toBe(true);
    });

    it('sets _fiatFilter flag', () => {
      const options = service.filtersToQueryOptions({
        fiatPairs: true,
      });

      expect((options as any)._fiatFilter).toBe(true);
    });
  });

  describe('isStablecoin', () => {
    it('identifies stablecoins', () => {
      expect(service.isStablecoin('USDT')).toBe(true);
      expect(service.isStablecoin('usdc')).toBe(true);
      expect(service.isStablecoin('BTC')).toBe(false);
      expect(service.isStablecoin('ETH')).toBe(false);
    });
  });

  describe('isFiat', () => {
    it('identifies fiat currencies', () => {
      expect(service.isFiat('USD')).toBe(true);
      expect(service.isFiat('eur')).toBe(true);
      expect(service.isFiat('BTC')).toBe(false);
      expect(service.isFiat('USDT')).toBe(false);
    });
  });

  describe('STABLECOIN_QUOTES', () => {
    it('contains major stablecoins', () => {
      expect(STABLECOIN_QUOTES.has('USDT')).toBe(true);
      expect(STABLECOIN_QUOTES.has('USDC')).toBe(true);
      expect(STABLECOIN_QUOTES.has('BUSD')).toBe(true);
      expect(STABLECOIN_QUOTES.has('DAI')).toBe(true);
    });
  });

  describe('FIAT_QUOTES', () => {
    it('contains major fiat currencies', () => {
      expect(FIAT_QUOTES.has('USD')).toBe(true);
      expect(FIAT_QUOTES.has('EUR')).toBe(true);
      expect(FIAT_QUOTES.has('GBP')).toBe(true);
      expect(FIAT_QUOTES.has('JPY')).toBe(true);
    });
  });

  describe('FILTER_FEATURE_MAP', () => {
    it('maps all advanced filters to feature keys', () => {
      expect(FILTER_FEATURE_MAP.minSpread).toBeDefined();
      expect(FILTER_FEATURE_MAP.maxProfit).toBeDefined();
      expect(FILTER_FEATURE_MAP.network).toBeDefined();
      expect(FILTER_FEATURE_MAP.stablecoinPairs).toBeDefined();
      expect(FILTER_FEATURE_MAP.fiatPairs).toBeDefined();
    });
  });
});
