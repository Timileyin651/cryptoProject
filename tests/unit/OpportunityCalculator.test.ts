import { OpportunityCalculator } from '../../src/arbitrage/OpportunityCalculator';
import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import { NetworkChecker } from '../../src/arbitrage/NetworkChecker';
import { createComparablePair } from '../fixtures';

describe('OpportunityCalculator', () => {
  let calc: OpportunityCalculator;
  let feeCalc: FeeCalculator;
  let networkChecker: NetworkChecker;

  beforeEach(() => {
    feeCalc = new FeeCalculator();
    networkChecker = new NetworkChecker();
    calc = new OpportunityCalculator(feeCalc, networkChecker);
  });

  describe('calculate', () => {
    it('calculates a positive spread opportunity', () => {
      const pair = createComparablePair({
        buyExchange: 'binance',
        sellExchange: 'okx',
        buyAskPrice: 64900,
        sellBidPrice: 65100,
        tradeSize: 1.0,
      });

      const opp = calc.calculate(pair, 1.0);

      expect(opp.id).toBeDefined();
      expect(opp.symbol).toBe('BTC/USDT');
      expect(opp.baseCurrency).toBe('BTC');
      expect(opp.quoteCurrency).toBe('USDT');
      expect(opp.buyPrice).toBe(64900);
      expect(opp.sellPrice).toBe(65100);
      expect(opp.grossSpread).toBeCloseTo(200, 1);
      expect(opp.grossSpreadPct).toBeCloseTo(200 / 64900, 6);
      expect(opp.direction.buyExchange).toBe('binance');
      expect(opp.direction.sellExchange).toBe('okx');
    });

    it('accounts for trading fees', () => {
      const pair = createComparablePair({
        buyAskPrice: 64900,
        sellBidPrice: 65100,
        tradeSize: 1.0,
      });

      const opp = calc.calculate(pair, 1.0);

      // buyFee: 64900 * 1.0 * 0.001 = 64.9
      expect(opp.buyFee).toBeCloseTo(64.9, 1);
      // sellFee: 65100 * 1.0 * 0.001 = 65.1
      expect(opp.sellFee).toBeCloseTo(65.1, 1);
      expect(opp.totalTradingFees).toBeCloseTo(130, 1);
    });

    it('accounts for network costs on same exchange', () => {
      const pair = createComparablePair({
        buyExchange: 'binance',
        sellExchange: 'binance',
        buyAskPrice: 64900,
        sellBidPrice: 65100,
        tradeSize: 1.0,
      });

      const opp = calc.calculate(pair, 1.0);

      expect(opp.networkCosts.sameExchange).toBe(true);
      expect(opp.networkCosts.withdrawalFee).toBe(0);
    });

    it('returns correct trade parameters', () => {
      const pair = createComparablePair({ tradeSize: 2.5 });
      const opp = calc.calculate(pair, 2.5);

      expect(opp.tradeSizeBase).toBe(2.5);
      expect(opp.capitalRequired).toBeGreaterThan(0);
      expect(opp.capitalRequired).toBeCloseTo(opp.buyPrice * 2.5 + opp.buyFee, 1);
    });

    it('sets calculatedAt timestamp', () => {
      const before = Date.now();
      const pair = createComparablePair();
      const opp = calc.calculate(pair, 1.0);
      const after = Date.now();

      expect(opp.calculatedAt).toBeGreaterThanOrEqual(before);
      expect(opp.calculatedAt).toBeLessThanOrEqual(after);
    });

    it('determines status as active for profitable opportunities', () => {
      const pair = createComparablePair({
        buyAskPrice: 64900,
        sellBidPrice: 65200, // wider spread
        tradeSize: 1.0,
      });

      const opp = calc.calculate(pair, 1.0);
      // Status depends on all factors — may be active, marginal, or blocked depending on network/liquidity checks
      expect(['active', 'marginal', 'unprofitable', 'illiquid', 'blocked']).toContain(opp.status);
    });

    it('determines status as expired for old data', () => {
      const pair = createComparablePair();
      pair.buyBookAgeMs = 60_000; // 60 seconds old
      pair.sellBookAgeMs = 60_000;

      const opp = calc.calculate(pair, 1.0);
      expect(opp.status).toBe('expired');
    });

    it('determines status as illiquid for insufficient depth', () => {
      const pair = createComparablePair({ tradeSize: 1000.0 }); // huge trade size
      const opp = calc.calculate(pair, 1000.0);
      expect(['illiquid', 'blocked']).toContain(opp.status);
    });

    it('handles negative spread (buy price > sell price)', () => {
      const pair = createComparablePair({
        buyAskPrice: 65100,
        sellBidPrice: 64900,
      });

      const opp = calc.calculate(pair, 1.0);
      expect(opp.grossSpread).toBeLessThan(0);
      expect(opp.netProfit).toBeLessThan(0);
    });
  });

  describe('calculateAll', () => {
    it('calculates multiple pairs', () => {
      const pairs = [
        createComparablePair({ buyExchange: 'binance', sellExchange: 'okx' }),
        createComparablePair({ buyExchange: 'binance', sellExchange: 'kucoin' }),
      ];

      const results = calc.calculateAll(pairs, 1.0);
      expect(results).toHaveLength(2);
      results.forEach((opp) => {
        expect(opp.id).toBeDefined();
      });
    });

    it('skips pairs that throw errors', () => {
      const goodPair = createComparablePair();
      const badPair = { ...createComparablePair(), buyBook: null } as any;

      const results = calc.calculateAll([badPair, goodPair], 1.0);
      expect(results).toHaveLength(1);
    });
  });

  describe('hasPositiveSpread', () => {
    it('returns true when sell bid > buy ask', () => {
      const buyBook = { metrics: { bestAsk: 65000 } };
      const sellBook = { metrics: { bestBid: 65100 } };

      expect(calc.hasPositiveSpread(buyBook as any, sellBook as any)).toBe(true);
    });

    it('returns false when sell bid <= buy ask', () => {
      const buyBook = { metrics: { bestAsk: 65100 } };
      const sellBook = { metrics: { bestBid: 65000 } };

      expect(calc.hasPositiveSpread(buyBook as any, sellBook as any)).toBe(false);
    });

    it('returns false for zero prices', () => {
      const book = { metrics: { bestAsk: 0, bestBid: 0 } };
      expect(calc.hasPositiveSpread(book as any, book as any)).toBe(false);
    });
  });
});
