import { BasisSpreadCalculator } from '../../src/funding/BasisSpreadCalculator';
import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';
import { createSpotPerpPair, createFundingRateEntry, createTickerSnapshot } from '../fixtures';

describe('BasisSpreadCalculator', () => {
  let calculator: BasisSpreadCalculator;
  let feeCalculator: FeeCalculator;

  beforeEach(() => {
    feeCalculator = new FeeCalculator();
    calculator = new BasisSpreadCalculator(feeCalculator, 1);
  });

  describe('calculate', () => {
    it('calculates basis spread for contango (perp > spot)', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000', bid: '64999', ask: '65001' });
      const perpTicker = createTickerSnapshot({ last: '65200', bid: '65199', ask: '65201' });
      const fundingRate = createFundingRateEntry({ fundingRate: 0.0001 });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      expect(result.exchange).toBe('binance');
      expect(result.spotPrice).toBe(65000);
      expect(result.perpPrice).toBe(65200);
      expect(result.basis).toBeCloseTo(200, 1); // 65200 - 65000
      expect(result.basisPct).toBeCloseTo(200 / 65000, 6);
      expect(result.currentFundingRate).toBe(0.0001);
      expect(result.positionSide).toBe('long_spot_short_perp'); // positive rate → long spot short perp
    });

    it('calculates basis spread for backwardation (perp < spot)', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '64800' });
      const fundingRate = createFundingRateEntry({ fundingRate: -0.0001 });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      expect(result.basis).toBeCloseTo(-200, 1);
      expect(result.positionSide).toBe('short_spot_long_perp'); // negative rate → short spot long perp
    });

    it('calculates funding rate APR', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({
        fundingRate: 0.0001,
        fundingIntervalMs: 8 * 60 * 60 * 1000, // 8 hours
      });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      // 0.0001 * (365.25 * 24 * 60 * 60 * 1000) / (8 * 60 * 60 * 1000)
      // = 0.0001 * 1095.75 = 0.109575 (10.96%)
      expect(result.fundingRateApr).toBeCloseTo(0.109575, 4);
    });

    it('calculates intervals in holding horizon', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({
        fundingIntervalMs: 8 * 60 * 60 * 1000,
      });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      // 24 hours / 8 hours = 3 intervals
      expect(result.intervalsInHorizon).toBe(3);
    });

    it('calculates expected funding per interval', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({ fundingRate: 0.0001 });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      // notionalValue = 65000 * 1.0 = 65000
      // expectedFundingPerInterval = 65000 * 0.0001 = 6.5
      expect(result.notionalValue).toBe(65000);
      expect(result.expectedFundingPerInterval).toBeCloseTo(6.5, 2);
    });

    it('calculates total fees (entry + exit)', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({ fundingRate: 0.0001 });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      expect(result.entryFees).toBeGreaterThan(0);
      expect(result.exitFees).toBe(result.entryFees); // same fees for entry and exit
      expect(result.totalFees).toBe(result.entryFees + result.exitFees);
    });

    it('net return is less than total estimated return due to fees', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({ fundingRate: 0.001 }); // high rate

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);

      expect(result.netReturnEstimate).toBeLessThan(result.totalEstimatedReturn);
      expect(result.netReturnPct).toBeLessThan(result.estimatedReturnPct);
    });

    it('sets isEstimate to true', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry();

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);
      expect(result.isEstimate).toBe(true);
    });

    it('determines status as expired for stale data', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({
        fetchedAt: Date.now() - 600_000, // 10 minutes ago
      });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);
      expect(result.status).toBe('expired');
    });

    it('determines status as low_funding for negligible rate', () => {
      const pair = createSpotPerpPair();
      const spotTicker = createTickerSnapshot({ last: '65000' });
      const perpTicker = createTickerSnapshot({ last: '65000' });
      const fundingRate = createFundingRateEntry({ fundingRate: 0.000001 });

      const result = calculator.calculate(pair, spotTicker, perpTicker, fundingRate, 1.0, 24);
      expect(result.status).toBe('low_funding');
    });
  });

  describe('calculateAll', () => {
    it('calculates results for all pairs with data', () => {
      const pairs = [
        createSpotPerpPair({ exchange: 'binance', perpSymbol: 'BTC/USDT:USDT' }),
        createSpotPerpPair({ exchange: 'bybit', perpSymbol: 'BTC/USDT:USDT' }),
      ];

      const spotTickers = new Map([
        ['binance:BTC/USDT', createTickerSnapshot({ last: '65000' })],
        ['bybit:BTC/USDT', createTickerSnapshot({ last: '65010' })],
      ]);

      const perpTickers = new Map([
        ['binance:BTC/USDT:USDT', createTickerSnapshot({ last: '65200' })],
        ['bybit:BTC/USDT:USDT', createTickerSnapshot({ last: '65250' })],
      ]);

      const fundingRates = new Map([
        [
          'binance:BTC/USDT:USDT',
          createFundingRateEntry({ exchange: 'binance', fundingRate: 0.0001 }),
        ],
        [
          'bybit:BTC/USDT:USDT',
          createFundingRateEntry({ exchange: 'bybit', fundingRate: 0.00015 }),
        ],
      ]);

      const results = calculator.calculateAll(
        pairs,
        spotTickers,
        perpTickers,
        fundingRates,
        1.0,
        24,
      );
      expect(results).toHaveLength(2);
    });

    it('skips pairs with missing data', () => {
      const pairs = [createSpotPerpPair({ exchange: 'binance' })];
      const spotTickers = new Map();
      const perpTickers = new Map();
      const fundingRates = new Map();

      const results = calculator.calculateAll(
        pairs,
        spotTickers,
        perpTickers,
        fundingRates,
        1.0,
        24,
      );
      expect(results).toHaveLength(0);
    });
  });
});
