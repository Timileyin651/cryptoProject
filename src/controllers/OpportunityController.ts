import { Request, Response, NextFunction } from 'express';
import { opportunityService } from '../services/OpportunityService';
import { OpportunityQueryOptions } from '../services/OpportunityService';

// ──────────────────── OpportunityController ─────────────────────────────

export class OpportunityController {
  /**
   * GET /api/v1/arbitrage/opportunities
   *
   * Query params: page, limit, sortBy, sortDirection, search,
   * opportunityType, status, baseCurrency, quoteCurrency, symbol,
   * exchange, network, minProfit, maxProfit, minRoi, maxRoi,
   * minSpread, maxSpread, liquidityExecutable, withdrawalAvailable,
   * depositAvailable, updatedAfter, updatedBefore, scanId
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const options: OpportunityQueryOptions = {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        sortBy: req.query.sortBy as string,
        sortDirection: (req.query.sortDirection as string)?.toUpperCase() as 'ASC' | 'DESC',
        search: req.query.search as string,
        opportunityType: req.query.opportunityType as string,
        status: req.query.status as string,
        baseCurrency: req.query.baseCurrency as string,
        quoteCurrency: req.query.quoteCurrency as string,
        symbol: req.query.symbol as string,
        exchange: req.query.exchange as string,
        network: req.query.network as string,
        minProfit: req.query.minProfit ? parseFloat(req.query.minProfit as string) : undefined,
        maxProfit: req.query.maxProfit ? parseFloat(req.query.maxProfit as string) : undefined,
        minRoi: req.query.minRoi ? parseFloat(req.query.minRoi as string) : undefined,
        maxRoi: req.query.maxRoi ? parseFloat(req.query.maxRoi as string) : undefined,
        minSpread: req.query.minSpread ? parseFloat(req.query.minSpread as string) : undefined,
        maxSpread: req.query.maxSpread ? parseFloat(req.query.maxSpread as string) : undefined,
        liquidityExecutable:
          req.query.liquidityExecutable !== undefined
            ? req.query.liquidityExecutable === 'true'
            : undefined,
        withdrawalAvailable:
          req.query.withdrawalAvailable !== undefined
            ? req.query.withdrawalAvailable === 'true'
            : undefined,
        depositAvailable:
          req.query.depositAvailable !== undefined
            ? req.query.depositAvailable === 'true'
            : undefined,
        updatedAfter: req.query.updatedAfter as string,
        updatedBefore: req.query.updatedBefore as string,
        scanId: req.query.scanId as string,
      };

      const result = await opportunityService.query(options);

      res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/arbitrage/opportunities/:id
   *
   * Returns a single opportunity with legs and recent snapshots.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid opportunity ID' });
        return;
      }

      const record = await opportunityService.getById(id);
      res.status(200).json({ data: record });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/arbitrage/history
   *
   * Returns historical snapshots, optionally filtered by opportunity ID.
   * Query params: opportunityId (required), page, limit, since
   */
  async history(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const opportunityId = parseInt(req.query.opportunityId as string, 10);
      if (isNaN(opportunityId)) {
        res.status(400).json({ error: 'opportunityId query parameter is required' });
        return;
      }

      const result = await opportunityService.getHistory(opportunityId, {
        page: req.query.page ? parseInt(req.query.page as string, 10) : undefined,
        limit: req.query.limit ? parseInt(req.query.limit as string, 10) : undefined,
        since: req.query.since as string,
      });

      res.status(200).json({
        data: result.data,
        pagination: result.pagination,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/arbitrage/stats
   *
   * Returns aggregate statistics across all opportunities.
   * Query params: opportunityType, since
   */
  async stats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const stats = await opportunityService.getStats({
        opportunityType: req.query.opportunityType as string,
        since: req.query.since as string,
      });

      res.status(200).json({ data: stats });
    } catch (error) {
      next(error);
    }
  }
}

export const opportunityController = new OpportunityController();
