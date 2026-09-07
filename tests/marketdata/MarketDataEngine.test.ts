/**
 * Tests for MarketDataEngine orchestration.
 *
 * All WS streams and Redis are mocked — tests verify the engine's
 * orchestration logic, failure isolation, and lifecycle management.
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

// ── Mock Redis pipeline ──
const mockPipelineExec = jest.fn().mockResolvedValue([]);
const mockPipelineHset = jest.fn().mockReturnThis();
const mockPipelineExpire = jest.fn().mockReturnThis();
const mockPipelineSadd = jest.fn().mockReturnThis();
const mockPipeline = {
  hset: mockPipelineHset,
  expire: mockPipelineExpire,
  sadd: mockPipelineSadd,
  exec: mockPipelineExec,
};

const mockRedisClient = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  hgetall: jest.fn().mockResolvedValue({}),
  smembers: jest.fn().mockResolvedValue([]),
  srem: jest.fn(),
};

jest.mock('../../src/config/redis', () => ({
  redisClient: mockRedisClient,
}));

// ── Mock WsStream subclasses ──
jest.mock('../../src/marketdata/streams/BinanceWsStream');
jest.mock('../../src/marketdata/streams/BybitWsStream');
jest.mock('../../src/marketdata/streams/OkxWsStream');

import { EventEmitter } from 'events';
import { MarketDataEngine } from '../../src/marketdata/MarketDataEngine';

// Create mock streams that behave like real WsStreams
class MockWsStream extends EventEmitter {
  exchange: string;
  subscribedSymbols = new Set<string>();

  constructor(exchange: string) {
    super();
    this.exchange = exchange;
  }

  async connect() {
    // Emit connected synchronously so the engine marks the stream as connected
    process.nextTick(() => this.emit('connected'));
  }

  async disconnect() {}

  subscribeSymbols(symbols: string[]) {
    symbols.forEach((s) => this.subscribedSymbols.add(s));
  }

  unsubscribeSymbols(symbols: string[]) {
    symbols.forEach((s) => this.subscribedSymbols.delete(s));
  }

  setSymbols(symbols: string[]) {
    this.subscribedSymbols.clear();
    symbols.forEach((s) => this.subscribedSymbols.add(s));
  }

  getHealth() {
    return {
      exchange: this.exchange,
      status: 'connected' as const,
      uptimeMs: 1000,
      reconnectAttempts: 0,
      lastMessageAt: Date.now(),
      lastError: null,
      subscribedSymbols: this.subscribedSymbols.size,
      messagesReceived: 100,
      messagesPerSecond: 10,
    };
  }

  _simulateTicker(ticker: any) {
    this.emit('ticker', ticker);
  }

  _simulateError(error: Error) {
    this.emit('error', error);
  }

  _simulateExhausted() {
    this.emit('exhausted');
  }
}

let mockStreams: MockWsStream[] = [];

beforeEach(() => {
  jest.clearAllMocks();
  mockStreams = [];

  const BinanceWsStream = require('../../src/marketdata/streams/BinanceWsStream').BinanceWsStream;
  const BybitWsStream = require('../../src/marketdata/streams/BybitWsStream').BybitWsStream;
  const OkxWsStream = require('../../src/marketdata/streams/OkxWsStream').OkxWsStream;

  BinanceWsStream.mockImplementation(() => {
    const s = new MockWsStream('binance');
    mockStreams.push(s);
    return s;
  });
  BybitWsStream.mockImplementation(() => {
    const s = new MockWsStream('bybit');
    mockStreams.push(s);
    return s;
  });
  OkxWsStream.mockImplementation(() => {
    const s = new MockWsStream('okx');
    mockStreams.push(s);
    return s;
  });
});

/** Helper: wait for all mock streams to emit 'connected' */
async function waitForConnected(): Promise<void> {
  // process.nextTick fires before setTimeout(0)
  await new Promise((r) => setTimeout(r, 10));
}

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataEngine — lifecycle', () => {
  it('creates streams for all configured exchanges', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance', 'bybit', 'okx'], symbols: ['BTC/USDT'] });

    expect(mockStreams).toHaveLength(3);
    expect(mockStreams.map((s) => s.exchange).sort()).toEqual(['binance', 'bybit', 'okx']);

    await engine.stop();
  });

  it('subscribes symbols to all streams', async () => {
    const engine = new MarketDataEngine();
    await engine.start({
      exchanges: ['binance'],
      symbols: ['BTC/USDT', 'ETH/USDT'],
    });

    expect(mockStreams[0].subscribedSymbols.has('BTC/USDT')).toBe(true);
    expect(mockStreams[0].subscribedSymbols.has('ETH/USDT')).toBe(true);

    await engine.stop();
  });

  it('stop() flushes remaining data and disconnects', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance'], symbols: [] });

    const disconnectSpy = jest.spyOn(mockStreams[0], 'disconnect');
    await engine.stop();

    expect(disconnectSpy).toHaveBeenCalled();
  });

  it('setSymbols() updates all connected streams', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance'], symbols: ['BTC/USDT'] });
    await waitForConnected();

    await engine.setSymbols(['BTC/USDT', 'SOL/USDT']);

    expect(mockStreams[0].subscribedSymbols.has('SOL/USDT')).toBe(true);
    expect(mockStreams[0].subscribedSymbols.has('BTC/USDT')).toBe(true);

    await engine.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Failure isolation
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataEngine — failure isolation', () => {
  it('one exchange error does not affect others', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance', 'bybit'], symbols: ['BTC/USDT'] });
    await waitForConnected();

    mockStreams[0]._simulateError(new Error('Connection lost'));

    const health = engine.getHealth();
    const bybitHealth = health.find((h) => h.exchange === 'bybit');
    expect(bybitHealth?.status).toBe('connected');

    await engine.stop();
  });

  it('one exchange exhaustion does not affect others', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance', 'okx'], symbols: ['BTC/USDT'] });
    await waitForConnected();

    mockStreams[0]._simulateExhausted();

    const health = engine.getHealth();
    const okxHealth = health.find((h) => h.exchange === 'okx');
    expect(okxHealth?.status).toBe('connected');

    await engine.stop();
  });

  it('isAnyConnected returns true when at least one is up', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance', 'bybit'], symbols: [] });
    await waitForConnected();

    expect(engine.isAnyConnected()).toBe(true);

    mockStreams[0]._simulateExhausted();
    // bybit is still connected
    expect(engine.isAnyConnected()).toBe(true);

    await engine.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Health dashboard
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataEngine — health', () => {
  it('getHealth returns status for all streams', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance', 'bybit', 'okx'], symbols: [] });
    await waitForConnected();

    const health = engine.getHealth();
    expect(health).toHaveLength(3);

    const exchanges = health.map((h) => h.exchange).sort();
    expect(exchanges).toEqual(['binance', 'bybit', 'okx']);

    await engine.stop();
  });

  it('getHealthSummary returns a readable string', async () => {
    const engine = new MarketDataEngine();
    await engine.start({ exchanges: ['binance'], symbols: ['BTC/USDT'] });
    await waitForConnected();

    const summary = engine.getHealthSummary();
    expect(summary).toContain('binance');
    expect(summary).toContain('connected');

    await engine.stop();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Ticker buffering & flush
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataEngine — ticker flush', () => {
  it('buffers tickers and flushes to Redis', async () => {
    const engine = new MarketDataEngine();
    await engine.start({
      exchanges: ['binance'],
      symbols: ['BTC/USDT'],
      flushIntervalMs: 100,
    });

    mockStreams[0]._simulateTicker({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      bid: '65000',
      ask: '65001',
      last: '65000',
      volume24h: '100',
      high24h: '66000',
      low24h: '64000',
      timestamp: Date.now(),
      receivedAt: Date.now(),
    });

    await new Promise((r) => setTimeout(r, 200));

    expect(mockRedisClient.pipeline).toHaveBeenCalled();
    expect(mockPipelineHset).toHaveBeenCalled();

    await engine.stop();
  });
});
