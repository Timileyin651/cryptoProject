import express from 'express';
import path from 'path';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler, securityMiddleware, requestLogger, requestMetrics, requestId, notFound } from './middleware';
import routes from './routes';

const app = express();

// Trust proxy (for rate limiter behind reverse proxy)
app.set('trust proxy', 1);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Middleware
app.use(requestId);
app.use(requestLogger);
app.use(requestMetrics);
securityMiddleware(app);

// Health check before API routes (for load balancers)
// Simple liveness — always 200 if process is alive
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok' });
});
app.get('/health/live', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// API routes
app.use(config.apiPrefix, routes);

// 404 handler
app.use(notFound);

// Error handler
app.use(errorHandler);

// ── Startup diagnostic: print every registered route ────────────────
export function logRegisteredRoutes(): void {
  const routes: Array<{ method: string; path: string }> = [];

  function walkStack(stack: any[], prefix = '') {
    for (const layer of stack) {
      if (layer.route) {
        // Direct route handler
        const methods = Object.keys(layer.route.methods)
          .map((m) => m.toUpperCase())
          .join(',');
        routes.push({ method: methods, path: prefix + layer.route.path });
      } else if (layer.name === 'router' && layer.handle?.stack) {
        // Nested router — extract its base path from the regexp.
        // Express stores the path as a RegExp like /^\/api\/v1\/?$/i
        // Convert to string and pull out the path portion between /^\// and \//i$  
        const regexpStr = layer.regexp.toString();
        let routerPrefix = '';
        // Strip the RegExp wrapper: /^\// at start and /i?$ at end
        if (regexpStr.startsWith('/^\\/')) {
          const inner = regexpStr.slice(4); // after /^\//
          const endIdx = inner.lastIndexOf('/'); // find the closing /
          if (endIdx > 0) {
            routerPrefix = '/' + inner.slice(0, endIdx).replace(/\\\//g, '/');
          }
        }
        walkStack(layer.handle.stack, prefix + routerPrefix);
      }
    }
  }

  walkStack(app._router.stack);

  logger.info('─ Registered routes ─');
  for (const r of routes) {
    logger.info(`  ${r.method.padEnd(8)} ${r.path}`);
  }
  logger.info(`  (${routes.length} routes total)`);
}

export { app };
