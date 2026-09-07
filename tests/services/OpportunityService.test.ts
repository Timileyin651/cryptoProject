import { OpportunityService } from '../../src/services/OpportunityService';

// Mock the Sequelize models
jest.mock('../../src/models/OpportunityRecord', () => {
  const mockData = [
    {
      id: 1,
      opportunity_type: 'spot',
      status: 'active',
      symbol: 'BTC/USDT',
      base_currency: 'BTC',
      quote_currency: 'USDT',
      buy_exchange_id: 1,
      buy_symbol: 'BTC/USDT',
      sell_exchange_id: 2,
      sell_symbol: 'BTC/USDT',
      buy_price: '50000',
      sell_price: '50500',
      gross_spread: '500',
      gross_spread_pct: '0.01',
      buy_fee: '50',
      sell_fee: '50.5',
      total_fees: '100.5',
      buy_fee_rate: '0.001',
      sell_fee_rate: '0.001',
      withdrawal_fee: '0.0002',
      network_fee_quote: '10',
      confirmation_time_sec: 600,
      withdrawal_available: true,
      deposit_available: true,
      network: 'btc',
      same_exchange: false,
      buy_slippage: '0.001',
      sell_slippage: '0.001',
      total_slippage: '0.002',
      buy_vwap: '50005',
      sell_vwap: '50495',
      liquidity_executable: true,
      buy_depth: '50',
      sell_depth: '50',
      buy_fill_ratio: '1',
      sell_fill_ratio: '1',
      total_cost: '120',
      net_profit: '380',
      roi: '0.0076',
      trade_size_base: '1',
      capital_required: '50100',
      perp_symbol: null,
      spot_price: null,
      perp_price: null,
      basis: null,
      basis_pct: null,
      current_funding_rate: null,
      funding_rate_apr: null,
      funding_interval_ms: null,
      position_side: null,
      leverage: null,
      expected_funding_per_interval: null,
      intervals_in_horizon: null,
      total_expected_funding: null,
      basis_convergence_estimate: null,
      total_estimated_return: null,
      estimated_return_pct: null,
      net_return_estimate: null,
      net_return_pct: null,
      is_estimate: false,
      calculated_at: new Date(),
      data_age_ms: 100,
      scan_id: null,
      buy_exchange_slug: 'binance',
      sell_exchange_slug: 'bybit',
      buyExchange: { id: 1, name: 'Binance', slug: 'binance', logo_url: null },
      sellExchange: { id: 2, name: 'Bybit', slug: 'bybit', logo_url: null },
      update: jest.fn(),
      reload: jest.fn().mockResolvedValue(this),
      toJSON() {
        return { ...this };
      },
    },
  ];

  return {
    OpportunityRecord: {
      findAndCountAll: jest.fn().mockResolvedValue({ rows: mockData, count: mockData.length }),
      findByPk: jest.fn().mockResolvedValue(mockData[0]),
      findOne: jest.fn().mockResolvedValue(mockData[0]),
      count: jest.fn().mockResolvedValue(1),
      create: jest.fn().mockImplementation((data) => Promise.resolve({ ...mockData[0], ...data })),
      destroy: jest.fn().mockResolvedValue(0),
      findAll: jest.fn().mockResolvedValue(mockData),
    },
  };
});

jest.mock('../../src/models/OpportunitySnapshot', () => ({
  OpportunitySnapshot: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    create: jest.fn().mockImplementation((data) => Promise.resolve({ id: 1, ...data })),
  },
}));

jest.mock('../../src/models/OpportunityLeg', () => ({
  OpportunityLeg: {
    bulkCreate: jest.fn().mockImplementation((data) => Promise.resolve(data)),
  },
}));

jest.mock('../../src/models/Exchange', () => ({
  Exchange: {},
}));

