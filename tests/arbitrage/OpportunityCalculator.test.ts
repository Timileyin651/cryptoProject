import { OpportunityCalculator } from '../../src/arbitrage/OpportunityCalculator';
import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import { NetworkChecker } from '../../src/arbitrage/NetworkChecker';
import { CrossExchangeLiquidityChecker } from '../../src/arbitrage/LiquidityChecker';
import type { ComparablePair } from '../../src/arbitrage/types';
import type { NormalizedBookWithMetrics } from '../../src/marketdata/orderbook/OrderBookNormalizer';

function makeBook(
  exchange: string,
  bids: Array<[number, number]>,
  asks: Array<[number, number]>,
  symbol = 'BTC/USDT',
): NormalizedBookWithMetrics {
  const now = Date.now();
  let bidCum = 0;
  const bidDepth = bids.map(([price, qty]) => {
    bidCum += qty;
    return { price, quantity: qty, cumulative: bidCum };
  });

  let askCum = 0;
  const askDepth = asks.map(([price, qty]) => {
    askCum += qty;
    return { price, quantity: qty, cumulative: askCum };
  });

  const bestBid = bids.length > 0 ? bids[0][0] : 0;
  const bestAsk = asks.length > 0 ? asks[0][0] : 0;
  const spread = bestAsk - bestBid;
  const midPrice = (bestBid + bestAsk) / 2;

  return {
    exchange,
    symbol,
    bids: bids.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
    asks: asks.map(([p, q]) => ({ price: String(p), quantity: String(q) })),
    timestamp: now,
    receivedAt: now,
    metrics: {
      bestBid,
      bestAsk,
      spread,
      spreadPct: midPrice > 0 ? spread / midPrice : 0,
      midPrice,
      totalBidDepth: bidCum,
      totalAskDepth: askCum,
    },
    bidDepth,
    askDepth,
  };
}

