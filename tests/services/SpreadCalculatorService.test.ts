import { SpreadCalculatorService } from '../../src/services/SpreadCalculatorService';

describe('SpreadCalculatorService', () => {
  let service: SpreadCalculatorService;

  beforeEach(() => {
    service = new SpreadCalculatorService();
  });

  describe('calculate', () => {
    it('calculates basic spread profit with default fees', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50500,
      });

      // Quantity: 10000 / 50000 = 0.2 BTC
      expect(result.quantityBase).toBeCloseTo(0.2, 6);

      // Gross spread: 50500 - 50000 = 500 per unit
      expect(result.grossSpreadPerUnit).toBe(500);
      expect(result.grossSpreadPct).toBeCloseTo(0.01, 4); // 1%

      // Gross profit: 500 * 0.2 = 100
      expect(result.grossProfit).toBeCloseTo(100, 2);

      // Default fees: 0.1% each
      // Buy fee: 10000 * 0.001 = 10
      expect(result.buyFee).toBeCloseTo(10, 2);
      // Sell fee: 50500 * 0.2 * 0.001 = 10.1
      expect(result.sellFee).toBeCloseTo(10.1, 2);
      expect(result.totalTradingFees).toBeCloseTo(20.1, 2);

      // Net profit: 100 - 20.1 = 79.9
      expect(result.netProfit).toBeCloseTo(79.9, 1);

      // ROI: 79.9 / 10000 = 0.00799
      expect(result.roi).toBeCloseTo(0.00799, 4);

      // Metadata
      expect(result.calculatedAt).toBeGreaterThan(0);
      expect(result.disclaimer).toBeDefined();
      expect(result.disclaimer.length).toBeGreaterThan(0);
    });

    it('applies custom fee rates', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50500,
        buyFeeRate: 0.002, // 0.2%
        sellFeeRate: 0.002,
      });

      // Buy fee: 10000 * 0.002 = 20
      expect(result.buyFee).toBeCloseTo(20, 2);
      // Sell fee: 50500 * 0.2 * 0.002 = 20.2
      expect(result.sellFee).toBeCloseTo(20.2, 2);
      expect(result.totalTradingFees).toBeCloseTo(40.2, 2);
    });

    it('includes withdrawal and network fees', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50500,
        withdrawalFeeBase: 0.0005, // 0.0005 BTC
        networkFeeQuote: 5, // 5 USDT
      });

      // Withdrawal in quote: 0.0005 * 50000 = 25
      expect(result.withdrawalFeeQuote).toBeCloseTo(25, 2);
      expect(result.networkFeeQuote).toBe(5);
      expect(result.totalNetworkCosts).toBeCloseTo(30, 2);
    });

    it('includes slippage costs', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50500,
        buySlippage: 0.001, // 0.1%
        sellSlippage: 0.001,
      });

      // Buy slippage: 0.001 * 50000 * 0.2 = 10
      expect(result.buySlippageCost).toBeCloseTo(10, 2);
      // Sell slippage: 0.001 * 50500 * 0.2 = 10.1
      expect(result.sellSlippageCost).toBeCloseTo(10.1, 2);
      expect(result.totalSlippageCost).toBeCloseTo(20.1, 2);
    });

    it('calculates all costs together', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50500,
        buyFeeRate: 0.001,
        sellFeeRate: 0.001,
        withdrawalFeeBase: 0.0005,
        networkFeeQuote: 5,
        buySlippage: 0.001,
        sellSlippage: 0.001,
      });

      // Total costs = fees + network + slippage
      const expectedTotal =
        result.totalTradingFees + result.totalNetworkCosts + result.totalSlippageCost;
      expect(result.totalCosts).toBeCloseTo(expectedTotal, 2);

      // Net profit = gross - total costs
      expect(result.netProfit).toBeCloseTo(result.grossProfit - result.totalCosts, 2);
    });

    it('handles negative spread (unprofitable)', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50500,
        sellPrice: 50000,
      });

      expect(result.grossSpreadPerUnit).toBe(-500);
      expect(result.grossSpreadPct).toBeLessThan(0);
      expect(result.grossProfit).toBeLessThan(0);
      expect(result.netProfit).toBeLessThan(0);
      expect(result.roi).toBeLessThan(0);
    });

    it('handles zero spread', () => {
      const result = service.calculate({
        investmentAmount: 10000,
        buyPrice: 50000,
        sellPrice: 50000,
      });

      expect(result.grossSpreadPerUnit).toBe(0);
      expect(result.grossProfit).toBe(0);
      // Net should be negative due to fees
      expect(result.netProfit).toBeLessThan(0);
    });

    it('throws on invalid inputs', () => {
      expect(() =>
        service.calculate({
          investmentAmount: -100,
          buyPrice: 50000,
          sellPrice: 50500,
        }),
      ).toThrow('Investment amount must be positive');

      expect(() =>
        service.calculate({
          investmentAmount: 10000,
          buyPrice: -50000,
          sellPrice: 50500,
        }),
      ).toThrow('Buy price must be positive');

      expect(() =>
        service.calculate({
          investmentAmount: 10000,
          buyPrice: 50000,
          sellPrice: -50500,
        }),
      ).toThrow('Sell price must be positive');
    });
  });

  describe('calculateFromOpportunity', () => {
    it('uses opportunity data as defaults', () => {
      const oppData = {
        buy_price: '50000',
        sell_price: '50500',
        buy_fee_rate: '0.001',
        sell_fee_rate: '0.001',
        withdrawal_fee: '0.0002',
        network_fee_quote: '10',
        buy_slippage: '0.001',
        sell_slippage: '0.001',
      };

      const result = service.calculateFromOpportunity(oppData, 10000);

      expect(result.buyPrice).toBe(50000);
      expect(result.sellPrice).toBe(50500);
      expect(result.investmentAmount).toBe(10000);
      expect(result.netProfit).toBeDefined();
    });

    it('allows overrides', () => {
      const oppData = {
        buy_price: '50000',
        sell_price: '50500',
        buy_fee_rate: '0.001',
        sell_fee_rate: '0.001',
      };

      const result = service.calculateFromOpportunity(oppData, 20000, {
        buyPrice: 49000,
        sellPrice: 51000,
      });

      expect(result.buyPrice).toBe(49000);
      expect(result.sellPrice).toBe(51000);
      expect(result.investmentAmount).toBe(20000);
    });
  });
});
