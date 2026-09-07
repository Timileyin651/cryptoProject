/**
 * Tests for adapter factory and individual adapter construction.
 *
 * CCXT's internal ESM dependencies (@noble/curves etc.) cannot be
 * transformed by ts-jest, so we mock `ccxt` entirely here. This is
 * fine — we only need to verify the adapter construction pattern,
 * not CCXT's internals (those are tested in ccxt-adapter.test.ts).
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

// ── Mock CCXT — returns a minimal class that behaves like a real CCXT exchange ──
const mockExchangeInstance = {
  has: {
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
  },
  loadMarkets: jest.fn().mockResolvedValue({}),
  fetchTicker: jest.fn(),
  fetchOrderBook: jest.fn(),
  fetchTrades: jest.fn(),
  fetchCurrencies: jest.fn(),
  close: jest.fn(),
};

class MockExchangeClass {
  constructor(_config?: any) {
    Object.assign(this, mockExchangeInstance);
  }
}

jest.mock('ccxt', () => ({
  default: MockExchangeClass,
  binance: MockExchangeClass,
  bybit: MockExchangeClass,
  okx: MockExchangeClass,
  kucoin: MockExchangeClass,
  gate: MockExchangeClass,
  mexc: MockExchangeClass,
  bitget: MockExchangeClass,
}));

// ── Now import the factory (CCXT is mocked) ──
import {
  createAdapter,
  createAllAdapters,
  SUPPORTED_EXCHANGES,
} from '../../src/exchanges/adapters';
import type { ExchangeAdapter } from '../../src/exchanges/ExchangeAdapter';

beforeEach(() => {
  jest.clearAllMocks();
});

describe('Adapter factory', () => {
  it('SUPPORTED_EXCHANGES contains all 7 exchanges', () => {
    expect(SUPPORTED_EXCHANGES).toEqual([
      'binance',
      'bybit',
      'okx',
      'kucoin',
      'gateio',
      'mexc',
      'bitget',
    ]);
  });

  it('createAdapter returns an adapter for each supported slug', () => {
    for (const slug of SUPPORTED_EXCHANGES) {
      const adapter = createAdapter(slug);
      expect(adapter).not.toBeNull();
      expect(adapter!.slug).toBe(slug);
    }
  });

  it('createAdapter returns null for unknown slug', () => {
    expect(createAdapter('nonexistent')).toBeNull();
  });

  it('createAllAdapters returns adapters for all supported exchanges', () => {
    const adapters = createAllAdapters();
    expect(adapters).toHaveLength(SUPPORTED_EXCHANGES.length);
    const slugs = adapters.map((a) => a.slug);
    for (const slug of SUPPORTED_EXCHANGES) {
      expect(slugs).toContain(slug);
    }
  });
});

// ────────────────────────────────────────────────────────────────────────
// Per-adapter smoke tests
// ────────────────────────────────────────────────────────────────────────

interface AdapterSpec {
  slug: string;
  name: string;
  baseUrl: string;
}

const SPECS: AdapterSpec[] = [
  { slug: 'binance', name: 'Binance', baseUrl: 'https://api.binance.com' },
  { slug: 'bybit', name: 'Bybit', baseUrl: 'https://api.bybit.com' },
  { slug: 'okx', name: 'OKX', baseUrl: 'https://www.okx.com' },
  { slug: 'kucoin', name: 'KuCoin', baseUrl: 'https://api.kucoin.com' },
  { slug: 'gateio', name: 'Gate.io', baseUrl: 'https://api.gateio.ws' },
  { slug: 'mexc', name: 'MEXC', baseUrl: 'https://api.mexc.com' },
  { slug: 'bitget', name: 'Bitget', baseUrl: 'https://api.bitget.com' },
];

describe.each(SPECS)('$slug adapter', ({ slug, name, baseUrl }) => {
  let adapter: ExchangeAdapter;

  beforeAll(async () => {
    const a = createAdapter(slug)!;
    // initialise() creates the mock CCXT instance and derives capabilities
    await a.initialize();
    adapter = a;
  });

  afterAll(async () => {
    await adapter.shutdown();
  });

  it('constructs and initialises successfully', () => {
    expect(adapter).not.toBeNull();
  });

  it('has correct slug', () => {
    expect(adapter.slug).toBe(slug);
  });

  it('has correct name', () => {
    expect(adapter.name).toBe(name);
  });

  it('has correct baseUrl', () => {
    expect(adapter.baseUrl).toBe(baseUrl);
  });

  it('exposes capabilities object', () => {
    const caps = adapter.capabilities;
    expect(caps).toBeDefined();
    expect(typeof caps.supportsSpot).toBe('boolean');
    expect(typeof caps.supportsFutures).toBe('boolean');
    expect(typeof caps.supportsMargin).toBe('boolean');
    expect(typeof caps.supportsWebSocket).toBe('boolean');
    expect(typeof caps.supportsOrderBook).toBe('boolean');
    expect(typeof caps.supportsTicker).toBe('boolean');
    expect(typeof caps.supportsTrades).toBe('boolean');
  });

  it('all adapters support spot', () => {
    expect(adapter.capabilities.supportsSpot).toBe(true);
  });

  it('all adapters support ticker', () => {
    expect(adapter.capabilities.supportsTicker).toBe(true);
  });

  it('all adapters support order book', () => {
    expect(adapter.capabilities.supportsOrderBook).toBe(true);
  });
});
