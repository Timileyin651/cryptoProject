import http from 'http';
import { app } from './app';
import { config } from './config';
import { connectDatabase } from './config/database';
import { connectRedis } from './config/redis';
import { initWebSocket } from './websocket';
import { logger } from './utils/logger';

const server = http.createServer(app);

async function startServer(): Promise<void> {
  try {
    // Connect to services
    await connectDatabase();
    await connectRedis();

    // Initialize WebSocket
    initWebSocket(server);

    // Start listening
    server.listen(config.port, () => {
      logger.info(`Server running on port ${config.port} in ${config.env} mode`);
      logger.info(`API available at http://localhost:${config.port}${config.apiPrefix}`);
      logger.info(`Health check at http://localhost:${config.port}/api/v1/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
const gracefulShutdown = async (signal: string) => {
  logger.info(`${signal} received. Starting graceful shutdown...`);

  server.close(async () => {
    try {
      const { sequelize } = await import('./config/database');
      await sequelize.close();
      logger.info('Database connection closed');

      const { disconnectRedis } = await import('./config/redis');
      await disconnectRedis();
      logger.info('Redis connection closed');

      logger.info('Server shut down gracefully');
      process.exit(0);
    } catch (error) {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    }
  });
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

startServer();

export { server };
