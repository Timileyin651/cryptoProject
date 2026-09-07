import { sequelize } from '../config/database';
import { redisClient } from '../config/redis';
import { exchangeService } from './ExchangeService';
import { circuitBreakerRegistry } from '../cache/CircuitBreaker';
import { jobRegistry } from '../utils/jobRegistry';
import { metrics, METRICS } from '../utils/metrics';
import { logger } from '../utils/logger';

// ── Types ─────────────────────────────────────────────────────────────

export interface LivenessStatus {
  status: 'ok' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
}

export interface ReadinessStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    exchanges: ServiceHealth;
    jobs: ServiceHealth;
  };
}

export interface ServiceHealth {
  status: 'ok' | 'error' | 'degraded' | 'unknown';
  latencyMs?: number;
  message?: string;
  details?: Record<string, unknown>;
}

export interface DetailedHealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  uptime: number;
  version: string;
  env: string;
  services: {
    database: ServiceHealth;
    redis: ServiceHealth;
    exchanges: ExchangeHealthStatus;
    jobs: JobsHealthStatus;
  };
  memory: MemoryStatus;
}

export interface ExchangeHealthStatus extends ServiceHealth {
  details: {
    registered: string[];
    count: number;
    circuitBreakers: Record<string, { state: string; failureCount: number }>;
  };
}

export interface JobsHealthStatus extends ServiceHealth {
  details: {
    jobs: Array<{
      name: string;
      status: string;
      lastRunAt: string | null;
      lastDurationMs: number | null;
      lastError: string | null;
      totalRuns: number;
      totalErrors: number;
    }>;
  };
}

export interface MemoryStatus {
  rssBytes: number;
  heapUsedBytes: number;
  heapTotalBytes: number;
  externalBytes: number;
}

// ── HealthService ─────────────────────────────────────────────────────

export class HealthService {
  private startTime = Date.now();

  // ── Liveness (are we alive?) ──────────────────────────────────────

