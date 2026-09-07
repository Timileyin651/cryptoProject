import { WsStream, WsStreamConfig } from './WsStream';
import { logger } from '../utils/logger';

/**
 * Factory function that creates a WsStream for a given exchange.
 * The factory receives the exchange slug and should return a new stream instance.
 */
export type StreamFactory = (config?: Partial<WsStreamConfig>) => WsStream;

/**
 * Dynamic registry of WS stream factories keyed by exchange slug.
 *
 * Instead of a hardcoded switch in MarketDataEngine, new exchanges are
 * registered here at startup. The engine queries the registry when it
 * needs to create a stream for a given exchange.
 *
 * Built-in streams (binance, bybit, okx) are registered automatically.
 * Additional exchanges can be registered via `register()`.
 */
export class StreamRegistry {
  private factories = new Map<string, StreamFactory>();

  /**
   * Register a stream factory for an exchange slug.
   * Overwrites any previous factory for the same slug.
   */
  register(exchange: string, factory: StreamFactory): void {
    this.factories.set(exchange, factory);
    logger.info(`[StreamRegistry] Registered stream factory for '${exchange}'`);
  }

  /**
   * Create a new WsStream instance for the given exchange.
   * Returns `null` if no factory is registered for the slug.
   */
  create(exchange: string, config?: Partial<WsStreamConfig>): WsStream | null {
    const factory = this.factories.get(exchange);
    if (!factory) {
      return null;
    }
    try {
      return factory(config);
    } catch (error) {
      logger.error(`[StreamRegistry] Failed to create stream for '${exchange}':`, error);
      return null;
    }
  }

  /**
   * Check if a factory is registered for the given exchange slug.
   */
  has(exchange: string): boolean {
    return this.factories.has(exchange);
  }

  /**
   * Get all registered exchange slugs.
   */
  getRegisteredExchanges(): string[] {
    return [...this.factories.keys()];
  }

  /**
   * Remove a factory registration.
   */
  unregister(exchange: string): boolean {
    return this.factories.delete(exchange);
  }

  /**
   * Clear all registrations.
   */
  clear(): void {
    this.factories.clear();
  }
}

// Singleton instance
const streamRegistry = new StreamRegistry();
export { streamRegistry };

/**
 * Register the built-in stream factories for Binance, Bybit, and OKX.
 * Called once at application boot after imports are resolved.
 */
export function registerBuiltInStreams(): void {
  // Lazy imports to avoid circular dependency issues at load time.
  // Each factory returns a new stream instance on every call.
  streamRegistry.register('binance', (config?: Partial<WsStreamConfig>) => {
    const { BinanceWsStream } = require('./streams/BinanceWsStream') as {
      BinanceWsStream: new (config?: Partial<WsStreamConfig>) => WsStream;
    };
    return new BinanceWsStream(config);
  });

  streamRegistry.register('bybit', (config?: Partial<WsStreamConfig>) => {
    const { BybitWsStream } = require('./streams/BybitWsStream') as {
      BybitWsStream: new (config?: Partial<WsStreamConfig>) => WsStream;
    };
    return new BybitWsStream(config);
  });

  streamRegistry.register('okx', (config?: Partial<WsStreamConfig>) => {
    const { OkxWsStream } = require('./streams/OkxWsStream') as {
      OkxWsStream: new (config?: Partial<WsStreamConfig>) => WsStream;
    };
    return new OkxWsStream(config);
  });

  logger.info(
    `[StreamRegistry] Built-in streams registered: ${streamRegistry.getRegisteredExchanges().join(', ')}`,
  );
}
