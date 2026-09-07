import WebSocket from 'ws';
import { EventEmitter } from 'events';
import {
  NormalizedTicker,
  NormalizedTrade,
  NormalizedOrderBook,
  StreamHealth,
  StreamStatus,
} from './types';
import { logger } from '../utils/logger';

/**
 * Configuration common to every WS stream.
 */
export interface WsStreamConfig {
  /** Exchange slug, e.g. "binance". */
  exchange: string;
  /** WebSocket URL. */
  url: string;
  /** Max reconnect attempts before giving up (0 = infinite). */
  maxReconnectAttempts?: number;
  /** Base reconnect delay in ms (doubles each attempt, capped at 30s). */
  reconnectBaseDelayMs?: number;
  /** Heartbeat / ping interval in ms — if no message received in this window, force reconnect. */
  heartbeatTimeoutMs?: number;
  /** Max symbols this stream can subscribe to. */
  maxSubscriptions?: number;
  /** Max subscribe operations per second (rate-limit guard). Default: 5. */
  subscribeRateLimitPerSec?: number;
  /** Cooldown in ms after receiving a rate-limit signal before retrying. Default: 60_000. */
  rateLimitCooldownMs?: number;
}

/**
 * Abstract base class that all exchange WS streams extend.
 *
 * Provides:
 *  - Automatic reconnect with exponential back-off
 *  - Heartbeat detection (force reconnect on silence)
 *  - Connection health tracking (uptime, reconnects, messages/sec)
 *  - Symbol subscription management
 *  - Failure isolation (errors in one stream never propagate)
 *
 * Subclasses must implement:
 *  - `buildSubscribeMessage(symbols)` — exchange-specific subscribe JSON
 *  - `buildUnsubscribeMessage(symbols)` — exchange-specific unsubscribe JSON
 *  - `parseMessage(data)` — translate native WS payload → normalised events
 */
export abstract class WsStream extends EventEmitter {
  readonly exchange: string;

  protected ws: WebSocket | null = null;
  protected config: Required<WsStreamConfig>;
  protected subscribedSymbols = new Set<string>();
  protected status: StreamStatus = 'disconnected';

  // ── Health counters ──
  private reconnectAttempts = 0;
  private lastMessageAt: number | null = null;
  private lastError: string | null = null;
  private messagesReceived = 0;
  private messagesPerSecond = 0;
  private connectStartedAt = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private mpsTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private forceClosed = false;

