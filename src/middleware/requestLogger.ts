import morgan from 'morgan';
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { metrics, METRICS } from '../utils/metrics';

const stream = {
  write: (message: string) => logger.http(message.trim()),
};

export const requestLogger = morgan(
  ':method :url :status :res[content-length] - :response-time ms',
  { stream },
);

/**
 * Prometheus HTTP request metrics middleware.
 * Tracks request count, duration, and in-progress requests.
 */
export function requestMetrics(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();
  const route = req.route?.path || req.path;

  // Increment in-progress counter
  metrics.incCounter(METRICS.HTTP_REQUESTS_IN_PROGRESS, 'HTTP requests currently in progress', {
    method: req.method,
    route,
  });

  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const durationSec = durationMs / 1000;
    const labels = {
      method: req.method,
      status: String(res.statusCode),
      route,
    };

    metrics.incCounter(METRICS.HTTP_REQUESTS_TOTAL, 'Total HTTP requests', labels);
    metrics.histogram(METRICS.HTTP_REQUEST_DURATION, 'HTTP request duration in seconds', durationSec, labels);

    // Decrement in-progress counter
    metrics.counter(METRICS.HTTP_REQUESTS_IN_PROGRESS, 'HTTP requests currently in progress', -1, {
      method: req.method,
      route,
    });
  });

  next();
}
