/**
 * Tests for WsStream rate-limiting features.
 *
 * Verifies subscribe throttling, rate-limit signaling, and cooldown behavior.
 * Uses fully mocked WebSocket — no real connections.
 */

// ── Mock logger ──
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Mock WebSocket ──
const mockSend = jest.fn();
const mockClose = jest.fn();
const mockTerminate = jest.fn();
const mockRemoveAllListeners = jest.fn();

const mockWsInstances: any[] = [];

jest.mock('ws', () => {
  const MockWs: any = jest.fn().mockImplementation(() => {
    const instance = {
      readyState: 1, // OPEN
      send: mockSend,
      close: mockClose,
      terminate: mockTerminate,
      removeAllListeners: mockRemoveAllListeners,
      on: jest.fn(),
      _trigger: (event: string, ...args: any[]) => {
        const handler = instance.on.mock.calls.find((c: any[]) => c[0] === event);
        if (handler) handler[1](...args);
      },
    };
    mockWsInstances.push(instance);
    return instance;
  });
  MockWs.CONNECTING = 0;
  MockWs.OPEN = 1;
  MockWs.CLOSING = 2;
  MockWs.CLOSED = 3;
  return MockWs;
});

import { WsStream } from '../../src/marketdata/WsStream';
/** Concrete test subclass with very low rate limits for fast tests. */
class RateLimitTestStream extends WsStream {
  protected buildSubscribeMessage(symbols: string[]): unknown {
    return { op: 'subscribe', symbols };
  }
  protected buildUnsubscribeMessage(symbols: string[]): unknown {
    return { op: 'unsubscribe', symbols };
  }
  protected parseMessage(data: any): void {
    // no-op
  }

  /** Expose the protected method for testing. */
  public triggerSignalRateLimit(retryAfterMs?: number): void {
    this.signalRateLimit(retryAfterMs);
  }

  /** Expose the protected method for testing. */
  public checkRateLimited(): boolean {
    return this.isRateLimited();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWsInstances.length = 0;
});

// ═══════════════════════════════════════════════════════════════════════
// Rate-limit signaling
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — rate-limit signaling', () => {
  it('isRateLimited returns false initially', () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
    });
    expect(stream.checkRateLimited()).toBe(false);
  });

  it('signalRateLimit marks stream as rate-limited', () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
    });
    stream.triggerSignalRateLimit(5000);
    expect(stream.checkRateLimited()).toBe(true);
  });

  it('rate limit expires after cooldown', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
      rateLimitCooldownMs: 50,
    });
    stream.triggerSignalRateLimit(50);
    expect(stream.checkRateLimited()).toBe(true);

    await new Promise((r) => setTimeout(r, 80));
    expect(stream.checkRateLimited()).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Subscribe throttling
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — subscribe throttling', () => {
  it('queues subscribes when rate-limited', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
      rateLimitCooldownMs: 200,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    // Signal rate limit, then try to subscribe
    stream.triggerSignalRateLimit(200);
    stream.subscribeSymbols(['BTC/USDT', 'ETH/USDT']);

    // Should not have sent a subscribe message (rate-limited)
    const subscribeCalls = mockSend.mock.calls.filter((c: string[]) =>
      c[0].includes('"subscribe"'),
    );
    expect(subscribeCalls).toHaveLength(0);

    // But symbols should be tracked
    expect(stream.getHealth().subscribedSymbols).toBe(2);
  });

  it('does not queue subscribes when not rate-limited', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
      subscribeRateLimitPerSec: 10,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['BTC/USDT']);

    const subscribeCalls = mockSend.mock.calls.filter((c: string[]) =>
      c[0].includes('"subscribe"'),
    );
    expect(subscribeCalls).toHaveLength(1);
  });

  it('does not send duplicate subscribes for already-tracked symbols', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['BTC/USDT']);
    stream.subscribeSymbols(['BTC/USDT']); // duplicate

    const subscribeCalls = mockSend.mock.calls.filter((c: string[]) =>
      c[0].includes('"subscribe"'),
    );
    expect(subscribeCalls).toHaveLength(1);
  });

  it('pending subscribes are cleared on disconnect', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
      rateLimitCooldownMs: 5000,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.triggerSignalRateLimit(5000);
    stream.subscribeSymbols(['BTC/USDT']);

    await stream.disconnect();

    // After disconnect, no stale timers or pending subscribes should cause issues
    expect(stream.getHealth().status).toBe('disconnected');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Rate-limit-aware reconnect
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — rate-limit-aware reconnect', () => {
  it('delays reconnect when rate-limited', async () => {
    const stream = new RateLimitTestStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 10,
      maxReconnectAttempts: 5,
      rateLimitCooldownMs: 500,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    // Signal rate limit
    stream.triggerSignalRateLimit(500);

    // Simulate unexpected close
    mockWsInstances[0]._trigger('close', 1006, Buffer.from('abnormal'));

    // After 100ms, should not have reconnected yet (rate-limited for 500ms)
    await new Promise((r) => setTimeout(r, 100));
    expect(mockWsInstances).toHaveLength(1); // still only the original
  });
});
