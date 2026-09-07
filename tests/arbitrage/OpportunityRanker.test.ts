import { OpportunityRanker } from '../../src/arbitrage/OpportunityRanker';
import type { ArbitrageOpportunity, OpportunityStatus } from '../../src/arbitrage/types';

function makeOpp(overrides: Partial<ArbitrageOpportunity> = {}): ArbitrageOpportunity {
  return {
    id: 'test-id',
    symbol: 'BTC/USDT',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    arbitrageType: 'direct',
    direction: { buyExchange: 'binance', sellExchange: 'bybit' },
    buyPrice: 50000,
    sellPrice: 50500,
    grossSpread: 500,
    grossSpreadPct: 0.01,
    buyFee: 50,
    sellFee: 50.5,
    totalTradingFees: 100.5,
    networkCosts: {
      withdrawalCost: 10,
      withdrawalFee: 0.0002,
      networkFee: 0,
      confirmationTimeSec: 600,
      withdrawalAvailable: true,
      depositAvailable: true,
      network: 'btc',
      sameExchange: false,
    },
    slippage: {
      buySlippage: 0.001,
      sellSlippage: 0.001,
      totalSlippage: 0.002,
      buyVwap: 50005,
      sellVwap: 50495,
      buyBestPrice: 50000,
      sellBestPrice: 50500,
      buyLevelsConsumed: 2,
      sellLevelsConsumed: 2,
      buyFillRatio: 1.0,
      sellFillRatio: 1.0,
    },
    liquidity: {
      executable: true,
      buyDepth: 50,
      sellDepth: 50,
      buyFillRatio: 1.0,
      sellFillRatio: 1.0,
      buyWorstPrice: 50002,
      sellWorstPrice: 50498,
    },
    totalCost: 120,
    netProfit: 380,
    roi: 0.0076,
    tradeSizeBase: 1.0,
    capitalRequired: 50100,
    calculatedAt: Date.now(),
    bookAgeMs: 500,
    status: 'active' as OpportunityStatus,
    ...overrides,
  };
}

