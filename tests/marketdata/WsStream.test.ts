/**
 * Tests for WsStream base class.
 *
 * Uses a fully mocked WebSocket — no real connections are made.
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
let mockReadyState = 1; // OPEN

const mockWsInstances: any[] = [];

jest.mock('ws', () => {
  const MockWs: any = jest.fn().mockImplementation(() => {
    const instance = {
      readyState: mockReadyState,
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
  // Set the constants that WsStream checks against
  MockWs.CONNECTING = 0;
  MockWs.OPEN = 1;
  MockWs.CLOSING = 2;
  MockWs.CLOSED = 3;
  return MockWs;
});

import WebSocket from 'ws';
import { WsStream } from '../../src/marketdata/WsStream';
import type { NormalizedTicker } from '../../src/marketdata/types';

// Concrete test subclass
class TestWsStream extends WsStream {
  protected buildSubscribeMessage(symbols: string[]): unknown {
    return { op: 'subscribe', symbols };
  }
  protected buildUnsubscribeMessage(symbols: string[]): unknown {
    return { op: 'unsubscribe', symbols };
  }
  protected parseMessage(data: WebSocket.Data): void {
    const msg = JSON.parse(data.toString());
    if (msg.type === 'ticker') {
      this.emitTicker({
        exchange: 'testex',
        symbol: msg.symbol,
        bid: String(msg.bid),
        ask: String(msg.ask),
        last: String(msg.last),
        volume24h: '0',
        high24h: '0',
        low24h: '0',
        timestamp: Date.now(),
        receivedAt: Date.now(),
      });
    }
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  mockWsInstances.length = 0;
  mockReadyState = 1;
});

// ═══════════════════════════════════════════════════════════════════════
// Connection & lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — connection lifecycle', () => {
  it('creates a WebSocket on connect()', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    expect(WebSocket).toHaveBeenCalledWith('wss://test.com');
    expect(mockWsInstances).toHaveLength(1);
  });

  it('sets status to connected when WS opens', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    expect(stream.getHealth().status).toBe('connected');
    expect(stream.getHealth().reconnectAttempts).toBe(0);
  });

  it('disconnect() closes the WebSocket and sets status', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    await stream.disconnect();

    expect(stream.getHealth().status).toBe('disconnected');
    expect(mockClose).toHaveBeenCalled();
  });

  it('disconnect() does not trigger reconnect', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 10,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    await stream.disconnect();
    // Simulate close event after disconnect
    mockWsInstances[0]._trigger('close', 1000, Buffer.from('normal'));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockWsInstances).toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Reconnect
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — reconnect', () => {
  it('reconnects after unexpected close', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 10,
      maxReconnectAttempts: 3,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    mockWsInstances[0]._trigger('close', 1006, Buffer.from('abnormal'));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockWsInstances.length).toBeGreaterThanOrEqual(2);
  });

  it('does not reconnect after forced disconnect', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 10,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    await stream.disconnect();
    mockWsInstances[0]._trigger('close', 1000, Buffer.from('normal'));
    await new Promise((r) => setTimeout(r, 50));

    expect(mockWsInstances).toHaveLength(1);
  });

  it('increments reconnect attempts', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 10,
      maxReconnectAttempts: 5,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    mockWsInstances[0]._trigger('close', 1006, Buffer.from('abnormal'));
    await new Promise((r) => setTimeout(r, 50));

    expect(stream.getHealth().reconnectAttempts).toBeGreaterThanOrEqual(1);
  });

  it('emits exhausted when max attempts exceeded', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      reconnectBaseDelayMs: 1,
      maxReconnectAttempts: 1,
    });
    const exhaustedPromise = new Promise<void>((resolve) => {
      stream.on('exhausted', () => resolve());
    });

    await stream.connect();
    mockWsInstances[0]._trigger('open');

    // First close triggers reconnect attempt 1 (which succeeds as a new WS)
    mockWsInstances[0]._trigger('close', 1006, Buffer.from('abnormal'));
    // Wait for the reconnect timer
    await new Promise((r) => setTimeout(r, 10));

    // Now trigger close on the second WS — this should exhaust
    if (mockWsInstances[1]) {
      mockWsInstances[1]._trigger('close', 1006, Buffer.from('abnormal'));
    }

    // Wait for the second reconnect timer
    await new Promise((r) => setTimeout(r, 10));

    const health = stream.getHealth();
    expect(health.status).toBe('error');
    expect(health.lastError).toBe('Reconnect attempts exhausted');
  }, 10_000);
});

// ═══════════════════════════════════════════════════════════════════════
// Message handling
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — message handling', () => {
  it('parses messages and emits ticker events', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    const received: NormalizedTicker[] = [];
    stream.on('ticker', (t: NormalizedTicker) => received.push(t));

    await stream.connect();
    mockWsInstances[0]._trigger('open');

    mockWsInstances[0]._trigger(
      'message',
      Buffer.from(
        JSON.stringify({ type: 'ticker', symbol: 'BTC/USDT', bid: 64000, ask: 65000, last: 64500 }),
      ),
    );

    expect(received).toHaveLength(1);
    expect(received[0].symbol).toBe('BTC/USDT');
    expect(received[0].exchange).toBe('testex');
    expect(received[0].bid).toBe('64000');
  });

  it('increments messagesReceived counter', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    mockWsInstances[0]._trigger('message', Buffer.from('{"type":"ping"}'));
    mockWsInstances[0]._trigger(
      'message',
      Buffer.from('{"type":"ticker","symbol":"X/USDT","bid":1,"ask":2,"last":1.5}'),
    );

    expect(stream.getHealth().messagesReceived).toBe(2);
  });

  it('does not crash on malformed JSON', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    mockWsInstances[0]._trigger('message', Buffer.from('not json'));
    expect(stream.getHealth().status).toBe('connected');
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Symbol management
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — symbol management', () => {
  it('subscribeSymbols sends subscribe message when connected', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['BTC/USDT']);

    expect(mockSend).toHaveBeenCalledWith(
      JSON.stringify({ op: 'subscribe', symbols: ['BTC/USDT'] }),
    );
  });

  it('tracks subscribed symbols count', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      maxSubscriptions: 5,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['BTC/USDT', 'ETH/USDT']);

    expect(stream.getHealth().subscribedSymbols).toBe(2);
  });

  it('respects maxSubscriptions limit', async () => {
    const stream = new TestWsStream({
      exchange: 'testex',
      url: 'wss://test.com',
      maxSubscriptions: 2,
    });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['A/USDT', 'B/USDT', 'C/USDT']);

    expect(stream.getHealth().subscribedSymbols).toBe(2);
  });

  it('setSymbols replaces the subscribed set', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    stream.subscribeSymbols(['BTC/USDT', 'ETH/USDT']);
    stream.setSymbols(['ETH/USDT', 'SOL/USDT']);

    expect(stream.getHealth().subscribedSymbols).toBe(2);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Health
// ═══════════════════════════════════════════════════════════════════════

describe('WsStream — health', () => {
  it('reports initial disconnected state', () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    const health = stream.getHealth();
    expect(health.status).toBe('disconnected');
    expect(health.reconnectAttempts).toBe(0);
    expect(health.messagesReceived).toBe(0);
    expect(health.subscribedSymbols).toBe(0);
  });

  it('tracks uptime after connection', async () => {
    const stream = new TestWsStream({ exchange: 'testex', url: 'wss://test.com' });
    await stream.connect();
    mockWsInstances[0]._trigger('open');

    await new Promise((r) => setTimeout(r, 20));

    expect(stream.getHealth().uptimeMs).toBeGreaterThan(0);
  });
});
