/**
 * Tests for StreamRegistry.
 *
 * No real WebSocket connections — just verifies the registry pattern.
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

import { StreamRegistry } from '../../src/marketdata/StreamRegistry';
import { WsStream } from '../../src/marketdata/WsStream';
import { EventEmitter } from 'events';

/** Minimal mock WsStream for testing. */
class MockStream extends EventEmitter {
  exchange: string;
  constructor(exchange: string) {
    super();
    this.exchange = exchange;
  }
  async connect() {}
  async disconnect() {}
  getHealth() {
    return { exchange: this.exchange, status: 'connected' as const };
  }
}

let registry: StreamRegistry;

beforeEach(() => {
  registry = new StreamRegistry();
});

// ═══════════════════════════════════════════════════════════════════════
// register / create
// ═══════════════════════════════════════════════════════════════════════

describe('StreamRegistry — register & create', () => {
  it('creates a stream from a registered factory', () => {
    registry.register('binance', () => new MockStream('binance') as any);

    const stream = registry.create('binance');
    expect(stream).not.toBeNull();
    expect(stream!.exchange).toBe('binance');
  });

  it('returns null for unregistered exchange', () => {
    const stream = registry.create('unknown');
    expect(stream).toBeNull();
  });

  it('has() returns true after registration', () => {
    registry.register('binance', () => new MockStream('binance') as any);
    expect(registry.has('binance')).toBe(true);
    expect(registry.has('bybit')).toBe(false);
  });

  it('overwrites previous factory for same slug', () => {
    registry.register('binance', () => new MockStream('v1') as any);
    registry.register('binance', () => new MockStream('v2') as any);

    const stream = registry.create('binance');
    expect(stream!.exchange).toBe('v2');
  });

  it('getRegisteredExchanges returns all slugs', () => {
    registry.register('binance', () => new MockStream('binance') as any);
    registry.register('bybit', () => new MockStream('bybit') as any);
    registry.register('okx', () => new MockStream('okx') as any);

    const slugs = registry.getRegisteredExchanges();
    expect(slugs.sort()).toEqual(['binance', 'bybit', 'okx']);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// unregister / clear
// ═══════════════════════════════════════════════════════════════════════

describe('StreamRegistry — unregister & clear', () => {
  it('unregister removes a factory', () => {
    registry.register('binance', () => new MockStream('binance') as any);
    expect(registry.has('binance')).toBe(true);

    const removed = registry.unregister('binance');
    expect(removed).toBe(true);
    expect(registry.has('binance')).toBe(false);
  });

  it('unregister returns false for unknown slug', () => {
    expect(registry.unregister('unknown')).toBe(false);
  });

  it('clear removes all factories', () => {
    registry.register('binance', () => new MockStream('binance') as any);
    registry.register('bybit', () => new MockStream('bybit') as any);

    registry.clear();
    expect(registry.getRegisteredExchanges()).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// error handling
// ═══════════════════════════════════════════════════════════════════════

describe('StreamRegistry — error handling', () => {
  it('create returns null when factory throws', () => {
    registry.register('broken', () => {
      throw new Error('Factory exploded');
    });

    const stream = registry.create('broken');
    expect(stream).toBeNull();
  });
});
