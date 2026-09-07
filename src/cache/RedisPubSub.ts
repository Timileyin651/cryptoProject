import Redis from 'ioredis';
import { config } from '../config';
import { logger } from '../utils/logger';

// ──────────────────── Channel names ──────────────────────────────────────

export const CHANNELS = {
  /** Broadcast new opportunities from scanning worker to API servers. */
  OPPORTUNITIES: 'arb:pubsub:opportunities',
  /** Broadcast scan status updates. */
  SCAN_STATUS: 'arb:pubsub:scan_status',
  /** Broadcast config changes (admin updates scanner settings). */
  CONFIG_UPDATE: 'arb:pubsub:config_update',
  /** Coordinate graceful shutdown across processes. */
  SHUTDOWN: 'arb:pubsub:shutdown',
} as const;

// ──────────────────── PubSub class ──────────────────────────────────────

/**
 * Redis PubSub wrapper with automatic reconnection.
 *
 * Uses separate Redis connections for publish and subscribe
 * (required by Redis protocol — a subscriber connection cannot
 * issue other commands).
 */
export class RedisPubSub {
  private publisher: Redis;
  private subscriber: Redis;
  private handlers = new Map<string, Set<(message: string) => void>>();
  private connected = false;

  constructor() {
    // Publisher — standard connection
    this.publisher = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
    });

    // Subscriber — separate connection (Redis requirement)
    this.subscriber = new Redis({
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
      retryStrategy(times) {
        return Math.min(times * 100, 3000);
      },
      maxRetriesPerRequest: 3,
    });

    this.subscriber.on('message', (channel: string, message: string) => {
      const handlers = this.handlers.get(channel);
      if (handlers) {
        for (const handler of handlers) {
          try {
            handler(message);
          } catch (error) {
            logger.error(`[RedisPubSub] Handler error on ${channel}:`, error);
          }
        }
      }
    });

    this.subscriber.on('connect', () => {
      this.connected = true;
      logger.info('[RedisPubSub] Subscriber connected');
    });

    this.subscriber.on('error', (err) => {
      this.connected = false;
      logger.error('[RedisPubSub] Subscriber error:', err);
    });

    this.subscriber.on('close', () => {
      this.connected = false;
    });
  }

  /**
   * Publish a message to a channel.
   */
  async publish(channel: string, data: unknown): Promise<void> {
    if (!this.connected) {
      logger.debug(`[RedisPubSub] Not connected — dropping publish to ${channel}`);
      return;
    }

    try {
      const message = typeof data === 'string' ? data : JSON.stringify(data);
      await this.publisher.publish(channel, message);
    } catch (error) {
      logger.error(`[RedisPubSub] Publish failed on ${channel}:`, error);
    }
  }

  /**
   * Subscribe to a channel.
   */
  async subscribe(channel: string, handler: (message: string) => void): Promise<void> {
    if (!this.handlers.has(channel)) {
      this.handlers.set(channel, new Set());
      await this.subscriber.subscribe(channel);
      logger.info(`[RedisPubSub] Subscribed to ${channel}`);
    }
    this.handlers.get(channel)!.add(handler);
  }

  /**
   * Unsubscribe from a channel.
   */
  async unsubscribe(channel: string, handler?: (message: string) => void): Promise<void> {
    const handlers = this.handlers.get(channel);
    if (!handlers) return;

    if (handler) {
      handlers.delete(handler);
    } else {
      handlers.clear();
    }

    if (handlers.size === 0) {
      this.handlers.delete(channel);
      await this.subscriber.unsubscribe(channel);
      logger.info(`[RedisPubSub] Unsubscribed from ${channel}`);
    }
  }

  /**
   * Destroy connections (for graceful shutdown).
   */
  async destroy(): Promise<void> {
    try {
      await this.subscriber.quit();
    } catch {
      // Ignore
    }
    try {
      await this.publisher.quit();
    } catch {
      // Ignore
    }
    this.handlers.clear();
    this.connected = false;
  }
}

// ──────────────────── Singleton ──────────────────────────────────────────

let pubSub: RedisPubSub | null = null;

export function getPubSub(): RedisPubSub {
  if (!pubSub) {
    pubSub = new RedisPubSub();
  }
  return pubSub;
}

export async function destroyPubSub(): Promise<void> {
  if (pubSub) {
    await pubSub.destroy();
    pubSub = null;
  }
}
