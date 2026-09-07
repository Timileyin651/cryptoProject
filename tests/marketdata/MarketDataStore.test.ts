/**
 * Tests for MarketDataStore.
 *
 * All Redis operations are mocked — no real Redis connection needed.
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
const mockPipelineExists = jest.fn().mockReturnThis();
const mockPipelineHgetall = jest.fn().mockReturnThis();

const mockPipeline = {
  hset: mockPipelineHset,
  hgetall: mockPipelineHgetall,
  expire: mockPipelineExpire,
  sadd: mockPipelineSadd,
  exists: mockPipelineExists,
  exec: mockPipelineExec,
};

// ── Mock Redis client ──
const mockRedisClient = {
  pipeline: jest.fn().mockReturnValue(mockPipeline),
  hgetall: jest.fn(),
  smembers: jest.fn(),
  srem: jest.fn(),
};

jest.mock('../../src/config/redis', () => ({
  redisClient: mockRedisClient,
}));

import { MarketDataStore } from '../../src/marketdata/MarketDataStore';
import type { NormalizedTicker } from '../../src/marketdata/types';

let store: MarketDataStore;

beforeEach(() => {
  jest.clearAllMocks();
  store = new MarketDataStore();
  // Re-set default pipeline mock after clearAllMocks
  mockRedisClient.pipeline.mockReturnValue(mockPipeline);
  mockPipeline.hset.mockReturnThis();
  mockPipeline.hgetall.mockReturnThis();
  mockPipeline.expire.mockReturnThis();
  mockPipeline.sadd.mockReturnThis();
  mockPipeline.exists.mockReturnThis();
  mockPipeline.exec.mockResolvedValue([]);
});

function makeTicker(overrides: Partial<NormalizedTicker> = {}): NormalizedTicker {
  return {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    bid: '64999',
    ask: '65001',
    last: '65000',
    volume24h: '12345',
    high24h: '66000',
    low24h: '63000',
    timestamp: Date.now(),
    receivedAt: Date.now(),
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// setTicker
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataStore — setTicker', () => {
  it('writes a ticker to Redis hash via pipeline', async () => {
    await store.setTicker(makeTicker());

    expect(mockRedisClient.pipeline).toHaveBeenCalled();
    expect(mockPipelineHset).toHaveBeenCalledWith(
      'md:binance:BTC_USDT',
      expect.objectContaining({
        exchange: 'binance',
        symbol: 'BTC/USDT',
        bid: '64999',
        ask: '65001',
      }),
    );
    expect(mockPipelineExpire).toHaveBeenCalledWith('md:binance:BTC_USDT', 300);
    expect(mockPipelineSadd).toHaveBeenCalledWith('md:binance:keys', 'md:binance:BTC_USDT');
  });

  it('includes pre-computed spread and midPrice', async () => {
    await store.setTicker(makeTicker({ bid: '64000', ask: '66000' }));

    expect(mockPipelineHset).toHaveBeenCalledWith(
      'md:binance:BTC_USDT',
      expect.objectContaining({
        spread: '2000',
        midPrice: '65000',
      }),
    );
  });
});

// ═══════════════════════════════════════════════════════════════════════
// setTickers (batch)
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataStore — setTickers', () => {
  it('batches multiple tickers in one pipeline', async () => {
    await store.setTickers([
      makeTicker({ symbol: 'BTC/USDT' }),
      makeTicker({ symbol: 'ETH/USDT' }),
    ]);

    expect(mockPipelineHset).toHaveBeenCalledTimes(2);
    expect(mockPipelineExpire).toHaveBeenCalledTimes(4);
  });

  it('does nothing for empty array', async () => {
    await store.setTickers([]);
    expect(mockRedisClient.pipeline).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getTicker
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataStore — getTicker', () => {
  it('returns hash fields when data exists', async () => {
    mockRedisClient.hgetall.mockResolvedValue({
      exchange: 'binance',
      symbol: 'BTC/USDT',
      bid: '65000',
      ask: '65001',
    });

    const result = await store.getTicker('binance', 'BTC/USDT');
    expect(result).not.toBeNull();
    expect(result!.bid).toBe('65000');
  });

  it('returns null when no data exists', async () => {
    mockRedisClient.hgetall.mockResolvedValue({});

    const result = await store.getTicker('binance', 'FAKE/USDT');
    expect(result).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// getAllTickersForExchange
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataStore — getAllTickersForExchange', () => {
  it('returns all tickers for an exchange', async () => {
    mockRedisClient.smembers.mockResolvedValue(['md:binance:BTC_USDT', 'md:binance:ETH_USDT']);

    // Mock pipeline exec to return 2 results
    mockPipeline.exec.mockResolvedValue([
      [null, { exchange: 'binance', symbol: 'BTC/USDT', bid: '65000' }],
      [null, { exchange: 'binance', symbol: 'ETH/USDT', bid: '3500' }],
    ]);

    const results = await store.getAllTickersForExchange('binance');
    expect(results).toHaveLength(2);
    expect(results[0].symbol).toBe('BTC/USDT');
    expect(results[1].symbol).toBe('ETH/USDT');
  });

  it('returns empty array when no keys exist', async () => {
    mockRedisClient.smembers.mockResolvedValue([]);
    const results = await store.getAllTickersForExchange('binance');
    expect(results).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// reapStaleKeys
// ═══════════════════════════════════════════════════════════════════════

describe('MarketDataStore — reapStaleKeys', () => {
  it('removes keys that no longer exist in Redis', async () => {
    // Mock smembers to return different values per exchange
    mockRedisClient.smembers
      .mockResolvedValueOnce(['md:binance:BTC_USDT', 'md:binance:STALE_USDT'])
      .mockResolvedValueOnce([]) // bybit — no keys
      .mockResolvedValueOnce([]); // okx — no keys

    // Mock pipeline exec for binance: BTC exists (1), STALE does not (0)
    mockPipeline.exec.mockResolvedValue([
      [null, 1], // BTC exists
      [null, 0], // STALE does not exist
    ]);

    const reaped = await store.reapStaleKeys(['binance', 'bybit', 'okx']);
    expect(reaped).toBe(1);
    expect(mockRedisClient.srem).toHaveBeenCalledWith('md:binance:keys', 'md:binance:STALE_USDT');
  });

  it('returns 0 when all keys are still valid', async () => {
    mockRedisClient.smembers
      .mockResolvedValueOnce(['md:binance:BTC_USDT'])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    mockPipeline.exec.mockResolvedValue([[null, 1]]);

    const reaped = await store.reapStaleKeys(['binance', 'bybit', 'okx']);
    expect(reaped).toBe(0);
  });
});
