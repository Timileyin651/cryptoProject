import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/HealthService';

export class HealthController {
  async simple(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.checkSimple();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  async detailed(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.check();
      const statusCode = result.status === 'ok' ? 200 : 503;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  }
}

export const healthController = new HealthController();
