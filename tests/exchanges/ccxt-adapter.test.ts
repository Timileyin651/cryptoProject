/**
 * Tests for CcxtAdapter base class.
 *
 * All tests use a fully mocked CCXT instance — no live exchange calls
 * are ever made, including in CI.
 */

// ── Mock the logger so test output stays clean ──
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

// ── Stub CCXT — every test controls the return values ──
const mockFetchTicker = jest.fn();
const mockFetchOrderBook = jest.fn();
const mockFetchTrades = jest.fn();
const mockFetchCurrencies = jest.fn();
const mockLoadMarkets = jest.fn();
const mockClose = jest.fn();

const mockHas = {
  spot: true,
  swap: true,
  future: false,
  margin: true,
  ws: false,
  fetchMarkets: true,
  fetchTicker: true,
  fetchOrderBook: true,
  fetchTrades: true,
  fetchCurrencies: true,
};

function makeMockExchange(hasOverrides: Record<string, boolean> = {}) {
  return {
    has: { ...mockHas, ...hasOverrides },
    loadMarkets: mockLoadMarkets,
    fetchTicker: mockFetchTicker,
    fetchOrderBook: mockFetchOrderBook,
    fetchTrades: mockFetchTrades,
    fetchCurrencies: mockFetchCurrencies,
    close: mockClose,
  };
}

// ── We need to construct the adapter without importing real CCXT ──
// Build a minimal concrete subclass that accepts a mock exchange instance.
import type { CcxtConfig } from '../../src/exchanges/CcxtAdapter';
import { CcxtAdapter } from '../../src/exchanges/CcxtAdapter';
import type { AdapterCapabilities } from '../../src/exchanges/ExchangeAdapter';
import {
  ExchangeRateLimitError,
  ExchangeSymbolNotFoundError,
  ExchangeNetworkError,
  ExchangeDataError,
} from '../../src/exchanges/errors';

class TestAdapter extends CcxtAdapter {
  readonly slug = 'testex';
  readonly name = 'Test Exchange';
  readonly baseUrl = 'https://api.testex.com';

  constructor(config: CcxtConfig = {}, hasOverrides: Record<string, boolean> = {}) {
    // We don't actually call super with a real CCXT class —
    // instead we set up the mock and inject it after construction.
    super(class {}, 'testex', config);
    // Inject mock exchange directly
    (this as any).exchange = makeMockExchange(hasOverrides);
    (this as any)._capabilities = this.buildCapabilities();
  }
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ═══════════════════════════════════════════════════════════════════════
// Capabilities
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — capabilities', () => {
  it('derives capabilities from CCXT has flags', () => {
    const adapter = new TestAdapter();
    const caps: AdapterCapabilities = adapter.capabilities;

    expect(caps.supportsSpot).toBe(true);
    expect(caps.supportsFutures).toBe(true);
    expect(caps.supportsMargin).toBe(true);
    expect(caps.supportsWebSocket).toBe(false);
    expect(caps.supportsOrderBook).toBe(true);
    expect(caps.supportsTicker).toBe(true);
    expect(caps.supportsTrades).toBe(true);
  });

  it('reports false for unsupported features', () => {
    const adapter = new TestAdapter({}, { margin: false, fetchTrades: false });
    expect(adapter.capabilities.supportsMargin).toBe(false);
    expect(adapter.capabilities.supportsTrades).toBe(false);
  });

  it('detects futures support from swap flag', () => {
    const adapter = new TestAdapter({}, { swap: true, future: false });
    expect(adapter.capabilities.supportsFutures).toBe(true);
  });

