import { FundingArbitrageEngine } from '../../src/funding/FundingArbitrageEngine';
import { createMockExchangeAdapter } from '../fixtures';

describe('FundingArbitrageEngine', () => {
  let engine: FundingArbitrageEngine;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('creates engine with default config', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);

      expect(engine).toBeDefined();
      expect(engine.isRunning()).toBe(false);
    });

    it('accepts custom config', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any], {
        tradeSize: 2.0,
        holdingHorizonHours: 48,
        minFundingRate: 0.001,
      });

      expect(engine).toBeDefined();
    });
  });

  describe('getters', () => {
    it('getFeeCalculator returns FeeCalculator instance', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      expect(engine.getFeeCalculator()).toBeDefined();
    });

    it('getBasisCalculator returns BasisSpreadCalculator instance', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      expect(engine.getBasisCalculator()).toBeDefined();
    });

    it('getFundingRateService returns FundingRateService instance', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      expect(engine.getFundingRateService()).toBeDefined();
    });

    it('getLastScanResult returns null initially', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      expect(engine.getLastScanResult()).toBeNull();
    });
  });

  describe('stop', () => {
    it('sets running to false', async () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      await engine.stop();
      expect(engine.isRunning()).toBe(false);
    });
  });

  describe('updateConfig', () => {
    it('updates config at runtime', () => {
      const adapter = createMockExchangeAdapter({ slug: 'binance', fundingRate: 0.0001 });
      engine = new FundingArbitrageEngine([adapter as any]);
      engine.updateConfig({ tradeSize: 5.0 });
      // Config updated — no error thrown
    });
  });
});
