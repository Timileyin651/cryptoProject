import { Request, Response, NextFunction } from 'express';
import { analyticsQueryService, ChartRange } from '../services/AnalyticsQueryService';
import { analyticsAggregatorService } from '../services/AnalyticsAggregatorService';

// ──────────────────── AnalyticsController ───────────────────────────────

export class AnalyticsController {
  /**
   * GET /api/v1/analytics/overview
   *
   * Comprehensive analytics overview for a symbol.
   * Query: range (1h|6h|24h|7d|30d|custom), symbol, customMs
   */
  async overview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getOverview(range, symbol, customMs);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/spread
   *
   * Spread history OHLC chart data.
   * Query: range, symbol, customMs
   */
  async spreadHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getSpreadHistory(range, symbol, customMs);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/profit
   *
   * Net profit history.
   */
  async profitHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getProfitHistory(range, symbol, customMs);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/price
   *
   * Price history.
   */
  async priceHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getPriceHistory(range, symbol, customMs);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/funding
   *
   * Funding rate history.
   * Query: range, exchange, symbol, customMs
   */
  async fundingHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const exchange = req.query.exchange as string | undefined;
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getFundingRateHistory(
        range,
        exchange,
        symbol,
        customMs,
      );
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/analytics/frequency
   *
   * Opportunity frequency over time.
   */
  async frequencyHistory(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const range = (req.query.range as ChartRange) || '24h';
      const symbol = req.query.symbol as string | undefined;
      const customMs = req.query.customMs ? parseInt(req.query.customMs as string, 10) : undefined;

      const data = await analyticsQueryService.getFrequencyHistory(range, symbol, customMs);
      res.status(200).json({ data });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/analytics/aggregate
   *
   * Trigger a manual aggregation run.
   */
  async triggerAggregation(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await analyticsAggregatorService.runFullAggregation();
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const analyticsController = new AnalyticsController();
