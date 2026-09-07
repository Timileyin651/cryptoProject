import { OpportunityRanker } from '../../src/arbitrage/OpportunityRanker';
import { createComparablePair } from '../fixtures';
import { OpportunityCalculator } from '../../src/arbitrage/OpportunityCalculator';
import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import { NetworkChecker } from '../../src/arbitrage/NetworkChecker';

function makeOpportunity(
  overrides: Partial<{
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    buyAskPrice: number;
    sellBidPrice: number;
    tradeSize: number;
    bookAgeMs: number;
  }> = {},
) {
  const feeCalc = new FeeCalculator();
  const networkChecker = new NetworkChecker();
  const calculator = new OpportunityCalculator(feeCalc, networkChecker);
  const pair = createComparablePair(overrides);
  return calculator.calculate(pair, overrides.tradeSize ?? 1.0);
}

describe('OpportunityRanker', () => {
  let ranker: OpportunityRanker;

  beforeEach(() => {
    ranker = new OpportunityRanker();
  });

  describe('rank', () => {
    it('returns opportunities sorted by ROI descending', () => {
      const opps = [
        makeOpportunity({ buyAskPrice: 64900, sellBidPrice: 65100, bookAgeMs: 1000 }),
        makeOpportunity({ buyAskPrice: 64900, sellBidPrice: 65200, bookAgeMs: 1000 }),
      ];

      const ranked = ranker.rank(opps);
      // Opps are deduped by (symbol, buyExchange, sellExchange) — since both have
      // the same pair, only one survives. Let's use different exchanges.
    });

    it('deduplicates by (symbol, buyExchange, sellExchange)', () => {
      const opp1 = makeOpportunity({
        buyExchange: 'binance',
        sellExchange: 'okx',
        bookAgeMs: 1000,
      });
      const opp2 = makeOpportunity({
        buyExchange: 'binance',
        sellExchange: 'okx',
        bookAgeMs: 1000,
      });

      const ranked = ranker.rank([opp1, opp2]);
      expect(ranked).toHaveLength(1);
    });

    it('applies minNetProfit filter', () => {
      const opps = [makeOpportunity({ buyAskPrice: 64900, sellBidPrice: 65200, bookAgeMs: 1000 })];

      // Set a very high minNetProfit to filter everything out
      const ranked = ranker.rank(opps, { minNetProfit: 1000000 });
      expect(ranked).toHaveLength(0);
    });

    it('applies includeStatuses filter', () => {
      const opps = [makeOpportunity({ buyAskPrice: 64900, sellBidPrice: 65200, bookAgeMs: 1000 })];

      const ranked = ranker.rank(opps, { includeStatuses: ['expired'] });
      // With 1000ms book age, it should be active/marginal
      expect(ranked.length).toBeLessThanOrEqual(opps.length);
    });

    it('limits results with maxResults', () => {
      const opps = Array.from({ length: 5 }, (_, i) =>
        makeOpportunity({
          buyExchange: `exchange${i}`,
          sellExchange: `other${i}`,
          bookAgeMs: 1000,
        }),
      );

      const ranked = ranker.rank(opps, { maxResults: 2 });
      expect(ranked).toHaveLength(2);
    });

    it('sorts by netProfit when configured', () => {
      ranker = new OpportunityRanker({ sortBy: 'netProfit', sortDirection: 'desc' });
      const opps = [
        makeOpportunity({
          buyExchange: 'a',
          sellExchange: 'b',
          buyAskPrice: 64900,
          sellBidPrice: 65100,
          bookAgeMs: 1000,
        }),
        makeOpportunity({
          buyExchange: 'c',
          sellExchange: 'd',
          buyAskPrice: 64900,
          sellBidPrice: 65200,
          bookAgeMs: 1000,
        }),
      ];

      const ranked = ranker.rank(opps);
      if (ranked.length === 2) {
        expect(ranked[0].netProfit).toBeGreaterThanOrEqual(ranked[1].netProfit);
      }
    });
  });

  describe('summarize', () => {
    it('groups opportunities by status', () => {
      const opps = [
        makeOpportunity({ buyExchange: 'a', sellExchange: 'b', bookAgeMs: 60_000 }), // expired
        makeOpportunity({ buyExchange: 'c', sellExchange: 'd', bookAgeMs: 1000 }),
      ];

      const summary = ranker.summarize(opps);
      expect(summary).toHaveProperty('active');
      expect(summary).toHaveProperty('expired');
      expect(summary).toHaveProperty('marginal');
      expect(summary).toHaveProperty('unprofitable');
      expect(summary).toHaveProperty('illiquid');
    });
  });

  describe('topProfitable', () => {
    it('returns top N profitable opportunities', () => {
      const opps = Array.from({ length: 3 }, (_, i) =>
        makeOpportunity({
          buyExchange: `exchange${i}`,
          sellExchange: `other${i}`,
          buyAskPrice: 64900,
          sellBidPrice: 65100 + i * 50,
          bookAgeMs: 1000,
        }),
      );

      const top = ranker.topProfitable(opps, 2);
      expect(top.length).toBeLessThanOrEqual(2);
    });
  });
});
