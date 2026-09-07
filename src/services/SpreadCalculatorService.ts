// ──────────────────── SpreadCalculatorService ────────────────────────────

/**
 * Reusable profit/spread calculator. Used by:
 * - POST /api/v1/calculator/spread (standalone calculator endpoint)
 * - Opportunity detail page (auto-fill from opportunity data)
 * - Any future tool that needs spread math
 *
 * All outputs are ESTIMATES. Markets move, fees change, slippage varies.
 * Never imply guaranteed profit.
 */

export interface CalculatorInput {
  /** Investment amount in quote currency (e.g. 10000 USDT). */
  investmentAmount: number;
  /** Buy price (best ask on buy exchange). */
  buyPrice: number;
  /** Sell price (best bid on sell exchange). */
  sellPrice: number;
  /** Buy-side trading fee rate as fraction (e.g. 0.001 = 0.1%). */
  buyFeeRate?: number;
  /** Sell-side trading fee rate as fraction. */
  sellFeeRate?: number;
  /** Withdrawal fee in base currency (for cross-exchange). */
  withdrawalFeeBase?: number;
  /** Network fee in quote currency. */
  networkFeeQuote?: number;
  /** Estimated slippage fraction on buy side. */
  buySlippage?: number;
  /** Estimated slippage fraction on sell side. */
  sellSlippage?: number;
}

export interface CalculatorResult {
  /** Investment amount. */
  investmentAmount: number;
  /** Quantity in base currency that can be bought. */
  quantityBase: number;
  /** Buy price used. */
  buyPrice: number;
  /** Sell price used. */
  sellPrice: number;

  // ── Gross ──────────────────────────────────────────────────────
  /** Gross spread per unit. */
  grossSpreadPerUnit: number;
  /** Gross spread as fraction of buy price. */
  grossSpreadPct: number;
  /** Total gross profit before any costs. */
  grossProfit: number;

  // ── Fees ───────────────────────────────────────────────────────
  /** Buy-side trading fee in quote currency. */
  buyFee: number;
  /** Sell-side trading fee in quote currency. */
  sellFee: number;
  /** Total trading fees. */
  totalTradingFees: number;

  // ── Network costs ──────────────────────────────────────────────
  /** Withdrawal fee converted to quote currency. */
  withdrawalFeeQuote: number;
  /** Network fee in quote currency. */
  networkFeeQuote: number;
  /** Total network/transfer costs. */
  totalNetworkCosts: number;

  // ── Slippage ───────────────────────────────────────────────────
  /** Slippage cost on buy side. */
  buySlippageCost: number;
  /** Slippage cost on sell side. */
  sellSlippageCost: number;
  /** Total slippage cost. */
  totalSlippageCost: number;

  // ── Net ────────────────────────────────────────────────────────
  /** Total costs = fees + network + slippage. */
  totalCosts: number;
  /** Net profit = gross profit - total costs. */
  netProfit: number;
  /** ROI = net profit / investment. */
  roi: number;

  // ── Metadata ───────────────────────────────────────────────────
  /** When this calculation was performed. */
  calculatedAt: number;
  /** Disclaimer string. */
  disclaimer: string;
}

// ──────────────────── Defaults ──────────────────────────────────────────

const DEFAULT_FEE_RATE = 0.001; // 0.1% taker
const DISCLAIMER =
  'All values are estimates based on current order-book prices. ' +
  'Actual execution may differ due to market movement, slippage, ' +
  'and fee changes. This is not financial advice.';

// ──────────────────── Service ───────────────────────────────────────────

class SpreadCalculatorService {
  /**
   * Calculate profit/ROI from manual inputs.
   */
  calculate(input: CalculatorInput): CalculatorResult {
    const {
      investmentAmount,
      buyPrice,
      sellPrice,
      buyFeeRate = DEFAULT_FEE_RATE,
      sellFeeRate = DEFAULT_FEE_RATE,
      withdrawalFeeBase = 0,
      networkFeeQuote = 0,
      buySlippage = 0,
      sellSlippage = 0,
    } = input;

    // ── Validate inputs ──
    if (investmentAmount <= 0) throw new Error('Investment amount must be positive');
    if (buyPrice <= 0) throw new Error('Buy price must be positive');
    if (sellPrice <= 0) throw new Error('Sell price must be positive');

    // ── Quantity ──
    const quantityBase = investmentAmount / buyPrice;

    // ── Gross ──
    const grossSpreadPerUnit = sellPrice - buyPrice;
    const grossSpreadPct = buyPrice > 0 ? grossSpreadPerUnit / buyPrice : 0;
    const grossProfit = grossSpreadPerUnit * quantityBase;

    // ── Trading fees ──
    const buyFee = investmentAmount * buyFeeRate;
    const sellFee = sellPrice * quantityBase * sellFeeRate;
    const totalTradingFees = buyFee + sellFee;

    // ── Network costs ──
    const withdrawalFeeQuote = withdrawalFeeBase * buyPrice;
    const totalNetworkCosts = withdrawalFeeQuote + networkFeeQuote;

    // ── Slippage ──
    const buySlippageCost = buySlippage * buyPrice * quantityBase;
    const sellSlippageCost = sellSlippage * sellPrice * quantityBase;
    const totalSlippageCost = buySlippageCost + sellSlippageCost;

    // ── Net ──
    const totalCosts = totalTradingFees + totalNetworkCosts + totalSlippageCost;
    const netProfit = grossProfit - totalCosts;
    const roi = investmentAmount > 0 ? netProfit / investmentAmount : 0;

    return {
      investmentAmount,
      quantityBase,
      buyPrice,
      sellPrice,
      grossSpreadPerUnit,
      grossSpreadPct,
      grossProfit,
      buyFee,
      sellFee,
      totalTradingFees,
      withdrawalFeeQuote,
      networkFeeQuote: networkFeeQuote,
      totalNetworkCosts,
      buySlippageCost,
      sellSlippageCost,
      totalSlippageCost,
      totalCosts,
      netProfit,
      roi,
      calculatedAt: Date.now(),
      disclaimer: DISCLAIMER,
    };
  }

  /**
   * Calculate from an opportunity ID — fetches the opportunity
   * and uses its prices/fees as defaults, allowing the user to
   * override the investment amount.
   */
  calculateFromOpportunity(
    opportunityData: Record<string, any>,
    investmentAmount: number,
    overrides: Partial<CalculatorInput> = {},
  ): CalculatorResult {
    const buyPrice = overrides.buyPrice ?? parseFloat(opportunityData.buy_price);
    const sellPrice = overrides.sellPrice ?? parseFloat(opportunityData.sell_price);

    return this.calculate({
      investmentAmount,
      buyPrice,
      sellPrice,
      buyFeeRate: overrides.buyFeeRate ?? parseFloat(opportunityData.buy_fee_rate ?? '0.001'),
      sellFeeRate: overrides.sellFeeRate ?? parseFloat(opportunityData.sell_fee_rate ?? '0.001'),
      withdrawalFeeBase:
        overrides.withdrawalFeeBase ?? parseFloat(opportunityData.withdrawal_fee ?? '0'),
      networkFeeQuote:
        overrides.networkFeeQuote ?? parseFloat(opportunityData.network_fee_quote ?? '0'),
      buySlippage: overrides.buySlippage ?? parseFloat(opportunityData.buy_slippage ?? '0'),
      sellSlippage: overrides.sellSlippage ?? parseFloat(opportunityData.sell_slippage ?? '0'),
    });
  }
}

export const spreadCalculatorService = new SpreadCalculatorService();
export { SpreadCalculatorService };
