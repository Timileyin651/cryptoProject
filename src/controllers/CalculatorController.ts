import { Request, Response, NextFunction } from 'express';
import { spreadCalculatorService } from '../services/SpreadCalculatorService';
import { opportunityService } from '../services/OpportunityService';
import rateLimit from 'express-rate-limit';

// ──────────────────── Rate limiter ──────────────────────────────────────

/**
 * Rate limiter for the calculator API — public, no auth required.
 * 30 requests per 15 minutes per IP.
 */
export const calculatorRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many calculator requests. Please try again later.' },
});

// ──────────────────── CalculatorController ──────────────────────────────

export class CalculatorController {
  /**
   * POST /api/v1/calculator/spread
   *
   * Calculate estimated profit/ROI for an arbitrage trade.
   *
   * Body:
   *   - investmentAmount (required): number
   *   - opportunityId (optional): number — auto-fills prices/fees from opportunity
   *   - buyPrice (required if no opportunityId): number
   *   - sellPrice (required if no opportunityId): number
   *   - buyFeeRate (optional): fraction (e.g. 0.001)
   *   - sellFeeRate (optional): fraction
   *   - withdrawalFeeBase (optional): number
   *   - networkFeeQuote (optional): number
   *   - buySlippage (optional): fraction
   *   - sellSlippage (optional): fraction
   *
   * Returns estimated gross/net profit, ROI, fee breakdown.
   * All values are ESTIMATES — never imply guaranteed returns.
   */
  async calculateSpread(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const {
        investmentAmount,
        opportunityId,
        buyPrice,
        sellPrice,
        buyFeeRate,
        sellFeeRate,
        withdrawalFeeBase,
        networkFeeQuote,
        buySlippage,
        sellSlippage,
      } = req.body;

      // ── Validate investment amount ──
      if (
        investmentAmount === undefined ||
        typeof investmentAmount !== 'number' ||
        investmentAmount <= 0
      ) {
        res.status(400).json({
          error: 'investmentAmount is required and must be a positive number',
        });
        return;
      }

      // ── If opportunityId is provided, load the opportunity ──
      if (opportunityId !== undefined) {
        const opp = await opportunityService.getById(opportunityId);
        const oppData = opp.toJSON();

        // Apply overrides from request body
        const overrides: Record<string, any> = {};
        if (buyPrice !== undefined) overrides.buyPrice = buyPrice;
        if (sellPrice !== undefined) overrides.sellPrice = sellPrice;
        if (buyFeeRate !== undefined) overrides.buyFeeRate = buyFeeRate;
        if (sellFeeRate !== undefined) overrides.sellFeeRate = sellFeeRate;
        if (withdrawalFeeBase !== undefined) overrides.withdrawalFeeBase = withdrawalFeeBase;
        if (networkFeeQuote !== undefined) overrides.networkFeeQuote = networkFeeQuote;
        if (buySlippage !== undefined) overrides.buySlippage = buySlippage;
        if (sellSlippage !== undefined) overrides.sellSlippage = sellSlippage;

        const result = spreadCalculatorService.calculateFromOpportunity(
          oppData,
          investmentAmount,
          overrides,
        );

        res.status(200).json({
          data: result,
          source: {
            type: 'opportunity',
            opportunityId: opp.id,
            symbol: opp.symbol,
            exchanges: `${opp.buy_exchange_slug} → ${opp.sell_exchange_slug}`,
          },
        });
        return;
      }

      // ── Manual calculation ──
      if (buyPrice === undefined || typeof buyPrice !== 'number' || buyPrice <= 0) {
        res.status(400).json({
          error: 'buyPrice is required (or provide opportunityId)',
        });
        return;
      }

      if (sellPrice === undefined || typeof sellPrice !== 'number' || sellPrice <= 0) {
        res.status(400).json({
          error: 'sellPrice is required (or provide opportunityId)',
        });
        return;
      }

      const result = spreadCalculatorService.calculate({
        investmentAmount,
        buyPrice,
        sellPrice,
        buyFeeRate,
        sellFeeRate,
        withdrawalFeeBase,
        networkFeeQuote,
        buySlippage,
        sellSlippage,
      });

      res.status(200).json({
        data: result,
        source: {
          type: 'manual',
        },
      });
    } catch (error: any) {
      if (error.message?.includes('must be positive')) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  }
}

export const calculatorController = new CalculatorController();
