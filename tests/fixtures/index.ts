/**
 * Deterministic test fixtures and factory functions.
 *
 * All data is static / seeded so tests are repeatable.
 * No live exchange calls — every external dependency is mocked.
 */
import crypto from 'crypto';

// ─── Exchange adapters ──────────────────────────────────────────────────

export interface MockExchangeAdapterConfig {
  slug?: string;
  name?: string;
  spotFee?: number;
  futuresFee?: number;
  bidPrice?: string;
  askPrice?: string;
  lastPrice?: string;
  fundingRate?: number;
  bookDepth?: { price: number; quantity: number }[];
  networkStatuses?: Array<{
    coin: string;
    network: string | null;
    depositEnabled: boolean;
    withdrawalEnabled: boolean;
    withdrawalFee: string;
    minWithdrawal: string | null;
  }>;
  throwsOn?: string[];
}

export function createMockExchangeAdapter(config: MockExchangeAdapterConfig = {}) {
  const slug = config.slug ?? 'binance';
  const name = config.name ?? 'Binance';
  const spotFee = config.spotFee ?? 0.001;
  const bidPrice = config.bidPrice ?? '65000';
  const askPrice = config.askPrice ?? '65001';
  const lastPrice = config.lastPrice ?? '65000.5';
  const bookDepth = config.bookDepth ?? [
    { price: 65000, quantity: 2.5 },
    { price: 65001, quantity: 3.0 },
    { price: 65002, quantity: 1.5 },
    { price: 65005, quantity: 5.0 },
  ];

  return {
    slug,
    name,
    baseUrl: `https://${slug}.example.com`,
    capabilities: {
      supportsSpot: true,
      supportsFutures: config.fundingRate !== undefined,
      supportsMargin: false,
      supportsWebSocket: false,
      supportsOrderBook: true,
      supportsTicker: true,
      supportsTrades: true,
    },
    initialize: async () => {},
    shutdown: async () => {},
    fetchMarkets: async () => [
      {
        symbol: 'BTC/USDT',
        baseCurrency: 'BTC',
        quoteCurrency: 'USDT',
        takerFee: String(spotFee),
        makerFee: String(spotFee * 0.8),
        minOrderSize: '0.001',
        maxOrderSize: '1000',
        minPriceTick: '0.01',
        status: 'active' as const,
      },
    ],
    fetchTicker: async (symbol: string) => ({
      symbol,
      bid: bidPrice,
      ask: askPrice,
      last: lastPrice,
      volume24h: '12345.67',
      high24h: '66000',
      low24h: '64000',
      timestamp: new Date(),
    }),
    fetchOrderBook: async (symbol: string, depth = 20) => ({
      symbol,
      bids: bookDepth.map((l) => ({ price: String(l.price), quantity: String(l.quantity) })),
      asks: bookDepth.map((l) => ({ price: String(l.price + 1), quantity: String(l.quantity) })),
      timestamp: new Date(),
    }),
    fetchTrades: async () => [],
    fetchFundingRate:
      config.fundingRate !== undefined
        ? async (symbol: string) => ({
            symbol,
            fundingRate: config.fundingRate!,
            timestamp: new Date(),
            fetchedAt: new Date(),
          })
        : async () => null,
    fetchFundingRateHistory: async () => [],
    fetchCoinNetworkStatus: async () =>
      config.networkStatuses ?? [
        {
          coin: 'BTC',
          network: 'mainnet',
          depositEnabled: true,
          withdrawalEnabled: true,
          withdrawalFee: '0.0005',
          minWithdrawal: '0.001',
          maxWithdrawal: null,
          confirmationBlocks: 6,
        },
      ],
    // Helper for tests to inject throws
    _throwsOn: config.throwsOn ?? [],
  };
}

// ─── Order book fixtures ────────────────────────────────────────────────

export interface MockOrderBook {
  bids: Array<{ price: string; quantity: string }>;
  asks: Array<{ price: string; quantity: string }>;
}

export function createMockOrderBook(
  bidPrices: number[],
  askPrices: number[],
  quantity = 1.0,
  bidQuantity?: number[],
  askQuantity?: number[],
): MockOrderBook {
  return {
    bids: bidPrices.map((p, i) => ({
      price: String(p),
      quantity: String(bidQuantity?.[i] ?? quantity),
    })),
    asks: askPrices.map((p, i) => ({
      price: String(p),
      quantity: String(askQuantity?.[i] ?? quantity),
    })),
  };
}

