import { sequelize } from '../config/database';
import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

export interface HealthStatus {
  status: string;
  timestamp: string;
  uptime: number;
  services: {
    database: string;
    redis: string;
  };
}

export class HealthService {
  async check(): Promise<HealthStatus> {
    const dbStatus = await this.checkDatabase();
    const redisStatus = await this.checkRedis();

    const status = dbStatus === 'ok' && redisStatus === 'ok' ? 'ok' : 'degraded';

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database: dbStatus,
        redis: redisStatus,
      },
    };
  }

  async checkSimple(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  private async checkDatabase(): Promise<string> {
    try {
      await sequelize.authenticate();
      return 'ok';
    } catch (error) {
      logger.error('Database health check failed:', error);
      return 'error';
    }
  }

  private async checkRedis(): Promise<string> {
    try {
      await redisClient.ping();
      return 'ok';
    } catch (error) {
      logger.error('Redis health check failed:', error);
      return 'error';
    }
  }
}

export const healthService = new HealthService();
