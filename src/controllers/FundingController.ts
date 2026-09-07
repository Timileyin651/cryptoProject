import { Request, Response, NextFunction } from 'express';
import { fundingModule } from '../funding';

// ──────────────────── Disclaimer ────────────────────────────────────────

const ESTIMATE_DISCLAIMER =
  'All values are estimates based on current funding rates. ' +
  'Funding rates change every settlement interval (typically 8h) and ' +
  'basis can move against the position. Past rates do not guarantee ' +
  'future returns. This is not financial advice.';

// ──────────────────── FundingController ─────────────────────────────────

/**
 * HTTP controller for funding rate arbitrage endpoints.
 */
export class FundingController {
  /**
   * GET /api/v1/funding/rates
   *
   * Returns current funding rates for all discovered spot/perp pairs.
   * Supports optional query params:
   *   - exchange: filter by exchange slug
   *   - symbol: filter by base currency (e.g. "BTC")
   */
  async getRates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const engine = fundingModule.getEngine();
      if (!engine) {
        res.status(503).json({
          error: 'Funding engine not initialized',
          message: 'The funding arbitrage engine has not been started yet.',
        });
        return;
      }

      const service = engine.getFundingRateService();
      let rates = service.getAllRates();

      // Apply filters
      const exchangeFilter = req.query.exchange as string | undefined;
      const symbolFilter = req.query.symbol as string | undefined;

      if (exchangeFilter) {
        rates = rates.filter((r) => r.exchange === exchangeFilter);
      }

      if (symbolFilter) {
        const upper = symbolFilter.toUpperCase();
        rates = rates.filter((r) => r.symbol.toUpperCase().includes(upper));
      }

      // Map to response format
      const response = rates.map((rate) => {
        const intervalsPerYear =
          (365.25 * 24 * 60 * 60 * 1000) / (rate.fundingIntervalMs ?? 8 * 60 * 60 * 1000);

        // Extract base/quote from the perp symbol
        const spotSymbol = rate.symbol.replace(/:.*$/, '');
        const [baseCurrency, quoteCurrency] = spotSymbol.split('/');

        return {
          exchange: rate.exchange,
          symbol: rate.symbol,
          baseCurrency: baseCurrency ?? 'UNKNOWN',
          quoteCurrency: quoteCurrency ?? 'UNKNOWN',
          fundingRate: rate.fundingRate,
          fundingRateApr: rate.fundingRate * intervalsPerYear,
          fundingIntervalMs: rate.fundingIntervalMs ?? 8 * 60 * 60 * 1000,
          nextFundingTime: rate.nextFundingTime,
          timestamp: rate.timestamp,
          fetchedAt: rate.fetchedAt,
          isEstimate: true,
        };
      });

      res.status(200).json({
        data: response,
        count: response.length,
        disclaimer: ESTIMATE_DISCLAIMER,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/funding/opportunities
   *
   * Returns ranked funding arbitrage opportunities.
   * Supports optional query params:
   *   - exchange: filter by exchange slug
   *   - status: filter by status (active, marginal, etc.)
   *   - minReturn: minimum net return pct (e.g. 0.001 for 0.1%)
   *   - limit: max results (default 50)
   */
  async getOpportunities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const engine = fundingModule.getEngine();
      if (!engine) {
        res.status(503).json({
          error: 'Funding engine not initialized',
          message: 'The funding arbitrage engine has not been started yet.',
        });
        return;
      }

      const scanResult = engine.getLastScanResult();
      if (!scanResult) {
        res.status(200).json({
          data: [],
          count: 0,
          message: 'No scan results available yet. Engine may still be starting.',
          disclaimer: ESTIMATE_DISCLAIMER,
        });
        return;
      }

      let opportunities = [...scanResult.opportunities];

      // Apply filters
      const exchangeFilter = req.query.exchange as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      const minReturn = req.query.minReturn ? parseFloat(req.query.minReturn as string) : undefined;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;

      if (exchangeFilter) {
        opportunities = opportunities.filter((o) => o.exchange === exchangeFilter);
      }

      if (statusFilter) {
        opportunities = opportunities.filter((o) => o.status === statusFilter);
      }

      if (minReturn !== undefined && !isNaN(minReturn)) {
        opportunities = opportunities.filter((o) => o.netReturnPct >= minReturn);
      }

      // Limit results
      opportunities = opportunities.slice(0, limit);

      // Map to response format with disclaimer
      const response = opportunities.map((opp) => ({
        id: opp.id,
        exchange: opp.exchange,
        baseCurrency: opp.baseCurrency,
        quoteCurrency: opp.quoteCurrency,
        spotSymbol: opp.spotSymbol,
        perpSymbol: opp.perpSymbol,
        spotPrice: opp.spotPrice,
        perpPrice: opp.perpPrice,
        basis: opp.basis,
        basisPct: opp.basisPct,
        currentFundingRate: opp.currentFundingRate,
        fundingRateApr: opp.fundingRateApr,
        positionSide: opp.positionSide,
        leverage: opp.leverage,
        tradeSizeBase: opp.tradeSizeBase,
        notionalValue: opp.notionalValue,
        expectedFundingPerInterval: opp.expectedFundingPerInterval,
        intervalsInHorizon: opp.intervalsInHorizon,
        totalExpectedFunding: opp.totalExpectedFunding,
        basisConvergenceEstimate: opp.basisConvergenceEstimate,
        totalEstimatedReturn: opp.totalEstimatedReturn,
        estimatedReturnPct: opp.estimatedReturnPct,
        totalFees: opp.totalFees,
        netReturnEstimate: opp.netReturnEstimate,
        netReturnPct: opp.netReturnPct,
        status: opp.status,
        statusReason: opp.statusReason,
        calculatedAt: opp.calculatedAt,
        isEstimate: true,
        disclaimer: ESTIMATE_DISCLAIMER,
      }));

      res.status(200).json({
        data: response,
        count: response.length,
        meta: {
          pairsScanned: scanResult.pairsScanned,
          exchangesScanned: scanResult.exchangesScanned,
          scanDurationMs: scanResult.durationMs,
          scanCompletedAt: scanResult.completedAt,
        },
        disclaimer: ESTIMATE_DISCLAIMER,
      });
    } catch (error) {
      next(error);
    }
  }
}

export const fundingController = new FundingController();