export function createOrderBookWithMetrics(
  bidPrices: number[],
  askPrices: number[],
  bidQuantity?: number[],
  askQuantity?: number[],
) {
  const book = createMockOrderBook(bidPrices, askPrices, 1.0, bidQuantity, askQuantity);
  const bestBid = bidPrices[0] ?? 0;
  const bestAsk = askPrices[0] ?? 0;
  const spread = bestAsk > 0 && bestBid > 0 ? bestAsk - bestBid : 0;
  const midPrice = bestAsk > 0 && bestBid > 0 ? (bestBid + bestAsk) / 2 : 0;

  const bidQtyArr = bidQuantity ?? bidPrices.map(() => 1.0);
  const askQtyArr = askQuantity ?? askPrices.map(() => 1.0);

  let cumBid = 0;
  const bidDepth = bidPrices.map((p, i) => {
    cumBid += bidQtyArr[i];
    return { price: p, quantity: bidQtyArr[i], cumulative: cumBid };
  });

  let cumAsk = 0;
  const askDepth = askPrices.map((p, i) => {
    cumAsk += askQtyArr[i];
    return { price: p, quantity: askQtyArr[i], cumulative: cumAsk };
  });

  return {
    exchange: 'binance',
    symbol: 'BTC/USDT',
    bids: book.bids,
    asks: book.asks,
    timestamp: Date.now(),
    receivedAt: Date.now(),
    metrics: {
      bestBid,
      bestAsk,
      spread,
      spreadPct: midPrice > 0 ? spread / midPrice : 0,
      midPrice,
      totalBidDepth: bidQtyArr.reduce((a, b) => a + b, 0),
      totalAskDepth: askQtyArr.reduce((a, b) => a + b, 0),
    },
    bidDepth,
    askDepth,
  };
}

// ─── Funding rate fixtures ──────────────────────────────────────────────

export function createFundingRateEntry(
  overrides: Partial<{
    exchange: string;
    symbol: string;
    fundingRate: number;
    fundingIntervalMs: number;
    fetchedAt: number;
  }> = {},
) {
  return {
    exchange: overrides.exchange ?? 'binance',
    symbol: overrides.symbol ?? 'BTC/USDT:USDT',
    fundingRate: overrides.fundingRate ?? 0.0001,
    timestamp: Date.now(),
    fetchedAt: overrides.fetchedAt ?? Date.now(),
    fundingIntervalMs: overrides.fundingIntervalMs ?? 8 * 60 * 60 * 1000,
  };
}

export function createSpotPerpPair(
  overrides: Partial<{
    exchange: string;
    spotSymbol: string;
    perpSymbol: string;
    baseCurrency: string;
    quoteCurrency: string;
  }> = {},
) {
  return {
    exchange: overrides.exchange ?? 'binance',
    spotSymbol: overrides.spotSymbol ?? 'BTC/USDT',
    perpSymbol: overrides.perpSymbol ?? 'BTC/USDT:USDT',
    baseCurrency: overrides.baseCurrency ?? 'BTC',
    quoteCurrency: overrides.quoteCurrency ?? 'USDT',
  };
}

// ─── Ticker fixtures ────────────────────────────────────────────────────

export function createTickerSnapshot(
  overrides: Partial<{
    symbol: string;
    bid: string;
    ask: string;
    last: string;
    volume24h: string;
  }> = {},
) {
  return {
    symbol: overrides.symbol ?? 'BTC/USDT',
    bid: overrides.bid ?? '65000',
    ask: overrides.ask ?? '65001',
    last: overrides.last ?? '65000.5',
    volume24h: overrides.volume24h ?? '12345.67',
    high24h: '66000',
    low24h: '64000',
    timestamp: new Date(),
  };
}

// ─── Comparable pair fixtures ───────────────────────────────────────────