  it('detects futures support from future flag', () => {
    const adapter = new TestAdapter({}, { swap: false, future: true });
    expect(adapter.capabilities.supportsFutures).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// fetchMarkets
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — fetchMarkets', () => {
  it('translates CCXT markets into MarketInfo[]', async () => {
    mockLoadMarkets.mockResolvedValue({
      'BTC/USDT': {
        symbol: 'BTC/USDT',
        base: 'BTC',
        quote: 'USDT',
        taker: 0.001,
        maker: 0.001,
        active: true,
        contract: false,
        limits: {
          amount: { min: 0.0001, max: 9000 },
          price: { min: 0.01, max: 1000000 },
        },
      },
      'ETH/BTC': {
        symbol: 'ETH/BTC',
        base: 'ETH',
        quote: 'BTC',
        taker: 0.002,
        maker: 0.002,
        active: true,
        contract: false,
        limits: { amount: { min: 0.01 }, price: { min: 0.00001 } },
      },
      'DOGE-PERP': {
        symbol: 'DOGE-PERP',
        base: 'DOGE',
        quote: 'USDT',
        taker: 0.0005,
        maker: 0.0005,
        active: true,
        contract: true, // skipped
        limits: {},
      },
    });

    const adapter = new TestAdapter();
    const markets = await adapter.fetchMarkets();

    expect(markets).toHaveLength(2); // DOGE-PERP excluded
    expect(markets[0]).toEqual({
      symbol: 'BTC/USDT',
      baseCurrency: 'BTC',
      quoteCurrency: 'USDT',
      takerFee: '0.001',
      makerFee: '0.001',
      minOrderSize: '0.0001',
      maxOrderSize: '9000',
      minPriceTick: '0.01',
      status: 'active',
    });
    expect(markets[1].symbol).toBe('ETH/BTC');
  });

  it('returns empty array when loadMarkets returns nothing', async () => {
    mockLoadMarkets.mockResolvedValue({});
    const adapter = new TestAdapter();
    const markets = await adapter.fetchMarkets();
    expect(markets).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// fetchTicker
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — fetchTicker', () => {
  it('translates a CCXT ticker into TickerSnapshot', async () => {
    mockFetchTicker.mockResolvedValue({
      symbol: 'BTC/USDT',
      bid: 64999.99,
      ask: 65000.01,
      last: 65000,
      baseVolume: 12345.67,
      high: 65500,
      low: 64200,
      timestamp: 1700000000000,
    });

    const adapter = new TestAdapter();
    const ticker = await adapter.fetchTicker('BTC/USDT');

    expect(ticker.symbol).toBe('BTC/USDT');
    expect(ticker.bid).toBe('64999.99');
    expect(ticker.ask).toBe('65000.01');
    expect(ticker.last).toBe('65000');
    expect(ticker.volume24h).toBe('12345.67');
    expect(ticker.high24h).toBe('65500');
    expect(ticker.low24h).toBe('64200');
    expect(ticker.timestamp).toEqual(new Date(1700000000000));
  });

  it('throws ExchangeDataError for malformed symbol', async () => {
    const adapter = new TestAdapter();
    await expect(adapter.fetchTicker('BTCUSDT')).rejects.toThrow(ExchangeDataError);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// fetchOrderBook
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — fetchOrderBook', () => {
  it('translates a CCXT order book', async () => {
    mockFetchOrderBook.mockResolvedValue({
      bids: [
        [64999, 0.5],
        [64998, 1.2],
      ],
      asks: [
        [65000, 0.3],
        [65001, 2.0],
      ],
      timestamp: 1700000000000,
    });

    const adapter = new TestAdapter();
    const book = await adapter.fetchOrderBook('BTC/USDT', 2);

    expect(book.symbol).toBe('BTC/USDT');
    expect(book.bids).toHaveLength(2);
    expect(book.bids[0]).toEqual({ price: '64999', quantity: '0.5' });
    expect(book.asks).toHaveLength(2);
    expect(book.asks[0]).toEqual({ price: '65000', quantity: '0.3' });
  });

  it('truncates to requested depth', async () => {
    mockFetchOrderBook.mockResolvedValue({
      bids: [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      asks: [
        [1, 1],
        [2, 2],
        [3, 3],
        [4, 4],
        [5, 5],
      ],
      timestamp: Date.now(),
    });

    const adapter = new TestAdapter();
    const book = await adapter.fetchOrderBook('BTC/USDT', 3);
    expect(book.bids).toHaveLength(3);
    expect(book.asks).toHaveLength(3);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// fetchTrades
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — fetchTrades', () => {
  it('translates CCXT trades', async () => {
    mockFetchTrades.mockResolvedValue([
      {
        symbol: 'BTC/USDT',
        side: 'buy',
        price: 65000,
        amount: 0.1,
        timestamp: 1700000000000,
        id: 't1',
      },
      {
        symbol: 'BTC/USDT',
        side: 'sell',
        price: 65001,
        amount: 0.05,
        timestamp: 1700000001000,
        id: 't2',
      },
    ]);

    const adapter = new TestAdapter();
    const trades = await adapter.fetchTrades('BTC/USDT', 2);

    expect(trades).toHaveLength(2);
    expect(trades[0]).toEqual({
      symbol: 'BTC/USDT',
      side: 'buy',
      price: '65000',
      quantity: '0.1',
      timestamp: new Date(1700000000000),
      tradeId: 't1',
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════
// fetchCoinNetworkStatus
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — fetchCoinNetworkStatus', () => {
  it('translates currencies with network breakdowns', async () => {
    mockFetchCurrencies.mockResolvedValue({
      USDT: {
        active: true,
        networks: {
          ETH: {
            active: true,
            deposit: true,
            withdraw: true,
            fees: { withdraw: 5 },
            limits: { withdraw: { min: 10, max: 100000 } },
          },
          TRX: {
            active: true,
            deposit: true,
            withdraw: true,
            fees: { withdraw: 1 },
            limits: { withdraw: { min: 1, max: 500000 } },
          },
        },
      },
    });

    const adapter = new TestAdapter();
    const statuses = await adapter.fetchCoinNetworkStatus();

    expect(statuses).toHaveLength(2);
    expect(statuses[0]).toEqual({
      coin: 'USDT',
      network: 'ETH',
      depositEnabled: true,
      withdrawalEnabled: true,
      withdrawalFee: '5',
      minWithdrawal: '10',
      maxWithdrawal: '100000',
      confirmationBlocks: null,
    });
    expect(statuses[1].network).toBe('TRX');
  });

  it('falls back to single entry when no network breakdown', async () => {
    mockFetchCurrencies.mockResolvedValue({
      BTC: {
        active: true,
        networks: {},
        fees: { withdraw: 0.0005 },
        limits: { withdraw: { min: 0.001 } },
      },
    });

    const adapter = new TestAdapter();
    const statuses = await adapter.fetchCoinNetworkStatus();

    expect(statuses).toHaveLength(1);
    expect(statuses[0].coin).toBe('BTC');
    expect(statuses[0].network).toBeNull();
  });

  it('returns empty array when fetchCurrencies is not supported', async () => {
    const adapter = new TestAdapter({}, { fetchCurrencies: false });
    // Override the has flag on the mock exchange
    (adapter as any).exchange.has.fetchCurrencies = false;

    const statuses = await adapter.fetchCoinNetworkStatus();
    expect(statuses).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Error translation
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — error translation', () => {
  function makeError(name: string, message: string): Error {
    const err = new Error(message);
    // Override the constructor name so translateError's `name` detection works
    Object.defineProperty(err, 'constructor', {
      value: class {},
      writable: false,
    });
    // Hack: set the name property directly via Object.assign
    Object.defineProperty(err.constructor, 'name', { value: name, writable: false });
    return err;
  }

  it('translates DDoSProtection to ExchangeRateLimitError', () => {
    const adapter = new TestAdapter();
    const error = makeError('DDoSProtection', 'Rate limit exceeded');
    const result = (adapter as any).translateError(error);
    expect(result).toBeInstanceOf(ExchangeRateLimitError);
  });

  it('translates BadSymbol to ExchangeSymbolNotFoundError', () => {
    const adapter = new TestAdapter();
    const error = makeError('BadSymbol', 'binance does not have market FAKE/USDT');
    const result = (adapter as any).translateError(error);
    expect(result).toBeInstanceOf(ExchangeSymbolNotFoundError);
  });

  it('translates NetworkError to ExchangeNetworkError', () => {
    const adapter = new TestAdapter();
    const error = makeError('NetworkError', 'ECONNREFUSED');
    const result = (adapter as any).translateError(error);
    expect(result).toBeInstanceOf(ExchangeNetworkError);
  });

  it('translates ExchangeError to ExchangeDataError', () => {
    const adapter = new TestAdapter();
    const error = makeError('ExchangeError', 'Invalid order');
    const result = (adapter as any).translateError(error);
    expect(result).toBeInstanceOf(ExchangeDataError);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// Lifecycle
// ═══════════════════════════════════════════════════════════════════════

describe('CcxtAdapter — lifecycle', () => {
  it('shutdown calls exchange.close()', async () => {
    const adapter = new TestAdapter();
    await adapter.shutdown();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });
});
