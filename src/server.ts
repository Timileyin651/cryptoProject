import http from 'http';
import './models/index'; // Initialize all Sequelize models before any query
import { app, logRegisteredRoutes } from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { connectRedis, disconnectRedis } from './config/redis';
import { runMigrations } from './config/migrate';
import { initWebSocket, getIO } from './websocket';
import { initExchanges, shutdownExchanges } from './exchanges';
import { ArbitrageEngine } from './arbitrage/ArbitrageEngine';
import { exchangeService } from './services/ExchangeService';
import { logger } from './utils/logger';
import { destroyCaches } from './cache/RedisCache';
import { destroyPubSub } from './cache/RedisPubSub';
import { retryManager } from './notifications/RetryManager';

const server = http.createServer(app);

// ── Track active engines for shutdown ───────────────────────────────────
const activeEngines: Array<{ stop: () => Promise<void>; name: string }> = [];

export function registerEngine(engine: { stop: () => Promise<void> }, name: string): void {
  activeEngines.push({ stop: engine.stop.bind(engine), name });
  logger.info(`[Server] Registered engine for shutdown: ${name}`);
}

async function startServer(): Promise<void> {
  try {
    // Connect to services
    await connectDatabase();
    await connectRedis();

    // Run migrations automatically in production
    if (config.env === 'production') {
      await runMigrations();
    }

    // Initialize exchange adapters (CCXT — live market data)
    await initExchanges();

    // Initialize WebSocket
    const io = initWebSocket(server);

    // Start the spot arbitrage engine with live order books
    const registeredSlugs = exchangeService.getRegisteredAdapterSlugs();
    const adapters = registeredSlugs
      .map((slug) => exchangeService.getAdapter(slug))
      .filter(Boolean) as any[];

    if (adapters.length > 0) {
      const engine = new ArbitrageEngine(adapters, {
        exchanges: registeredSlugs,
        symbols: ['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'XRP/USDT', 'DOGE/USDT', 'ADA/USDT', 'BNB/USDT'],
        scanIntervalMs: 10_000,
        tradeSize: 1.0,
      });

      await engine.initialize();
      await engine.start();
      registerEngine(engine, 'ArbitrageEngine');

      // Push live opportunities to Socket.IO clients
      engine.on('opportunities', (opps: any[]) => {
        io.emit('opportunities', opps);
      });

      // Emit exchange health status
      setInterval(() => {
        const health: Record<string, string> = {};
        for (const slug of registeredSlugs) {
          const breaker = exchangeService.getAdapter(slug);
          health[slug] = breaker ? 'ok' : 'disconnected';
        }
        io.emit('exchangeHealth', health);
      }, 30_000);

      logger.info(`[Server] ArbitrageEngine started — ${registeredSlugs.length} exchange(s), scanning every 10s`);
    } else {
      logger.warn('[Server] No exchange adapters registered — arbitrage engine not started');
    }

    // Start listening
    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.env} mode`);
      logger.info(`API available at http://localhost:${config.port}${config.apiPrefix}`);
      logger.info(`Health check at http://localhost:${config.port}/api/v1/health`);

      // Print every registered route so "which routes exist" is never a guessing game
      logRegisteredRoutes();
    });

    server.on('error', (error: any) => {
      if (error.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use. Trying port ${config.port + 1}...`);
        server.listen(config.port + 1);
      } else {
        logger.error('Server error:', error);
        process.exit(1);
      }
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// ── Graceful shutdown ───────────────────────────────────────────────────
let shuttingDown = false;

const gracefulShutdown = async (signal: string) => {
  if (shuttingDown) return;
  shuttingDown = true;

  const startTime = Date.now();
  logger.info(`${signal} received. Starting graceful shutdown...`);

  // Step 1: Stop accepting new connections
  server.close(() => {
    logger.info('HTTP server stopped accepting connections');
  });

  // Step 2: Cancel pending notification retries (non-blocking)
  const cancelledRetries = retryManager.cancelAll();
  logger.info(`Cancelled ${cancelledRetries} pending notification retry(s)`);

  // Step 3: Stop all engines (parallel, with timeout)
  const enginePromises = activeEngines.map(async (eng) => {
    try {
      await Promise.race([
        eng.stop(),
        new Promise<void>((_, reject) =>
          setTimeout(() => reject(new Error('Engine stop timeout')), 5000),
        ),
      ]);
      logger.info(`Engine stopped: ${eng.name}`);
    } catch (error) {
      logger.error(`Engine stop failed for ${eng.name}:`, error);
    }
  });
  await Promise.allSettled(enginePromises);

  // Step 4: Close WebSocket connections
  try {
    const io = getIO();
    io.close();
    logger.info('WebSocket connections closed');
  } catch {
    // WebSocket may not be initialized
  }

  // Step 5: Shut down exchange adapters
  try {
    await shutdownExchanges();
    logger.info('Exchange adapters shut down');
  } catch (error) {
    logger.error('Error shutting down exchanges:', error);
  }

  // Step 6: Destroy caches and pub/sub
  try {
    destroyCaches();
    await destroyPubSub();
    logger.info('Cache and pub/sub connections closed');
  } catch (error) {
    logger.error('Error closing cache/pubsub:', error);
  }

  // Step 6: Close database connection
  try {
    const { sequelize } = await import('./config/database');
    await sequelize.close();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database:', error);
  }

  // Step 7: Close Redis
  try {
    await disconnectRedis();
    logger.info('Redis connection closed');
  } catch (error) {
    logger.error('Error closing Redis:', error);
  }

  const elapsed = Date.now() - startTime;
  logger.info(`Server shut down gracefully in ${elapsed}ms`);
  process.exit(0);

  // Force exit after 10s if something hangs
  setTimeout(() => {
    logger.error('Forced exit after shutdown timeout');
    process.exit(1);
  }, 10_000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// ── Global error handlers — prevent silent process crashes ──────────────
// Unhandled promise rejections (async errors not caught anywhere)
process.on('unhandledRejection', (reason, promise) => {
  const msg = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  logger.error('Unhandled Promise Rejection — process will NOT exit (logged only)', {
    message: msg,
    stack,
  });
});

// Uncaught synchronous exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception — shutting down to avoid undefined state', {
    message: error.message,
    stack: error.stack,
  });
  // Give logger time to flush, then exit
  setTimeout(() => process.exit(1), 1000);
});

startServer();

export { server };