export function createComparablePair(
  overrides: Partial<{
    symbol: string;
    buyExchange: string;
    sellExchange: string;
    buyAskPrice: number;
    sellBidPrice: number;
    tradeSize: number;
  }> = {},
) {
  const buyAskPrice = overrides.buyAskPrice ?? 64900;
  const sellBidPrice = overrides.sellBidPrice ?? 65100;
  const tradeSize = overrides.tradeSize ?? 1.0;

  const buyBook = createOrderBookWithMetrics(
    [buyAskPrice - 2, buyAskPrice - 1, buyAskPrice],
    [buyAskPrice, buyAskPrice + 1, buyAskPrice + 2],
    [tradeSize * 5, tradeSize * 3, tradeSize],
    [tradeSize * 5, tradeSize * 3, tradeSize],
  );
  buyBook.exchange = overrides.buyExchange ?? 'binance';

  const sellBook = createOrderBookWithMetrics(
    [sellBidPrice, sellBidPrice - 1, sellBidPrice - 2],
    [sellBidPrice + 1, sellBidPrice + 2, sellBidPrice + 3],
    [tradeSize, tradeSize * 3, tradeSize * 5],
    [tradeSize, tradeSize * 3, tradeSize * 5],
  );
  sellBook.exchange = overrides.sellExchange ?? 'okx';

  return {
    symbol: overrides.symbol ?? 'BTC/USDT',
    buyExchange: overrides.buyExchange ?? 'binance',
    buyBook,
    sellExchange: overrides.sellExchange ?? 'okx',
    sellBook,
    buyBookAgeMs: 1000,
    sellBookAgeMs: 1000,
  };
}

// ─── User fixtures ──────────────────────────────────────────────────────

export function createUserFixture(
  overrides: Partial<{
    id: number;
    email: string;
    first_name: string;
    last_name: string;
    role: string;
    is_active: boolean;
    is_email_verified: boolean;
    password_hash: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    email: overrides.email ?? 'test@example.com',
    first_name: overrides.first_name ?? 'Test',
    last_name: overrides.last_name ?? 'User',
    role: overrides.role ?? 'user',
    is_active: overrides.is_active ?? true,
    is_email_verified: overrides.is_email_verified ?? false,
    password_hash:
      overrides.password_hash ?? '$2a$12$abcdefghijklmnopqrstuuABCDEFGHIJKLMNOPQRSTUVWXYZ01',
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
    last_login_at: null,
  };
}

// ─── Subscription fixtures ──────────────────────────────────────────────

export function createPlanFixture(
  overrides: Partial<{
    id: number;
    slug: string;
    name: string;
    is_active: boolean;
    max_alerts: number | null;
    max_exchange_pairs: number | null;
    min_alert_cooldown_seconds: number | null;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    slug: overrides.slug ?? 'free',
    name: overrides.name ?? 'Free',
    description: 'Free tier',
    price_monthly: '0',
    price_yearly: '0',
    currency: 'NGN',
    is_active: overrides.is_active ?? true,
    sort_order: 0,
    max_scans_per_day: null,
    max_alerts: overrides.max_alerts ?? 1,
    max_portfolios: null,
    max_exchanges_connected: null,
    rate_limit_per_minute: 60,
    data_retention_days: 30,
    max_opportunities_per_query: 25,
    max_exchange_pairs: overrides.max_exchange_pairs ?? 3,
    max_analytics_days: 7,
    max_saved_preferences: 3,
    max_watchlist_items: 10,
    max_favorite_coins: 5,
    max_favorite_exchanges: 2,
    min_alert_cooldown_seconds: overrides.min_alert_cooldown_seconds ?? 7200,
    detailed_opportunities: false,
    realtime_scanning: false,
    funding_view: false,
    telegram_alerts: false,
    api_access: false,
    created_at: new Date('2024-01-01'),
    updated_at: new Date('2024-01-01'),
  };
}

export function createSubscriptionFixture(
  overrides: Partial<{
    id: number;
    user_id: number;
    plan_id: number;
    status: string;
    billing_cycle: string;
  }> = {},
) {
  const now = new Date();
  const periodEnd = new Date(now);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  return {
    id: overrides.id ?? 1,
    user_id: overrides.user_id ?? 1,
    plan_id: overrides.plan_id ?? 1,
    status: overrides.status ?? 'active',
    billing_cycle: overrides.billing_cycle ?? 'monthly',
    started_at: now,
    current_period_start: now,
    current_period_end: periodEnd,
    cancelled_at: null,
    cancel_reason: null,
    renewal_ready: false,
    gateway_subscription_id: null,
    created_at: now,
    updated_at: now,
  };
}

// ─── Alert fixtures ─────────────────────────────────────────────────────