function makePair(
  buyExchange: string,
  sellExchange: string,
  buyAsk: number,
  sellBid: number,
  depth = 10,
): ComparablePair {
  const now = Date.now();

  // Buy exchange: asks starting at buyAsk
  const buyAsks: Array<[number, number]> = [];
  for (let i = 0; i < depth; i++) {
    buyAsks.push([buyAsk + i * 0.01, 5]);
  }
  const buyBids: Array<[number, number]> = [];
  for (let i = 0; i < depth; i++) {
    buyBids.push([buyAsk - 1 - i * 0.01, 5]);
  }

  // Sell exchange: bids starting at sellBid
  const sellBids: Array<[number, number]> = [];
  for (let i = 0; i < depth; i++) {
    sellBids.push([sellBid - i * 0.01, 5]);
  }
  const sellAsks: Array<[number, number]> = [];
  for (let i = 0; i < depth; i++) {
    sellAsks.push([sellBid + 1 + i * 0.01, 5]);
  }

  return {
    symbol: 'BTC/USDT',
    buyExchange,
    buyBook: makeBook(buyExchange, buyBids, buyAsks),
    sellExchange,
    sellBook: makeBook(sellExchange, sellBids, sellAsks),
    buyBookAgeMs: 100,
    sellBookAgeMs: 100,
  };
}

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
    it('calculates a profitable opportunity', () => {
      // Buy at 50000, sell at 50500 → 500 spread (1%)
      const pair = makePair('binance', 'bybit', 50000, 50500);
      const opp = calc.calculate(pair, 1.0);

      expect(opp.symbol).toBe('BTC/USDT');
      expect(opp.baseCurrency).toBe('BTC');
      expect(opp.quoteCurrency).toBe('USDT');
      expect(opp.arbitrageType).toBe('direct');
      expect(opp.direction.buyExchange).toBe('binance');
      expect(opp.direction.sellExchange).toBe('bybit');

      // Prices from order book
      expect(opp.buyPrice).toBe(50000);
      expect(opp.sellPrice).toBe(50500);

      // Gross spread: 50500 - 50000 = 500
      expect(opp.grossSpread).toBe(500);
      expect(opp.grossSpreadPct).toBeCloseTo(0.01, 4); // 1%

      // Fees: binance 0.1% + bybit 0.1%
      // Buy fee: 50000 * 0.001 = 50
      // Sell fee: 50500 * 0.001 = 50.5
      expect(opp.buyFee).toBeCloseTo(50, 1);
      expect(opp.sellFee).toBeCloseTo(50.5, 1);

      // Network costs: same-exchange would be 0, cross-exchange needs cache
      // Since no cache, withdrawal not available
      expect(opp.networkCosts.sameExchange).toBe(false);

      // Net profit
      expect(opp.netProfit).toBeDefined();
      expect(opp.roi).toBeDefined();

      // Metadata
      expect(opp.calculatedAt).toBeGreaterThan(0);
      expect(opp.bookAgeMs).toBe(100);
      expect(opp.id).toBeDefined();
    });

    it('same-exchange opportunity has zero network costs', () => {
      const pair = makePair('binance', 'binance', 50000, 50500);
      const opp = calc.calculate(pair, 1.0);

      expect(opp.networkCosts.sameExchange).toBe(true);
      expect(opp.networkCosts.withdrawalFee).toBe(0);
      expect(opp.networkCosts.withdrawalCost).toBe(0);
    });

    it('marks illiquid when depth is insufficient', () => {
      // Very small depth: only 0.5 BTC available
      const pair = makePair('binance', 'bybit', 50000, 50500, 1);
      // Depth is 0.5 BTC per level, 1 level = 0.5 BTC total
      // Trade size is 10 BTC — insufficient
      const opp = calc.calculate(pair, 10.0);

      expect(opp.liquidity.executable).toBe(false);
      expect(opp.status).toBe('illiquid');
    });

    it('marks expired when book data is old', () => {
      const pair = makePair('binance', 'bybit', 50000, 50500);
      pair.buyBookAgeMs = 35000; // 35 seconds old
      pair.sellBookAgeMs = 35000;

      const opp = calc.calculate(pair, 1.0);
      expect(opp.status).toBe('expired');
    });

    it('marks unprofitable when spread is negative', () => {
      // Buy at 50500, sell at 50000 → negative spread
      const pair = makePair('binance', 'bybit', 50500, 50000);
      const opp = calc.calculate(pair, 1.0);

      expect(opp.grossSpread).toBeLessThan(0);
      expect(opp.netProfit).toBeLessThan(0);
      expect(opp.status).toBe('unprofitable');
    });
  });

  describe('calculateAll', () => {
    it('calculates multiple pairs', () => {
      const pairs = [
        makePair('binance', 'bybit', 50000, 50500),
        makePair('binance', 'okx', 50000, 50300),
      ];
      const results = calc.calculateAll(pairs, 1.0);
      expect(results.length).toBe(2);
    });

    it('handles errors gracefully', () => {
      const pair = makePair('binance', 'bybit', 50000, 50500);
      // Trade size 0 should still work
      const results = calc.calculateAll([pair], 0);
      expect(results.length).toBe(1);
    });
  });

  describe('hasPositiveSpread', () => {
    it('returns true when sell bid > buy ask', () => {
      const buyBook = makeBook('binance', [[49000, 1]], [[50000, 1]]);
      const sellBook = makeBook('bybit', [[50500, 1]], [[51000, 1]]);
      expect(calc.hasPositiveSpread(buyBook, sellBook)).toBe(true);
    });

    it('returns false when sell bid < buy ask', () => {
      const buyBook = makeBook('binance', [[50000, 1]], [[51000, 1]]);
      const sellBook = makeBook('bybit', [[49000, 1]], [[50000, 1]]);
      expect(calc.hasPositiveSpread(buyBook, sellBook)).toBe(false);
    });

    it('returns false when spread is below threshold', () => {
      const buyBook = makeBook('binance', [[50000, 1]], [[50000.5, 1]]);
      const sellBook = makeBook('bybit', [[50000.6, 1]], [[50001, 1]]);
      // Spread is 0.1/50000.5 = 0.000002, below default 0.0001
      expect(calc.hasPositiveSpread(buyBook, sellBook)).toBe(false);
    });

    it('returns false with empty book', () => {
      const buyBook = makeBook('binance', [], []);
      const sellBook = makeBook('bybit', [[50000, 1]], [[50001, 1]]);
      expect(calc.hasPositiveSpread(buyBook, sellBook)).toBe(false);
    });
  });
});