describe('OpportunityService', () => {
  let service: OpportunityService;

  beforeEach(() => {
    service = new OpportunityService();
  });

  describe('query', () => {
    it('returns paginated results with default params', async () => {
      const result = await service.query();

      expect(result.data).toBeDefined();
      expect(result.pagination).toBeDefined();
      expect(result.pagination.page).toBe(1);
      expect(result.pagination.limit).toBe(25);
      expect(result.pagination.total).toBeGreaterThan(0);
    });

    it('applies pagination params', async () => {
      const result = await service.query({ page: 2, limit: 10 });

      expect(result.pagination.page).toBe(2);
      expect(result.pagination.limit).toBe(10);
    });

    it('applies status filter', async () => {
      const result = await service.query({ status: 'active' });
      expect(result.data).toBeDefined();
    });

    it('applies opportunityType filter', async () => {
      const result = await service.query({ opportunityType: 'spot' });
      expect(result.data).toBeDefined();
    });

    it('applies search filter', async () => {
      const result = await service.query({ search: 'BTC' });
      expect(result.data).toBeDefined();
    });

    it('applies profit range filter', async () => {
      const result = await service.query({ minProfit: 100, maxProfit: 500 });
      expect(result.data).toBeDefined();
    });

    it('clamps limit to max 100', async () => {
      const result = await service.query({ limit: 500 });
      expect(result.pagination.limit).toBe(100);
    });

    it('clamps limit to min 1', async () => {
      const result = await service.query({ limit: 0 });
      expect(result.pagination.limit).toBe(1);
    });

    it('calculates hasNext and hasPrev', async () => {
      const result = await service.query({ page: 1, limit: 50 });
      expect(typeof result.pagination.hasNext).toBe('boolean');
      expect(typeof result.pagination.hasPrev).toBe('boolean');
      expect(result.pagination.hasPrev).toBe(false);
    });
  });

  describe('getById', () => {
    it('returns an opportunity by ID', async () => {
      const result = await service.getById(1);
      expect(result).toBeDefined();
      expect(result.id).toBe(1);
    });
  });

  describe('getHistory', () => {
    it('returns paginated history', async () => {
      const result = await service.getHistory(1);
      expect(result.data).toBeDefined();
      expect(result.pagination).toBeDefined();
    });
  });

  describe('getStats', () => {
    it('returns aggregate stats', async () => {
      const stats = await service.getStats();

      expect(stats.totals).toBeDefined();
      expect(stats.byType).toBeDefined();
      expect(stats.profitability).toBeDefined();
      expect(Array.isArray(stats.recent)).toBe(true);
    });

    it('filters by opportunity type', async () => {
      const stats = await service.getStats({ opportunityType: 'spot' });
      expect(stats.totals).toBeDefined();
    });

    it('filters by date', async () => {
      const stats = await service.getStats({ since: '2024-01-01' });
      expect(stats.totals).toBeDefined();
    });
  });

  describe('upsert', () => {
    it('creates a new record when no recent duplicate', async () => {
      const { OpportunityRecord } = require('../../src/models/OpportunityRecord');
      OpportunityRecord.findOne.mockResolvedValue(null);

      const result = await service.upsert({
        opportunity_type: 'spot',
        symbol: 'BTC/USDT',
        buy_exchange_slug: 'binance',
        sell_exchange_slug: 'bybit',
      });

      expect(result).toBeDefined();
    });
  });

  describe('createSnapshot', () => {
    it('creates a snapshot for an opportunity', async () => {
      const snapshot = await service.createSnapshot(1);
      expect(snapshot).toBeDefined();
    });
  });

  describe('createLegs', () => {
    it('bulk creates legs', async () => {
      const legs = await service.createLegs(1, [
        {
          leg_side: 'buy',
          exchange_slug: 'binance',
          exchange_id: 1,
          symbol: 'BTC/USDT',
          price: '50000',
          quantity: '1',
          notional: '50000',
          fee: '50',
          fee_rate: '0.001',
          vwap: '50000',
          slippage: '0',
          depth: '50',
          fill_ratio: '1',
        },
        {
          leg_side: 'sell',
          exchange_slug: 'bybit',
          exchange_id: 2,
          symbol: 'BTC/USDT',
          price: '50500',
          quantity: '1',
          notional: '50500',
          fee: '50.5',
          fee_rate: '0.001',
          vwap: '50500',
          slippage: '0',
          depth: '50',
          fill_ratio: '1',
        },
      ]);
      expect(legs).toBeDefined();
      expect(legs.length).toBe(2);
    });
  });

  describe('bulkUpsert', () => {
    it('bulk upserts multiple records', async () => {
      const count = await service.bulkUpsert([
        {
          opportunity_type: 'spot',
          symbol: 'BTC/USDT',
          buy_exchange_slug: 'binance',
          sell_exchange_slug: 'bybit',
        },
      ]);
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('pruneOld', () => {
    it('prunes old records', async () => {
      const deleted = await service.pruneOld(30);
      expect(typeof deleted).toBe('number');
    });
  });
});
