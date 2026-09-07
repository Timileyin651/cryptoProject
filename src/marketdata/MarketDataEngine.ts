import { EventEmitter } from 'events';
import { WsStream } from './WsStream';
import { streamRegistry, registerBuiltInStreams } from './StreamRegistry';
import { marketDataStore } from './MarketDataStore';
import { NormalizedTicker, NormalizedTrade, StreamHealth } from './types';
import { logger } from '../utils/logger';

/**
 * Configuration for the market data engine.
 */
export interface MarketDataEngineConfig {
  /** Exchange slugs to connect. Defaults to ['binance', 'bybit', 'okx']. */
  exchanges?: string[];
  /** Symbols to subscribe to on each exchange. */
  symbols: string[];
  /** How often to flush tickers to Redis (ms). Default: 500. */
  flushIntervalMs?: number;
  /** How often to reap stale Redis keys (ms). Default: 60_000. */
  reapIntervalMs?: number;
  /** If true, also emit trade events (can be very high volume). Default: false. */
  emitTrades?: boolean;
  /** If true, also emit ticker events to Node listeners. Default: false. */
  emitTickers?: boolean;
}

interface ExchangeStream {
  exchange: string;
  stream: WsStream;
  connected: boolean;
  lastError: string | null;
}

/**
 * Central orchestrator for real-time market data.
 *
 * Responsibilities:
 *  - Creates and manages one WsStream per exchange via the StreamRegistry
 *  - Isolates failures: one exchange dying does not affect others
 *  - Buffers ticker updates and flushes them to Redis in batches
 *  - Provides a health dashboard for all streams
 *  - Handles graceful startup and shutdown
 *
 * New exchanges are supported by registering a stream factory in the
 * StreamRegistry — no changes to this engine are needed.
 */
class MarketDataEngine extends EventEmitter {
  private streams = new Map<string, ExchangeStream>();
  private config: Required<MarketDataEngineConfig>;
  private flushTimer: ReturnType<typeof setInterval> | null = null;
  private reapTimer: ReturnType<typeof setInterval> | null = null;
  private tickerBuffer: NormalizedTicker[] = [];
  private running = false;
  private startedAt: number | null = null;
  private builtInRegistered = false;

  constructor() {
    super();
    this.config = {
      exchanges: ['binance', 'bybit', 'okx'],
      symbols: [],
      flushIntervalMs: 500,
      reapIntervalMs: 60_000,
      emitTrades: false,
      emitTickers: false,
    };
  }

  // ──────────────────── Lifecycle ───────────────────────────────────────

  /**
   * Start the engine: create streams, connect, subscribe symbols.
   * Each exchange is started in isolation — failures don't block others.
   */
  async start(config: Partial<MarketDataEngineConfig>): Promise<void> {
    if (this.running) {
      logger.warn('[Engine] Already running — ignoring duplicate start()');
      return;
    }

    this.config = { ...this.config, ...config };
    this.running = true;
    this.startedAt = Date.now();

    // Ensure built-in streams are registered
    if (!this.builtInRegistered) {
      registerBuiltInStreams();
      this.builtInRegistered = true;
    }

    logger.info(
      `[Engine] Starting market data engine for ${this.config.exchanges.length} exchange(s), ` +
        `${this.config.symbols.length} symbol(s)`,
    );

    // Create and connect each exchange stream in isolation
    for (const exchange of this.config.exchanges) {
      this.startExchange(exchange).catch((error) => {
        logger.error(`[Engine] Unhandled error starting ${exchange}:`, error);
      });
    }

    // Start periodic flush to Redis
    this.flushTimer = setInterval(() => {
      this.flushToRedis().catch((error) => {
        logger.error('[Engine] Unhandled flush error:', error);
      });
    }, this.config.flushIntervalMs);

    // Start periodic stale-key cleanup
    this.reapTimer = setInterval(async () => {
      try {
        await marketDataStore.reapStaleKeys(this.config.exchanges);
      } catch (error) {
        logger.error('[Engine] Error reaping stale keys:', error);
      }
    }, this.config.reapIntervalMs);
  }

  /**
   * Stop the entire engine: disconnect all streams, flush, clear timers.
   */
  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;

    logger.info('[Engine] Stopping market data engine');

    // Flush remaining data
    await this.flushToRedis();

    // Disconnect all streams
    const disconnects: Promise<void>[] = [];
    for (const [, entry] of this.streams) {
      disconnects.push(entry.stream.disconnect());
    }
    await Promise.allSettled(disconnects);

    // Clear timers
    if (this.flushTimer) clearInterval(this.flushTimer);
    if (this.reapTimer) clearInterval(this.reapTimer);
    this.flushTimer = null;
    this.reapTimer = null;

