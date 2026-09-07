// Mock the models before importing the service
jest.mock('../../src/models/AnalyticsBucket', () => {
  const mockBuckets: any[] = [];
  return {
    AnalyticsBucket: {
      findAll: jest.fn().mockResolvedValue(mockBuckets),
      findOne: jest.fn().mockResolvedValue(null),
      sequelize: { query: jest.fn().mockResolvedValue([{}, {}]) },
    },
  };
});

jest.mock('../../src/models/FundingRateHistory', () => ({
  FundingRateHistory: {
    create: jest.fn().mockResolvedValue({}),
  },
}));

jest.mock('../../src/models/OpportunityRecord', () => ({
  OpportunityRecord: {},
}));

jest.mock('../../src/models/OpportunitySnapshot', () => ({
  OpportunitySnapshot: {},
}));

import type { ChartRange } from '../../src/services/AnalyticsQueryService';
import { AnalyticsQueryService } from '../../src/services/AnalyticsQueryService';

describe('AnalyticsQueryService', () => {
  let service: AnalyticsQueryService;

  beforeEach(() => {
    service = new AnalyticsQueryService();
  });

  describe('getSpreadHistory', () => {
    it('returns empty chart for no data', async () => {
      const result = await service.getSpreadHistory('24h');
      expect(result.chart).toEqual([]);
      expect(result.stats.dataPoints).toBe(0);
      expect(result.stats.currentSpread).toBe(0);
    });

    it('accepts different ranges', async () => {
      for (const range of ['1h', '6h', '24h', '7d', '30d'] as ChartRange[]) {
        const result = await service.getSpreadHistory(range);
        expect(result.chart).toBeDefined();
        expect(result.stats).toBeDefined();
      }
    });

    it('accepts custom range', async () => {
      const result = await service.getSpreadHistory('custom', undefined, 6 * 60 * 60 * 1000);
      expect(result.chart).toBeDefined();
    });

    it('accepts symbol filter', async () => {
      const result = await service.getSpreadHistory('24h', 'BTC/USDT');
      expect(result.chart).toBeDefined();
    });
  });

  describe('getProfitHistory', () => {
    it('returns empty chart for no data', async () => {
      const result = await service.getProfitHistory('24h');
      expect(result.chart).toEqual([]);
      expect(result.stats.totalProfit).toBe(0);
    });
  });

  describe('getPriceHistory', () => {
    it('returns empty chart for no data', async () => {
      const result = await service.getPriceHistory('24h');
      expect(result.chart).toEqual([]);
      expect(result.stats.currentPrice).toBe(0);
    });
  });

  describe('getFundingRateHistory', () => {
    it('returns empty chart for no data', async () => {
      const result = await service.getFundingRateHistory('24h');
      expect(result.chart).toEqual([]);
      expect(result.stats.currentRate).toBe(0);
      expect(result.stats.apr).toBe(0);
    });

    it('accepts exchange filter', async () => {
      const result = await service.getFundingRateHistory('24h', 'binance');
      expect(result.chart).toBeDefined();
    });
  });

  describe('getFrequencyHistory', () => {
    it('returns empty chart for no data', async () => {
      const result = await service.getFrequencyHistory('24h');
      expect(result.chart).toEqual([]);
      expect(result.stats.totalOpportunities).toBe(0);
    });
  });

  describe('getOverview', () => {
    it('returns all chart types', async () => {
      const result = await service.getOverview('24h');
      expect(result.spread).toBeDefined();
      expect(result.profit).toBeDefined();
      expect(result.price).toBeDefined();
      expect(result.frequency).toBeDefined();
      expect(result.range).toBe('24h');
    });
  });
});
