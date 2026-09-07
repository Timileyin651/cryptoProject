import { BasisSpreadCalculator } from '../../src/funding/BasisSpreadCalculator';
import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import type { SpotPerpPair, FundingRateEntry } from '../../src/funding/types';
import type { TickerSnapshot } from '../../src/exchanges/ExchangeAdapter';

// ──────────────────── Helpers ───────────────────────────────────────────

function makePair(overrides: Partial<SpotPerpPair> = {}): SpotPerpPair {
  return {
    exchange: 'binance',
    spotSymbol: 'BTC/USDT',
    perpSymbol: 'BTC/USDT:USDT',
    baseCurrency: 'BTC',
    quoteCurrency: 'USDT',
    ...overrides,
  };
}

function makeSpotTicker(price: number): TickerSnapshot {
  return {
    symbol: 'BTC/USDT',
    bid: String(price - 0.5),
    ask: String(price + 0.5),
    last: String(price),
    volume24h: '1000',
    high24h: String(price + 1000),
    low24h: String(price - 1000),
    timestamp: new Date(),
  };
}

function makePerpTicker(price: number): TickerSnapshot {
  return {
    symbol: 'BTC/USDT:USDT',
    bid: String(price - 0.5),
    ask: String(price + 0.5),
    last: String(price),
    volume24h: '2000',
    high24h: String(price + 1000),
    low24h: String(price - 1000),
    timestamp: new Date(),
  };
}

function makeFundingRate(
  rate: number,
  overrides: Partial<FundingRateEntry> = {},
): FundingRateEntry {
  return {
    exchange: 'binance',
    symbol: 'BTC/USDT:USDT',
    fundingRate: rate,
    timestamp: Date.now(),
    fetchedAt: Date.now(),
    nextFundingTime: Date.now() + 8 * 60 * 60 * 1000,
    fundingIntervalMs: 8 * 60 * 60 * 1000,
    ...overrides,
  };
}

// ──────────────────── Tests ─────────────────────────────────────────────