describe('OpportunityRanker', () => {
  let ranker: OpportunityRanker;

  beforeEach(() => {
    ranker = new OpportunityRanker();
  });

  describe('rank', () => {
    it('filters by status', () => {
      const opps = [
        makeOpp({ status: 'active', id: '1' }),
        makeOpp({ status: 'unprofitable', id: '2' }),
        makeOpp({ status: 'marginal', id: '3' }),
      ];

      const result = ranker.rank(opps, { includeStatuses: ['active'] });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('filters by minimum net profit', () => {
      const opps = [
        makeOpp({ netProfit: 100, id: '1' }),
        makeOpp({ netProfit: 50, id: '2' }),
        makeOpp({ netProfit: 10, id: '3' }),
      ];

      const result = ranker.rank(opps, { minNetProfit: 60 });
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('1');
    });

    it('sorts by ROI descending by default', () => {
      const opps = [
        makeOpp({
          roi: 0.001,
          id: 'low',
          direction: { buyExchange: 'binance', sellExchange: 'bybit' },
        }),
        makeOpp({
          roi: 0.01,
          id: 'high',
          direction: { buyExchange: 'binance', sellExchange: 'okx' },
        }),
        makeOpp({
          roi: 0.005,
          id: 'mid',
          direction: { buyExchange: 'bybit', sellExchange: 'okx' },
        }),
      ];

      const result = ranker.rank(opps);
      expect(result[0].id).toBe('high');
      expect(result[1].id).toBe('mid');
      expect(result[2].id).toBe('low');
    });

    it('sorts by netProfit ascending', () => {
      const opps = [
        makeOpp({
          netProfit: 100,
          id: 'high',
          direction: { buyExchange: 'binance', sellExchange: 'bybit' },
        }),
        makeOpp({
          netProfit: 10,
          id: 'low',
          direction: { buyExchange: 'binance', sellExchange: 'okx' },
        }),
      ];

      const result = ranker.rank(opps, {
        sortBy: 'netProfit',
        sortDirection: 'asc',
      });
      expect(result[0].id).toBe('low');
      expect(result[1].id).toBe('high');
    });

    it('limits results', () => {
      const exchanges = ['binance', 'bybit', 'okx', 'kucoin', 'gateio', 'mexc', 'bitget'];
      const opps = Array.from({ length: 20 }, (_, i) => {
        const buyIdx = i % exchanges.length;
        const sellIdx = (i + 1) % exchanges.length;
        return makeOpp({
          roi: 0.01 - i * 0.001,
          id: String(i),
          direction: { buyExchange: exchanges[buyIdx], sellExchange: exchanges[sellIdx] },
        });
      });

      const result = ranker.rank(opps, { maxResults: 5 });
      expect(result.length).toBe(5);
    });

    it('deduplicates by (symbol, buyExchange, sellExchange)', () => {
      const opps = [
        makeOpp({ id: '1', roi: 0.005 }),
        makeOpp({ id: '2', roi: 0.01 }), // same pair, higher ROI
        makeOpp({
          id: '3',
          roi: 0.003,
          direction: { buyExchange: 'bybit', sellExchange: 'binance' },
        }),
      ];

      const result = ranker.rank(opps);
      // First two have same pair, should deduplicate to keep higher ROI
      expect(result.length).toBe(2);
    });
  });

  describe('summarize', () => {
    it('summarizes by status', () => {
      const opps = [
        makeOpp({ status: 'active', netProfit: 100, roi: 0.01 }),
        makeOpp({ status: 'active', netProfit: 50, roi: 0.005 }),
        makeOpp({ status: 'unprofitable', netProfit: -10, roi: -0.001 }),
      ];

      const summary = ranker.summarize(opps);
      expect(summary.active.count).toBe(2);
      expect(summary.active.bestRoi).toBe(0.01);
      expect(summary.active.bestNetProfit).toBe(100);
      expect(summary.active.totalNetProfit).toBe(150);
      expect(summary.unprofitable.count).toBe(1);
    });

    it('handles empty input', () => {
      const summary = ranker.summarize([]);
      expect(summary.active.count).toBe(0);
      expect(summary.illiquid.count).toBe(0);
    });
  });

  describe('topProfitable', () => {
    it('returns top N most profitable', () => {
      const opps = [
        makeOpp({
          status: 'active',
          netProfit: 10,
          id: '1',
          direction: { buyExchange: 'binance', sellExchange: 'bybit' },
        }),
        makeOpp({
          status: 'marginal',
          netProfit: 50,
          id: '2',
          direction: { buyExchange: 'binance', sellExchange: 'okx' },
        }),
        makeOpp({
          status: 'active',
          netProfit: 100,
          id: '3',
          direction: { buyExchange: 'bybit', sellExchange: 'okx' },
        }),
        makeOpp({
          status: 'unprofitable',
          netProfit: 200,
          id: '4',
          direction: { buyExchange: 'kucoin', sellExchange: 'gateio' },
        }),
      ];

      const result = ranker.topProfitable(opps, 2);
      expect(result.length).toBe(2);
      // Should include only active/marginal, sorted by netProfit desc
      expect(result[0].id).toBe('3');
      expect(result[1].id).toBe('2');
    });
  });

  describe('bestRiskAdjusted', () => {
    it('returns risk-adjusted ranking', () => {
      const opps = [
        makeOpp({
          status: 'active',
          netProfit: 100,
          roi: 0.01,
          bookAgeMs: 1000,
          liquidity: {
            executable: true,
            buyDepth: 50,
            sellDepth: 50,
            buyFillRatio: 1.0,
            sellFillRatio: 1.0,
            buyWorstPrice: 50002,
            sellWorstPrice: 50498,
          },
          id: 'fresh',
        }),
        makeOpp({
          status: 'active',
          netProfit: 100,
          roi: 0.01,
          bookAgeMs: 25000,
          liquidity: {
            executable: true,
            buyDepth: 50,
            sellDepth: 50,
            buyFillRatio: 1.0,
            sellFillRatio: 1.0,
            buyWorstPrice: 50002,
            sellWorstPrice: 50498,
          },
          id: 'stale',
        }),
      ];

      const result = ranker.bestRiskAdjusted(opps, 2);
      expect(result.length).toBe(2);
      // Fresh data should rank higher
      expect(result[0].id).toBe('fresh');
    });
  });
});
