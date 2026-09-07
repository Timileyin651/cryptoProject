/**
 * Jest global setup — mock config before any module imports.
 *
 * The config/index.ts module validates JWT_SECRET at import time,
 * so we must set env vars BEFORE any test module loads.
 */

// ── Set required env vars BEFORE anything imports config ─────────────
process.env.JWT_SECRET = 'test-jwt-secret-for-unit-tests-32chars!!';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-for-unit-tests-32ch!!';
process.env.NODE_ENV = 'test';
process.env.DB_HOST = 'localhost';
process.env.DB_NAME = 'test_db';
process.env.DB_USER = 'test';
process.env.DB_PASSWORD = 'test';
process.env.REDIS_HOST = 'localhost';
process.env.REDIS_PORT = '6379';
process.env.LOG_LEVEL = 'silent';
process.env.PAYSTACK_SECRET_KEY = 'sk_test_key';
process.env.PAYSTACK_PUBLIC_KEY = 'pk_test_key';
process.env.PAYSTACK_WEBHOOK_SECRET = 'whsec_test';

// Suppress winston console output in tests
jest.mock('winston', () => {
  const actual = jest.requireActual('winston');
  const noop = jest.fn();
  const logger = {
    info: noop,
    warn: noop,
    error: noop,
    debug: noop,
    http: noop,
    log: noop,
    child: () => logger,
    transports: [],
  };
  return {
    ...actual,
    createLogger: () => logger,
    format: actual.format,
    transports: actual.transports,
  };
});

// Mock ioredis
jest.mock('ioredis', () => {
  const store = new Map<string, string>();
  return jest.fn().mockImplementation(() => ({
    get: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    set: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve('OK');
    }),
    del: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve(1);
    }),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve('OK')),
    on: jest.fn(),
    disconnect: jest.fn(),
  }));
});

// Mock the redis client module
jest.mock('../src/config/redis', () => ({
  redisClient: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve('OK')),
    del: jest.fn(() => Promise.resolve(1)),
    ping: jest.fn(() => Promise.resolve('PONG')),
    quit: jest.fn(() => Promise.resolve('OK')),
    on: jest.fn(),
  },
  connectRedis: jest.fn(() => Promise.resolve()),
  disconnectRedis: jest.fn(() => Promise.resolve()),
}));

// Mock email service to avoid actual sending
jest.mock('../src/services/EmailService', () => ({
  emailService: {
    sendVerificationEmail: jest.fn(() => Promise.resolve()),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  },
  EmailService: jest.fn().mockImplementation(() => ({
    sendVerificationEmail: jest.fn(() => Promise.resolve()),
    sendPasswordResetEmail: jest.fn(() => Promise.resolve()),
  })),
}));

// Mock the logger used across the codebase
jest.mock('../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    http: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

// Increase Jest timeout for async tests
jest.setTimeout(10_000);