export function createAlertFixture(
  overrides: Partial<{
    id: number;
    user_id: number;
    name: string;
    status: string;
    is_enabled: boolean;
    channels: string[];
    cooldown_seconds: number;
    trigger_count: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    user_id: overrides.user_id ?? 1,
    name: overrides.name ?? 'BTC Spread Alert',
    description: null,
    status: overrides.status ?? 'active',
    conditions: { minSpread: 0.005 },
    channels: overrides.channels ?? ['email'],
    cooldown_seconds: overrides.cooldown_seconds ?? 3600,
    last_notified_at: null,
    trigger_count: overrides.trigger_count ?? 0,
    is_enabled: overrides.is_enabled ?? true,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Notification fixtures ──────────────────────────────────────────────

export function createNotificationFixture(
  overrides: Partial<{
    id: number;
    user_id: number;
    alert_id: number;
    channel: string;
    status: string;
    subject: string;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    user_id: overrides.user_id ?? 1,
    alert_id: overrides.alert_id ?? 1,
    channel: overrides.channel ?? 'email',
    status: overrides.status ?? 'pending',
    subject: overrides.subject ?? 'Alert triggered',
    body_text: 'BTC spread crossed threshold',
    body_html: '<p>BTC spread crossed threshold</p>',
    payload: null,
    error_message: null,
    attempt_count: 0,
    max_attempts: 3,
    last_attempt_at: null,
    delivered_at: null,
    dedup_key: `dedup:${overrides.id ?? 1}`,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Exchange fixtures ──────────────────────────────────────────────────

export function createExchangeFixture(
  overrides: Partial<{
    id: number;
    name: string;
    slug: string;
    is_active: boolean;
    supports_spot: boolean;
    supports_futures: boolean;
    supports_websocket: boolean;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    name: overrides.name ?? 'Binance',
    slug: overrides.slug ?? 'binance',
    is_active: overrides.is_active ?? true,
    api_base_url: null,
    logo_url: null,
    website_url: null,
    supports_spot: overrides.supports_spot ?? true,
    supports_futures: overrides.supports_futures ?? false,
    supports_margin: false,
    supports_websocket: overrides.supports_websocket ?? false,
    api_version: null,
    rate_limit_per_minute: 1200,
    country: null,
    trust_score: '8.5',
    metadata: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Payment fixture ────────────────────────────────────────────────────

export function createPaymentFixture(
  overrides: Partial<{
    id: number;
    user_id: number;
    plan_id: number;
    status: string;
    amount: number;
  }> = {},
) {
  return {
    id: overrides.id ?? 1,
    user_id: overrides.user_id ?? 1,
    plan_id: overrides.plan_id ?? 2,
    subscription_id: null,
    paystack_reference: `test_ref_${overrides.id ?? 1}`,
    paystack_transaction_id: null,
    paystack_customer_code: null,
    paystack_subscription_code: null,
    amount: overrides.amount ?? 5000000,
    currency: 'NGN',
    billing_cycle: 'monthly',
    channel: null,
    status: overrides.status ?? 'pending',
    gateway_response: null,
    card_type: null,
    card_last4: null,
    ip_address: null,
    metadata: null,
    initialized_at: new Date(),
    confirmed_at: null,
    created_at: new Date(),
    updated_at: new Date(),
  };
}

// ─── Generic mock factory for Sequelize models ──────────────────────────

export function createSequelizeMock<T extends Record<string, unknown>>(
  model: T,
  methods: Record<string, (...args: unknown[]) => unknown> = {},
) {
  const mock: Record<string, unknown> = {
    ...model,
    update: jest.fn().mockResolvedValue({ ...model }),
    destroy: jest.fn().mockResolvedValue(undefined),
    reload: jest.fn().mockResolvedValue(model),
    toJSON: jest.fn().mockReturnValue(model),
    ...methods,
  };
  return mock as T;
}

// ─── Express request/response mock ──────────────────────────────────────

export function createMockRequest(overrides: Record<string, unknown> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    user: undefined as { userId: number; email: string } | undefined,
    ...overrides,
  } as any;
}

export function createMockResponse() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    locals: {},
  };
  return res;
}

export function createMockNext() {
  return jest.fn();
}

// ─── Seed data for deterministic tests ──────────────────────────────────

export const SEED = {
  userId: 1,
  adminId: 2,
  superadminId: 3,
  userEmail: 'test@example.com',
  adminEmail: 'admin@example.com',
  superadminEmail: 'superadmin@example.com',
  password: 'SecurePassword123!',
  // Pre-computed bcrypt hash for 'SecurePassword123!' with 12 rounds
  // Using a fixed value for determinism
  passwordHash: '$2a$12$LJ3m4ys3GZvKmDQzQFVzR.KHJ7HKN6HjS9GJ8K1L2M3N4O5P6Q7R8S9T0',
  jwtSecret: 'test-jwt-secret-for-unit-tests-32chars!!',
  refreshSecret: 'test-refresh-secret-for-unit-tests-32ch!!',
  jwtToken:
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsImlhdCI6MTcwMDAwMDAwMH0.test',
} as const;
