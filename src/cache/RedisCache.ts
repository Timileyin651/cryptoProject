import { redisClient } from '../config/redis';
import { logger } from '../utils/logger';

// Re-export shared circuit breaker
export { CircuitBreaker, circuitBreakerRegistry, getExchangeBreaker } from './CircuitBreaker';
export type { BreakerState, BreakerStatus } from './CircuitBreaker';

// ──────────────────── Cache entry ────────────────────────────────────────

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

// ──────────────────── Redis Cache ────────────────────────────────────────

/**
 * Typed Redis cache with in-memory L1 fallback.
 *
 * Strategy:
 * - L1 (in-memory Map): sub-ms reads, good for hot data that's small
 * - L2 (Redis): shared across processes, larger capacity
 *
 * Both layers use TTL. L1 is faster but process-local.
 */
export class RedisCache {
  private l1 = new Map<string, CacheEntry<unknown>>();
  private prefix: string;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(prefix: string = 'cache') {
    this.prefix = prefix;
    // Clean expired L1 entries every 60s
    this.cleanupTimer = setInterval(() => this.cleanupL1(), 60_000);
  }

  /**
   * Get a value from cache (L1 → L2 → miss).
   */
  async get<T>(key: string): Promise<T | null> {
    const fullKey = `${this.prefix}:${key}`;

    // L1 check
    const l1Entry = this.l1.get(fullKey) as CacheEntry<T> | undefined;
    if (l1Entry && Date.now() < l1Entry.expiresAt) {
      return l1Entry.value;
    }
    if (l1Entry) {
      this.l1.delete(fullKey);
    }

    // L2 (Redis) check
    try {
      const raw = await redisClient.get(fullKey);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        // Populate L1 with shorter TTL (50% of L2)
        return parsed;
      }
    } catch (error) {
      // Redis failure is non-fatal — just a cache miss
      logger.debug(`[RedisCache] L2 get failed for ${key}: ${error}`);
    }

    return null;
  }

  /**
   * Set a value in both cache layers.
   */
  async set<T>(key: string, value: T, ttlMs: number = 60_000): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    const expiresAt = Date.now() + ttlMs;

    // L1
    this.l1.set(fullKey, { value, expiresAt });

    // L2
    try {
      const serialized = JSON.stringify(value);
      const ttlSec = Math.ceil(ttlMs / 1000);
      await redisClient.setex(fullKey, ttlSec, serialized);
    } catch (error) {
      logger.debug(`[RedisCache] L2 set failed for ${key}: ${error}`);
    }
  }

  /**
   * Delete from both layers.
   */
  async del(key: string): Promise<void> {
    const fullKey = `${this.prefix}:${key}`;
    this.l1.delete(fullKey);
    try {
      await redisClient.del(fullKey);
    } catch (error) {
      logger.debug(`[RedisCache] L2 del failed for ${key}: ${error}`);
    }
  }

  /**
   * Check if key exists (L1 or L2).
   */
  async has(key: string): Promise<boolean> {
    const fullKey = `${this.prefix}:${key}`;
    const l1Entry = this.l1.get(fullKey);
    if (l1Entry && Date.now() < l1Entry.expiresAt) return true;

    try {
      const exists = await redisClient.exists(fullKey);
      return exists === 1;
    } catch {
      return false;
    }
  }

  /**
   * Clear all entries with this prefix.
   */
  async clear(): Promise<void> {
    // Clear L1
    for (const key of this.l1.keys()) {
      if (key.startsWith(`${this.prefix}:`)) {
        this.l1.delete(key);
      }
    }

    // Clear L2
    try {
      const keys = await redisClient.keys(`${this.prefix}:*`);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } catch (error) {
      logger.debug(`[RedisCache] L2 clear failed: ${error}`);
    }
  }

  /** Stop the cleanup timer. */
  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /** Remove expired entries from L1. */
  private cleanupL1(): void {
    const now = Date.now();
    let cleaned = 0;
    for (const [key, entry] of this.l1.entries()) {
      if (now >= entry.expiresAt) {
        this.l1.delete(key);
        cleaned++;
      }
    }
    if (cleaned > 0) {
      logger.debug(`[RedisCache] Cleaned ${cleaned} expired L1 entries`);
    }
  }
}

// ──────────────────── Singleton instances ────────────────────────────────

/** Cache for fee schedules (refreshed every 15 minutes). */
export const feeCache = new RedisCache('arb:fees');

/** Cache for network status (refreshed every 5 minutes). */
export const networkCache = new RedisCache('arb:network');

/** Cache for active alert evaluations (TTL = alert cooldown). */
export const alertCache = new RedisCache('arb:alerts');

/** Cache for order book snapshots (TTL = scan interval). */
export const bookCache = new RedisCache('arb:books');

/** Cache for subscription plans (refreshed every 10 minutes). */
export const planCache = new RedisCache('arb:plans');

/** Cache for notification preferences (refreshed every 5 minutes). */
export const prefCache = new RedisCache('arb:pref');

/**
 * Destroy all caches (for graceful shutdown).
 */
export function destroyCaches(): void {
  feeCache.destroy();
  networkCache.destroy();
  alertCache.destroy();
  bookCache.destroy();
  planCache.destroy();
  prefCache.destroy();
}