  /**
   * GET /health/live
   *
   * Simple liveness probe. Returns 200 if the process is running.
   * Used by Kubernetes/load balancers to know if the pod should be restarted.
   */
  async checkLiveness(): Promise<LivenessStatus> {
    const uptime = (Date.now() - this.startTime) / 1000;
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime,
      version: process.env.npm_package_version || '0.1.0',
    };
  }

  // ── Readiness (can we serve traffic?) ─────────────────────────────

  /**
   * GET /health/ready
   *
   * Readiness probe. Returns 200 only if critical dependencies are reachable.
   * Returns 503 if the service cannot serve traffic.
   */
  async checkReadiness(): Promise<ReadinessStatus> {
    const [database, redis, exchanges, jobs] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkExchanges(),
      this.checkJobs(),
    ]);

    const databaseHealth = database.status === 'fulfilled' ? database.value : { status: 'error' as const, message: 'Check failed' };
    const redisHealth = redis.status === 'fulfilled' ? redis.value : { status: 'error' as const, message: 'Check failed' };
    const exchangeHealth = exchanges.status === 'fulfilled' ? exchanges.value : { status: 'error' as const, message: 'Check failed' };
    const jobsHealth = jobs.status === 'fulfilled' ? jobs.value : { status: 'error' as const, message: 'Check failed' };

    // Determine overall status: error if DB or Redis is down, degraded otherwise
    const critical = [databaseHealth, redisHealth];
    const allOk = critical.every((s) => s.status === 'ok');
    const anyError = critical.some((s) => s.status === 'error');

    let status: 'ok' | 'degraded' | 'error';
    if (anyError) {
      status = 'error';
    } else if (!allOk) {
      status = 'degraded';
    } else if (exchangeHealth.status !== 'ok' || jobsHealth.status !== 'ok') {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    // Update system metrics
    this.collectSystemMetrics();

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - this.startTime) / 1000,
      version: process.env.npm_package_version || '0.1.0',
      services: {
        database: databaseHealth,
        redis: redisHealth,
        exchanges: exchangeHealth,
        jobs: jobsHealth,
      },
    };
  }

  // ── Detailed (admin / debugging) ──────────────────────────────────

  /**
   * GET /health/detailed
   *
   * Full diagnostic report including memory, exchange circuit breakers,
   * and individual job statuses.
   */
  async check(): Promise<DetailedHealthStatus> {
    const [database, redis, exchanges, jobs] = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkExchanges(),
      this.checkJobs(),
    ]);

    const databaseHealth = database.status === 'fulfilled' ? database.value : { status: 'error' as const, message: 'Check failed' };
    const redisHealth = redis.status === 'fulfilled' ? redis.value : { status: 'error' as const, message: 'Check failed' };
    const exchangeHealth = exchanges.status === 'fulfilled' ? exchanges.value : { status: 'error' as const, message: 'Check failed', details: { registered: [], count: 0, circuitBreakers: {} } };
    const jobsHealth = jobs.status === 'fulfilled' ? jobs.value : { status: 'error' as const, message: 'Check failed', details: { jobs: [] } };

    const critical = [databaseHealth, redisHealth];
    const allOk = critical.every((s) => s.status === 'ok');
    const anyError = critical.some((s) => s.status === 'error');

    let status: 'ok' | 'degraded' | 'error';
    if (anyError) {
      status = 'error';
    } else if (!allOk) {
      status = 'degraded';
    } else if (exchangeHealth.status !== 'ok' || jobsHealth.status !== 'ok') {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    this.collectSystemMetrics();

    const memory: MemoryStatus = {
      rssBytes: process.memoryUsage().rss,
      heapUsedBytes: process.memoryUsage().heapUsed,
      heapTotalBytes: process.memoryUsage().heapTotal,
      externalBytes: process.memoryUsage().external,
    };

    return {
      status,
      timestamp: new Date().toISOString(),
      uptime: (Date.now() - this.startTime) / 1000,
      version: process.env.npm_package_version || '0.1.0',
      env: process.env.NODE_ENV || 'development',
      services: {
        database: databaseHealth,
        redis: redisHealth,
        exchanges: exchangeHealth,
        jobs: jobsHealth,
      },
      memory,
    };
  }

  // ── Simple (legacy compatibility) ──────────────────────────────────

  async checkSimple(): Promise<{ status: string }> {
    return { status: 'ok' };
  }

  // ── Individual service checks ──────────────────────────────────────

  private async checkDatabase(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await sequelize.authenticate();
      const latencyMs = Date.now() - start;
      metrics.gauge(METRICS.DB_CONNECTIONS_ACTIVE, 'Active DB connections', 1);
      return { status: 'ok', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      metrics.incCounter(METRICS.DB_ERRORS_TOTAL, 'Total DB errors');
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[HealthService] Database check failed', { error: message });
      return { status: 'error', latencyMs, message };
    }
  }

  private async checkRedis(): Promise<ServiceHealth> {
    const start = Date.now();
    try {
      await redisClient.ping();
      const latencyMs = Date.now() - start;
      metrics.gauge(METRICS.REDIS_CONNECTIONS, 'Redis connections', 1);
      return { status: 'ok', latencyMs };
    } catch (error) {
      const latencyMs = Date.now() - start;
      metrics.incCounter(METRICS.REDIS_ERRORS_TOTAL, 'Total Redis errors');
      const message = error instanceof Error ? error.message : String(error);
      logger.error('[HealthService] Redis check failed', { error: message });
      return { status: 'error', latencyMs, message };
    }
  }

  private async checkExchanges(): Promise<ExchangeHealthStatus> {
    const registered = exchangeService.getRegisteredAdapterSlugs();
    const breakerStatuses = circuitBreakerRegistry.getAllStatuses();

    // Only include breakers for registered exchanges
    const circuitBreakers: Record<string, { state: string; failureCount: number; consumer: string }> = {};
    for (const slug of registered) {
      const status = breakerStatuses[slug];
      if (status) {
        circuitBreakers[slug] = { state: status.state, failureCount: status.failureCount, consumer: status.consumer };
      } else {
        circuitBreakers[slug] = { state: 'closed', failureCount: 0, consumer: 'none' };
      }
    }

    const openCount = Object.values(circuitBreakers).filter((b) => b.state === 'open').length;

    let status: 'ok' | 'degraded' | 'error';
    if (registered.length === 0) {
      status = 'error';
    } else if (openCount > 0 && openCount === registered.length) {
      status = 'error';
    } else if (openCount > 0) {
      status = 'degraded';
    } else {
      status = 'ok';
    }

    // Update exchange health metric
    for (const [slug, breaker] of Object.entries(circuitBreakers)) {
      metrics.gauge(
        METRICS.EXCHANGE_CONNECTION_HEALTH,
        'Exchange connection health (1=healthy, 0=unhealthy)',
        breaker.state === 'closed' ? 1 : 0,
        { exchange: slug },
      );
    }

    return {
      status,
      details: {
        registered,
        count: registered.length,
        circuitBreakers,
      },
    };
  }

  private async checkJobs(): Promise<JobsHealthStatus> {
    const jobs = jobRegistry.getAll();
    const hasErrors = jobs.some((j) => j.status === 'error');

    // Update job metrics
    for (const job of jobs) {
      metrics.gauge(
        METRICS.JOBS_ACTIVE,
        'Job active status (1=running, 0=idle)',
        job.status === 'running' ? 1 : 0,
        { job: job.name },
      );
    }

    return {
      status: hasErrors ? 'error' : 'ok',
      details: { jobs },
    };
  }

  // ── System metrics collection ──────────────────────────────────────

  private collectSystemMetrics(): void {
    const mem = process.memoryUsage();
    metrics.gauge(METRICS.PROCESS_UPTIME, 'Process uptime in seconds', (Date.now() - this.startTime) / 1000);
    metrics.gauge(METRICS.PROCESS_MEMORY_RSS, 'Resident set size in bytes', mem.rss);
    metrics.gauge(METRICS.PROCESS_MEMORY_HEAP_USED, 'Heap used in bytes', mem.heapUsed);
  }
}

export const healthService = new HealthService();