    this.streams.clear();
    logger.info('[Engine] Market data engine stopped');
  }

  // ──────────────────── Dynamic symbol management ───────────────────────

  /**
   * Update the symbol list on all streams.
   * Symbols are added/removed without reconnecting.
   */
  async setSymbols(symbols: string[]): Promise<void> {
    this.config.symbols = symbols;
    for (const [, entry] of this.streams) {
      if (entry.connected) {
        entry.stream.setSymbols(symbols);
      }
    }
    logger.info(`[Engine] Updated symbols: ${symbols.length} symbol(s)`);
  }

  /**
   * Add symbols to all streams.
   */
  async addSymbols(symbols: string[]): Promise<void> {
    const merged = [...new Set([...this.config.symbols, ...symbols])];
    await this.setSymbols(merged);
  }

  // ──────────────────── Health ──────────────────────────────────────────

  /**
   * Get health status of all streams.
   */
  getHealth(): StreamHealth[] {
    const result: StreamHealth[] = [];
    for (const [, entry] of this.streams) {
      result.push(entry.stream.getHealth());
    }
    return result;
  }

  /**
   * Get a summary string suitable for logging.
   */
  getHealthSummary(): string {
    const healths = this.getHealth();
    if (healths.length === 0) return 'No streams active';
    return healths
      .map(
        (h) =>
          `${h.exchange}: ${h.status} (uptime=${Math.round(h.uptimeMs / 1000)}s, ` +
          `reconnects=${h.reconnectAttempts}, msgs=${h.messagesReceived}, ` +
          `mps=${h.messagesPerSecond.toFixed(1)}, symbols=${h.subscribedSymbols})`,
      )
      .join(' | ');
  }

  /**
   * Check if at least one exchange stream is connected.
   */
  isAnyConnected(): boolean {
    for (const [, entry] of this.streams) {
      if (entry.connected) return true;
    }
    return false;
  }

  // ──────────────────── Subscribe / unsubscribe at runtime ──────────────

  /**
   * Subscribe to additional symbols on a specific exchange.
   */
  subscribeToExchange(exchange: string, symbols: string[]): void {
    const entry = this.streams.get(exchange);
    if (!entry || !entry.connected) {
      logger.warn(`[Engine] Cannot subscribe to ${exchange} — not connected`);
      return;
    }
    entry.stream.subscribeSymbols(symbols);
  }

  // ──────────────────── Internal ────────────────────────────────────────

  private async startExchange(exchange: string): Promise<void> {
    const stream = this.createStream(exchange);
    if (!stream) {
      logger.warn(`[Engine] No WS stream implementation for '${exchange}' — skipping`);
      return;
    }

    const entry: ExchangeStream = {
      exchange,
      stream,
      connected: false,
      lastError: null,
    };
    this.streams.set(exchange, entry);

    // Wire up events — isolated per exchange
    stream.on('connected', () => {
      entry.connected = true;
      entry.lastError = null;
      logger.info(`[Engine] ${exchange} stream connected`);
    });

    stream.on('disconnected', () => {
      entry.connected = false;
      logger.warn(`[Engine] ${exchange} stream disconnected`);
    });

    stream.on('error', (error: Error) => {
      entry.lastError = error.message;
      logger.error(`[Engine] ${exchange} stream error: ${error.message}`);
    });

    stream.on('exhausted', () => {
      entry.connected = false;
      entry.lastError = 'Reconnect attempts exhausted';
      logger.error(`[Engine] ${exchange} stream exhausted — will not reconnect`);
    });

    // Handle ticker events
    stream.on('ticker', (ticker: NormalizedTicker) => {
      this.tickerBuffer.push(ticker);
      if (this.config.emitTickers) {
        // Emit on the engine itself for downstream listeners
        this.emit('ticker', ticker);
      }
    });

    // Handle trade events
    if (this.config.emitTrades) {
      stream.on('trade', (trade: NormalizedTrade) => {
        this.emit('trade', trade);
      });
    }

    // Subscribe symbols before connecting so they're sent on connect
    if (this.config.symbols.length > 0) {
      stream.subscribeSymbols(this.config.symbols);
    }

    try {
      await stream.connect();
    } catch (error) {
      logger.error(`[Engine] Failed to start ${exchange} stream:`, error);
      entry.lastError = (error as Error).message;
      // Don't throw — failure is isolated to this exchange
    }
  }

  /**
   * Create a WsStream for the given exchange using the StreamRegistry.
   * Falls back to null if no factory is registered.
   */
  private createStream(exchange: string): WsStream | null {
    return streamRegistry.create(exchange);
  }

  private async flushToRedis(): Promise<void> {
    if (this.tickerBuffer.length === 0) return;

    const batch = this.tickerBuffer.splice(0); // take all
    try {
      await marketDataStore.setTickers(batch);
    } catch (error) {
      logger.error(`[Engine] Failed to flush ${batch.length} tickers to Redis:`, error);
    }
  }
}

// Singleton instance
export const marketDataEngine = new MarketDataEngine();
export { MarketDataEngine };
