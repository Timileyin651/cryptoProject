import { Request, Response, NextFunction } from 'express';
import { healthService } from '../services/HealthService';
import { metrics } from '../utils/metrics';

export class HealthController {
  // ── Liveness probe ────────────────────────────────────────────────

  /** GET /health/live — 200 if process is alive */
  async liveness(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.checkLiveness();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ── Readiness probe ───────────────────────────────────────────────

  /** GET /health/ready — 200 if service can serve traffic, 503 otherwise */
  async readiness(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.checkReadiness();
      const statusCode = result.status === 'error' ? 503 : 200;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ── Detailed health ───────────────────────────────────────────────

  /** GET /health/detailed — full diagnostic report */
  async detailed(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.check();
      const statusCode = result.status === 'error' ? 503 : 200;
      res.status(statusCode).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ── Simple health (legacy) ────────────────────────────────────────

  /** GET /health — simple health check for load balancers */
  async simple(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await healthService.checkSimple();
      res.status(200).json(result);
    } catch (error) {
      next(error);
    }
  }

  // ── Prometheus metrics ────────────────────────────────────────────

  /** GET /metrics — Prometheus exposition format */
  async prometheusMetrics(_req: Request, res: Response, _next: NextFunction): Promise<void> {
    // Update system metrics before rendering
    const mem = process.memoryUsage();
    metrics.gauge('process_uptime_seconds', 'Process uptime', process.uptime());
    metrics.gauge('process_memory_rss_bytes', 'RSS bytes', mem.rss);
    metrics.gauge('process_memory_heap_used_bytes', 'Heap used bytes', mem.heapUsed);

    const body = metrics.render();
    res.setHeader('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.status(200).send(body);
  }
}

export const healthController = new HealthController();