describe('BasisSpreadCalculator', () => {
  let calc: BasisSpreadCalculator;
  let feeCalc: FeeCalculator;

  beforeEach(() => {
    feeCalc = new FeeCalculator();
    calc = new BasisSpreadCalculator(feeCalc, 1); // 1x leverage
  });

  describe('calculate', () => {
    it('calculates basis spread for a contango market (perp premium)', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50500), // perp at premium
        makeFundingRate(0.0001), // positive funding rate
        1.0, // 1 BTC
        24, // 24h horizon
      );

      // Basis: 50500 - 50000 = 500
      expect(result.basis).toBe(500);
      expect(result.basisPct).toBeCloseTo(0.01, 4); // 1%

      // Spot price
      expect(result.spotPrice).toBe(50000);
      expect(result.perpPrice).toBe(50500);

      // Position side: positive funding → long spot / short perp
      expect(result.positionSide).toBe('long_spot_short_perp');
      expect(result.leverage).toBe(1);

      // Funding rate
      expect(result.currentFundingRate).toBe(0.0001);
      expect(result.fundingRateApr).toBeGreaterThan(0);

      // Funding intervals: 24h / 8h = 3
      expect(result.intervalsInHorizon).toBe(3);

      // Expected funding per interval: 50000 * 1 * 0.0001 = 5 USDT
      expect(result.expectedFundingPerInterval).toBeCloseTo(5, 0);

      // Total expected funding: 5 * 3 = 15 USDT
      expect(result.totalExpectedFunding).toBeCloseTo(15, 0);

      // Notional
      expect(result.notionalValue).toBe(50000);

      // Fees
      expect(result.entryFees).toBeGreaterThan(0);
      expect(result.exitFees).toBeGreaterThan(0);
      expect(result.totalFees).toBeGreaterThan(0);

      // Net return
      expect(result.netReturnEstimate).toBeDefined();
      expect(result.netReturnPct).toBeDefined();

      // Metadata
      expect(result.id).toBeDefined();
      expect(result.calculatedAt).toBeGreaterThan(0);
      expect(result.isEstimate).toBe(true);
      expect(result.status).toBeDefined();
    });

    it('calculates basis spread for a backwardation market (perp discount)', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(49500), // perp at discount
        makeFundingRate(-0.0001), // negative funding rate
        1.0,
        24,
      );

      // Basis: 49500 - 50000 = -500
      expect(result.basis).toBe(-500);
      expect(result.basisPct).toBeCloseTo(-0.01, 4);

      // Negative funding → short spot / long perp
      expect(result.positionSide).toBe('short_spot_long_perp');

      // For negative funding, the effective rate for this position is positive
      // (you receive funding when rate < 0 and you're long perp)
      expect(result.totalExpectedFunding).toBeGreaterThan(0);
    });

    it('marks low_funding when rate is negligible', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.000001), // extremely low
        1.0,
        24,
      );

      expect(result.status).toBe('low_funding');
    });

    it('marks expired when funding data is stale', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001, {
          fetchedAt: Date.now() - 600_000, // 10 min old
        }),
        1.0,
        24,
      );

      expect(result.status).toBe('expired');
    });

    it('marks unprofitable when fees exceed returns', () => {
      // Tiny funding rate with large trade size → fees dominate
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.00001), // very low rate
        100.0, // large trade size
        1, // short horizon
      );

      // With very low funding and high fees, should be unprofitable or marginal
      expect(['unprofitable', 'marginal', 'low_funding']).toContain(result.status);
    });

    it('uses custom holding horizon', () => {
      const result24h = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001),
        1.0,
        24,
      );

      const result48h = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001),
        1.0,
        48,
      );

      // 48h should have more intervals and more funding
      expect(result48h.intervalsInHorizon).toBe(result24h.intervalsInHorizon * 2);
      expect(result48h.totalExpectedFunding).toBeCloseTo(result24h.totalExpectedFunding * 2, 0);
    });

    it('handles custom funding intervals (not 8h)', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001, {
          fundingIntervalMs: 4 * 60 * 60 * 1000, // 4h interval
        }),
        1.0,
        24,
      );

      // 24h / 4h = 6 intervals
      expect(result.intervalsInHorizon).toBe(6);
      expect(result.fundingIntervalMs).toBe(4 * 60 * 60 * 1000);
    });
  });

  describe('calculateAll', () => {
    it('calculates multiple pairs', () => {
      const pairs = [
        makePair({ spotSymbol: 'BTC/USDT', perpSymbol: 'BTC/USDT:USDT', baseCurrency: 'BTC' }),
        makePair({ spotSymbol: 'ETH/USDT', perpSymbol: 'ETH/USDT:USDT', baseCurrency: 'ETH' }),
      ];

      const spotTickers = new Map([
        ['binance:BTC/USDT', makeSpotTicker(50000)],
        ['binance:ETH/USDT', makeSpotTicker(3000)],
      ]);
      const perpTickers = new Map([
        ['binance:BTC/USDT:USDT', makePerpTicker(50500)],
        ['binance:ETH/USDT:USDT', makePerpTicker(3030)],
      ]);
      const fundingRates = new Map([
        ['binance:BTC/USDT:USDT', makeFundingRate(0.0001)],
        ['binance:ETH/USDT:USDT', makeFundingRate(0.0002)],
      ]);

      const results = calc.calculateAll(pairs, spotTickers, perpTickers, fundingRates, 1.0, 24);

      expect(results.length).toBe(2);
      expect(results[0].baseCurrency).toBe('BTC');
      expect(results[1].baseCurrency).toBe('ETH');
    });

    it('skips pairs with missing data', () => {
      const pairs = [
        makePair({ spotSymbol: 'BTC/USDT', perpSymbol: 'BTC/USDT:USDT', baseCurrency: 'BTC' }),
        makePair({ spotSymbol: 'SOL/USDT', perpSymbol: 'SOL/USDT:USDT', baseCurrency: 'SOL' }),
      ];

      // Only provide data for BTC
      const spotTickers = new Map([['binance:BTC/USDT', makeSpotTicker(50000)]]);
      const perpTickers = new Map([['binance:BTC/USDT:USDT', makePerpTicker(50500)]]);
      const fundingRates = new Map([['binance:BTC/USDT:USDT', makeFundingRate(0.0001)]]);

      const results = calc.calculateAll(pairs, spotTickers, perpTickers, fundingRates, 1.0, 24);

      expect(results.length).toBe(1); // Only BTC
    });
  });

  describe('position side determination', () => {
    it('recommends long spot / short perp when funding is positive', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001),
        1.0,
        24,
      );
      expect(result.positionSide).toBe('long_spot_short_perp');
    });

    it('recommends short spot / long perp when funding is negative', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(-0.0001),
        1.0,
        24,
      );
      expect(result.positionSide).toBe('short_spot_long_perp');
    });

    it('defaults to long spot / short perp when funding is zero', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0),
        1.0,
        24,
      );
      expect(result.positionSide).toBe('long_spot_short_perp');
    });
  });

  describe('fee calculation', () => {
    it('calculates entry and exit fees using FeeCalculator', () => {
      const result = calc.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001),
        1.0,
        24,
      );

      // Both legs use taker fee (0.1% default)
      // Spot: 50000 * 0.001 = 50
      // Perp: 50000 * 0.001 = 50
      // Entry total: 100
      expect(result.entryFees).toBeCloseTo(100, 0);
      // Exit same as entry
      expect(result.exitFees).toBeCloseTo(100, 0);
      expect(result.totalFees).toBeCloseTo(200, 0);
    });
  });

  describe('custom leverage', () => {
    it('uses configured leverage', () => {
      const calc2x = new BasisSpreadCalculator(feeCalc, 2);
      const result = calc2x.calculate(
        makePair(),
        makeSpotTicker(50000),
        makePerpTicker(50000),
        makeFundingRate(0.0001),
        1.0,
        24,
      );
      expect(result.leverage).toBe(2);
    });
  });
});