  // ── Rate-limit tracking ──
  private subscribeTimestamps: number[] = [];
  private rateLimitedUntil = 0;
  private pendingSubscribes: string[] = [];
  private subscribeFlushTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: WsStreamConfig) {
    super();
    this.exchange = config.exchange;
    this.config = {
      maxReconnectAttempts: 50,
      reconnectBaseDelayMs: 1000,
      heartbeatTimeoutMs: 30_000,
      maxSubscriptions: 200,
      subscribeRateLimitPerSec: 5,
      rateLimitCooldownMs: 60_000,
      ...config,
    };
  }

  // ──────────────────── Public API ──────────────────────────────────────

  /** Open the WebSocket and start receiving data. */
  async connect(): Promise<void> {
    this.forceClosed = false;
    this.status = 'reconnecting';
    this._open();
  }

  /** Gracefully close the WebSocket. No reconnect. */
  async disconnect(): Promise<void> {
    this.forceClosed = true;
    this.status = 'disconnected';
    this.clearTimers();
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close(1000, 'shutdown');
      }
      this.ws = null;
    }
    logger.info(`[${this.exchange}] WS stream disconnected`);
  }

  /** Subscribe to additional symbols (does not reconnect — sends subscribe message). */
  subscribeSymbols(symbols: string[]): void {
    const newSymbols: string[] = [];
    for (const s of symbols) {
      if (this.subscribedSymbols.size >= this.config.maxSubscriptions) {
        logger.warn(
          `[${this.exchange}] Max subscriptions (${this.config.maxSubscriptions}) reached`,
        );
        break;
      }
      if (!this.subscribedSymbols.has(s)) {
        newSymbols.push(s);
      }
      this.subscribedSymbols.add(s);
    }

    if (newSymbols.length === 0) return;

    // Rate-limit guard: queue and flush at controlled rate
    if (this.isRateLimited()) {
      this.pendingSubscribes.push(...newSymbols);
      this.startSubscribeFlush();
      return;
    }

    this.throttledSendSubscribe(newSymbols);
  }

  /** Unsubscribe from symbols. */
  unsubscribeSymbols(symbols: string[]): void {
    for (const s of symbols) this.subscribedSymbols.delete(s);
    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buildUnsubscribeMessage(symbols);
      if (msg) this.ws.send(JSON.stringify(msg));
    }
  }

  /** Current health snapshot. */
  getHealth(): StreamHealth {
    const now = Date.now();
    return {
      exchange: this.exchange,
      status: this.status,
      uptimeMs: this.status === 'connected' ? now - this.connectStartedAt : 0,
      reconnectAttempts: this.reconnectAttempts,
      lastMessageAt: this.lastMessageAt,
      lastError: this.lastError,
      subscribedSymbols: this.subscribedSymbols.size,
      messagesReceived: this.messagesReceived,
      messagesPerSecond: this.messagesPerSecond,
    };
  }

  /** Replace the subscribed symbol set entirely and re-send subscription. */
  setSymbols(symbols: string[]): void {
    // Unsubscribe old symbols not in new set
    const toUnsub = [...this.subscribedSymbols].filter((s) => !symbols.includes(s));
    this.unsubscribeSymbols(toUnsub);
    // Subscribe new symbols not already tracked
    const toSub = symbols.filter((s) => !this.subscribedSymbols.has(s));
    this.subscribeSymbols(toSub);
  }

  // ──────────────────── Abstract methods ────────────────────────────────

  /** Build the subscribe message(s) to send over the WS. */
  protected abstract buildSubscribeMessage(symbols: string[]): unknown;

  /** Build the unsubscribe message(s) to send over the WS. */
  protected abstract buildUnsubscribeMessage(symbols: string[]): unknown;

  /**
   * Parse a raw WS message and emit normalised events.
   *
   * Must call one of `this.emitTicker()`, `this.emitTrade()`, or
   * `this.emitOrderBook()` for each data point extracted.
   */
  protected abstract parseMessage(data: WebSocket.Data): void;

  /**
   * Signal that the exchange returned a rate-limit response.
   * Subclasses should call this when they detect a 429 / rate-limit
   * message from the exchange.
   */
  protected signalRateLimit(retryAfterMs?: number): void {
    const cooldown = retryAfterMs ?? this.config.rateLimitCooldownMs;
    this.rateLimitedUntil = Date.now() + cooldown;
    logger.warn(`[${this.exchange}] Rate-limited for ${cooldown}ms`);
  }

  /** Check if we are currently rate-limited. */
  protected isRateLimited(): boolean {
    return Date.now() < this.rateLimitedUntil;
  }

  // ──────────────────── Internal ────────────────────────────────────────

  private _open(): void {
    try {
      this.ws = new WebSocket(this.config.url);

      this.ws.on('open', () => {
        this.status = 'connected';
        this.reconnectAttempts = 0;
        this.connectStartedAt = Date.now();
        this.lastError = null;
        logger.info(`[${this.exchange}] WS connected to ${this.config.url}`);
        this.startHeartbeat();
        // Re-subscribe any symbols we had before a reconnect
        if (this.subscribedSymbols.size > 0) {
          const msg = this.buildSubscribeMessage([...this.subscribedSymbols]);
          if (msg) this.ws!.send(JSON.stringify(msg));
        }
        this.emit('connected');
      });

      this.ws.on('message', (raw: WebSocket.Data) => {
        this.messagesReceived++;
        this.lastMessageAt = Date.now();
        try {
          this.parseMessage(raw);
        } catch (error) {
          logger.error(`[${this.exchange}] Error parsing WS message:`, error);
        }
      });

      this.ws.on('close', (code: number, reason: Buffer) => {
        logger.warn(`[${this.exchange}] WS closed: ${code} ${reason.toString()}`);
        this.status = 'disconnected';
        this.stopHeartbeat();
        this.emit('disconnected', code);
        if (!this.forceClosed) this.scheduleReconnect();
      });

      this.ws.on('error', (error: Error) => {
        this.lastError = error.message;
        logger.error(`[${this.exchange}] WS error: ${error.message}`);
        this.status = 'error';
        this.emit('error', error);
        // `close` event will fire after error — reconnect handled there
      });

      this.ws.on('ping', () => {
        this.lastMessageAt = Date.now();
        // Auto-pong is handled by ws library
      });

      this.ws.on('pong', () => {
        this.lastMessageAt = Date.now();
      });
    } catch (error) {
      logger.error(`[${this.exchange}] Failed to create WS connection:`, error);
      this.lastError = (error as Error).message;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.forceClosed) return;
    if (
      this.config.maxReconnectAttempts > 0 &&
      this.reconnectAttempts >= this.config.maxReconnectAttempts
    ) {
      this.lastError = 'Reconnect attempts exhausted';
      logger.error(
        `[${this.exchange}] Max reconnect attempts (${this.config.maxReconnectAttempts}) exhausted`,
      );
      this.status = 'error';
      this.emit('exhausted');
      return;
    }

    this.reconnectAttempts++;
    this.status = 'reconnecting';
    let delay = Math.min(
      this.config.reconnectBaseDelayMs * Math.pow(2, this.reconnectAttempts - 1),
      30_000,
    );
    // If we're rate-limited, add the remaining cooldown to the reconnect delay
    if (this.isRateLimited()) {
      const remaining = this.rateLimitedUntil - Date.now();
      delay = Math.max(delay, remaining);
    }
    logger.info(
      `[${this.exchange}] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`,
    );
    this.reconnectTimer = setTimeout(() => this._open(), delay);
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const timeout = this.config.heartbeatTimeoutMs;
    this.heartbeatTimer = setInterval(() => {
      if (!this.lastMessageAt) return; // no messages yet, don't kill
      const silent = Date.now() - this.lastMessageAt;
      if (silent > timeout) {
        logger.warn(`[${this.exchange}] Heartbeat timeout (${silent}ms) — forcing reconnect`);
        this.ws?.terminate(); // will fire 'close' → reconnect
      }
    }, timeout / 2);

    // Messages-per-second counter
    this.mpsTimer = setInterval(() => {
      this.messagesPerSecond =
        this.messagesReceived / ((Date.now() - (this.connectStartedAt || Date.now())) / 1000) || 0;
    }, 5000);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.mpsTimer) clearInterval(this.mpsTimer);
    this.heartbeatTimer = null;
    this.mpsTimer = null;
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
    if (this.subscribeFlushTimer) clearInterval(this.subscribeFlushTimer);
    this.subscribeFlushTimer = null;
    this.pendingSubscribes = [];
  }

  /**
   * Throttled subscribe: enforces the per-second rate limit.
   */
  private throttledSendSubscribe(symbols: string[]): void {
    const now = Date.now();
    // Prune timestamps older than 1 second
    this.subscribeTimestamps = this.subscribeTimestamps.filter((t) => now - t < 1000);

    if (this.subscribeTimestamps.length >= this.config.subscribeRateLimitPerSec) {
      // At the limit — queue for later
      this.pendingSubscribes.push(...symbols);
      this.startSubscribeFlush();
      return;
    }

    if (this.ws?.readyState === WebSocket.OPEN) {
      const msg = this.buildSubscribeMessage(symbols);
      if (msg) this.ws.send(JSON.stringify(msg));
      this.subscribeTimestamps.push(now);
    }
  }

  /**
   * Start a periodic flush that drains pending subscribes at the allowed rate.
   */
  private startSubscribeFlush(): void {
    if (this.subscribeFlushTimer) return; // already running
    this.subscribeFlushTimer = setInterval(() => {
      if (this.pendingSubscribes.length === 0) {
        if (this.subscribeFlushTimer) clearInterval(this.subscribeFlushTimer);
        this.subscribeFlushTimer = null;
        return;
      }
      if (this.isRateLimited()) return; // still cooling down

      const now = Date.now();
      this.subscribeTimestamps = this.subscribeTimestamps.filter((t) => now - t < 1000);
      const capacity = this.config.subscribeRateLimitPerSec - this.subscribeTimestamps.length;
      if (capacity <= 0) return;

      const batch = this.pendingSubscribes.splice(0, capacity);
      this.throttledSendSubscribe(batch);
    }, 250); // check every 250ms
  }

  // ──────────────────── Emit helpers (used by subclasses) ───────────────

  protected emitTicker(ticker: NormalizedTicker): void {
    this.emit('ticker', ticker);
  }

  protected emitTrade(trade: NormalizedTrade): void {
    this.emit('trade', trade);
  }

  protected emitOrderBook(book: NormalizedOrderBook): void {
    this.emit('orderbook', book);
  }
}
