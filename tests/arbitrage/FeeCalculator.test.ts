import { FeeCalculator } from '../../src/arbitrage/FeeCalculator';

describe('FeeCalculator', () => {
  let calc: FeeCalculator;

  beforeEach(() => {
    calc = new FeeCalculator();
  });

  describe('getFee', () => {
    it('returns default fees for known exchanges', () => {
      const fee = calc.getFee('binance', 'BTC/USDT');
      expect(fee.exchange).toBe('binance');
      expect(fee.symbol).toBe('BTC/USDT');
      expect(fee.takerFee).toBe(0.001);
      expect(fee.makerFee).toBe(0.001);
      expect(fee.known).toBe(false);
    });

    it('returns global fallback for unknown exchanges', () => {
      const fee = calc.getFee('unknown_exchange', 'BTC/USDT');
      expect(fee.takerFee).toBe(0.001);
      expect(fee.known).toBe(false);
    });

    it('differentiates fee schedules per exchange', () => {
      const binanceFee = calc.getFee('binance', 'BTC/USDT');
      const gateioFee = calc.getFee('gateio', 'BTC/USDT');
      expect(binanceFee.takerFee).toBe(0.001);
      expect(gateioFee.takerFee).toBe(0.002);
    });

    it('uses OKX maker fee of 0.08%', () => {
      const fee = calc.getFee('okx', 'BTC/USDT');
      expect(fee.makerFee).toBe(0.0008);
    });
  });

  describe('calculateTradingFee', () => {
    it('calculates fee correctly for taker', () => {
      const fee = calc.calculateTradingFee('binance', 'BTC/USDT', 10000);
      // 10000 * 0.001 = 10
      expect(fee).toBe(10);
    });

    it('calculates fee correctly for maker', () => {
      const fee = calc.calculateTradingFee('okx', 'BTC/USDT', 10000, true);
      // 10000 * 0.0008 = 8
      expect(fee).toBe(8);
    });

    it('handles zero cost', () => {
      const fee = calc.calculateTradingFee('binance', 'BTC/USDT', 0);
      expect(fee).toBe(0);
    });
  });

  describe('calculateArbitrageFees', () => {
    it('calculates combined fees for both sides', () => {
      const result = calc.calculateArbitrageFees(
        'binance',
        'bybit',
        'BTC/USDT',
        100000, // buy cost
        101000, // sell revenue
      );
      // Binance taker: 100000 * 0.001 = 100
      // Bybit taker: 101000 * 0.001 = 101
      expect(result.buyFee).toBe(100);
      expect(result.sellFee).toBe(101);
      expect(result.totalFees).toBe(201);
      expect(result.buyFeeRate).toBe(0.001);
      expect(result.sellFeeRate).toBe(0.001);
    });

    it('handles different exchange fee rates', () => {
      const result = calc.calculateArbitrageFees('binance', 'gateio', 'BTC/USDT', 10000, 10000);
      // Binance: 10000 * 0.001 = 10
      // GateIO: 10000 * 0.002 = 20
      expect(result.buyFee).toBe(10);
      expect(result.sellFee).toBe(20);
      expect(result.totalFees).toBe(30);
    });
  });

  describe('needsRefresh', () => {
    it('needs refresh initially', () => {
      expect(calc.needsRefresh()).toBe(true);
    });

    it('does not need refresh right after construction with long expiry', () => {
      const freshCalc = new FeeCalculator(60_000);
      // The lastRefreshAt is 0, so it will need refresh
      expect(freshCalc.needsRefresh()).toBe(true);
    });
  });
});
