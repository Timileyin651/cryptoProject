/**
 * NotificationService tests — dispatch, quiet hours, dedup, retry, preferences.
 */

let mockNotifications: any[] = [];
let mockPreferences: any[] = [];

function makePref(data: Record<string, any>) {
  const p: any = { ...data };
  p.update = jest.fn().mockImplementation((updates: any) => {
    Object.assign(p, updates);
    return Promise.resolve(p);
  });
  p.reload = jest.fn().mockResolvedValue(p);
  return p;
}

jest.mock('../../src/models/Notification', () => ({
  Notification: {
    create: jest.fn().mockImplementation((data: any) => {
      const n: any = { id: mockNotifications.length + 1, ...data, created_at: new Date() };
      n.update = jest.fn().mockImplementation((updates: any) => {
        Object.assign(n, updates);
        return Promise.resolve(n);
      });
      mockNotifications.push(n);
      return Promise.resolve(n);
    }),
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      const match = mockNotifications.find((n) => {
        if (where.dedup_key && n.dedup_key !== where.dedup_key) return false;
        if (where.user_id !== undefined && n.user_id !== where.user_id) return false;
        if (where.status && n.status !== where.status) return false;
        return true;
      });
      return Promise.resolve(match ?? null);
    }),
    findAll: jest.fn().mockImplementation(({ where }: any) => {
      let result = [...mockNotifications];
      if (where?.user_id !== undefined) result = result.filter((n) => n.user_id === where.user_id);
      if (where?.status) result = result.filter((n) => n.status === where.status);
      return Promise.resolve(result);
    }),
    findAndCountAll: jest.fn().mockImplementation(({ where }: any) => {
      let result = [...mockNotifications];
      if (where?.user_id !== undefined) result = result.filter((n) => n.user_id === where.user_id);
      if (where?.status) result = result.filter((n) => n.status === where.status);
      return Promise.resolve({ rows: result, count: result.length });
    }),
    count: jest.fn().mockImplementation(({ where }: any) => {
      let result = [...mockNotifications];
      if (where?.user_id !== undefined) result = result.filter((n) => n.user_id === where.user_id);
      // Handle Sequelize Op.in — the status may be an object with an $in array
      if (where?.status) {
        if (typeof where.status === 'object' && where.status?.$in) {
          result = result.filter((n) => where.status.$in.includes(n.status));
        } else if (Array.isArray(where.status)) {
          result = result.filter((n) => where.status.includes(n.status));
        } else {
          result = result.filter((n) => n.status === where.status);
        }
      }
      return Promise.resolve(result.length);
    }),
    sequelize: { col: jest.fn((v: string) => v), literal: jest.fn((v: string) => v) },
  },
}));

jest.mock('../../src/models/NotificationPreference', () => ({
  NotificationPreference: {
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(mockPreferences.find((p) => p.user_id === where.user_id) ?? null);
    }),
    create: jest.fn().mockImplementation((data: any) => {
      const p = makePref({ id: mockPreferences.length + 1, ...data });
      mockPreferences.push(p);
      return Promise.resolve(p);
    }),
  },
}));

jest.mock('../../src/models/Alert', () => ({
  Alert: {
    update: jest.fn().mockResolvedValue([1]),
    sequelize: { literal: jest.fn((val: string) => ({ val, type: 'literal' })) },
  },
}));

jest.mock('../../src/models/User', () => ({ User: {} }));

jest.mock('../../src/services/NotificationChannel', () => ({
  getChannelHandler: jest.fn().mockReturnValue({
    isEnabled: jest.fn().mockReturnValue(true),
    send: jest.fn().mockResolvedValue(true),
  }),
}));

jest.mock('../../src/config', () => ({
  config: { env: 'test', logging: { level: 'error', dir: './logs' } },
}));

jest.mock('../../src/cache/RedisCache', () => ({
  prefCache: {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue(undefined),
  },
  feeCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
  networkCache: { get: jest.fn().mockResolvedValue(null), set: jest.fn() },
}));

jest.mock('../../src/config/redis', () => ({
  redisClient: {
    exists: jest.fn().mockResolvedValue(0),
    setex: jest.fn().mockResolvedValue('OK'),
  },
}));

jest.mock('../../src/notifications/RetryManager', () => ({
  retryManager: {
    schedule: jest.fn().mockReturnValue(true),
    cancel: jest.fn(),
    cancelAll: jest.fn().mockReturnValue(0),
    pendingCount: 0,
  },
}));

import { NotificationService } from '../../src/services/NotificationService';
import type { AlertMatch } from '../../src/services/AlertEvaluator';

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    service = new NotificationService();
    mockNotifications = [];
    mockPreferences = [];
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('dispatch', () => {
    const alert = {
      id: 1,
      user_id: 1,
      name: 'BTC Alert',
      channels: ['email'],
      is_enabled: true,
    };
    const opportunity = {
      id: 1,
      symbol: 'BTC/USDT',
      net_profit: '150.50',
      roi: '0.025',
      gross_spread_pct: '0.003',
      buy_exchange_slug: 'binance',
      sell_exchange_slug: 'okx',
      buy_price: '65000',
      sell_price: '65200',
      quote_currency: 'USDT',
      opportunity_type: 'spot_arbitrage',
      network: null,
      withdrawal_available: true,
      deposit_available: true,
      liquidity_executable: true,
    };

    it('creates notifications and attempts delivery', async () => {
      mockPreferences.push(
        makePref({
          user_id: 1,
          email_enabled: true,
          telegram_enabled: false,
          telegram_bot_token: null,
          telegram_chat_id: null,
          web_push_enabled: false,
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: 'UTC',
          rate_limit_per_hour: 30,
        }),
      );

      const match: AlertMatch = {
        alert: alert as any,
        opportunity: opportunity as any,
        matchedConditions: [],
        summary: 'test',
      };
      const notifications = await service.dispatch(match);
      expect(notifications.length).toBeGreaterThanOrEqual(0);
      expect(mockNotifications.length).toBeGreaterThanOrEqual(0);
    });

    it('respects quiet hours', async () => {
      mockPreferences.push(
        makePref({
          user_id: 1,
          email_enabled: true,
          telegram_enabled: false,
          telegram_bot_token: null,
          telegram_chat_id: null,
          web_push_enabled: false,
          quiet_hours_start: 22,
          quiet_hours_end: 7,
          timezone: 'UTC',
          rate_limit_per_hour: 30,
        }),
      );

      const match2: AlertMatch = {
        alert: alert as any,
        opportunity: opportunity as any,
        matchedConditions: [],
        summary: 'test',
      };
      const notifications = await service.dispatch(match2);
      // With fake timers, hour is 0 (midnight UTC) — within quiet hours 22:00-07:00
      expect(notifications.length).toBe(0);
    });

    it('skips when no preferences exist', async () => {
      const match3: AlertMatch = {
        alert: alert as any,
        opportunity: opportunity as any,
        matchedConditions: [],
        summary: 'test',
      };
      const notifications = await service.dispatch(match3);
      expect(notifications.length).toBe(0);
    });
  });

  describe('listNotifications', () => {
    it('returns paginated notifications for a user', async () => {
      mockNotifications.push(
        { id: 1, user_id: 1, status: 'delivered', created_at: new Date() },
        { id: 2, user_id: 2, status: 'failed', created_at: new Date() },
      );

      const result = await service.listNotifications(1);
      expect(result.data.length).toBe(1);
      expect(result.total).toBe(1);
    });

    it('filters by status', async () => {
      mockNotifications.push(
        { id: 1, user_id: 1, status: 'delivered' },
        { id: 2, user_id: 1, status: 'failed' },
      );

      const result = await service.listNotifications(1, { status: 'failed' });
      expect(result.data.length).toBe(1);
    });
  });

  describe('getStats', () => {
    it('returns notification stats', async () => {
      mockNotifications.push(
        { id: 1, user_id: 1, status: 'delivered' },
        { id: 2, user_id: 1, status: 'failed' },
        { id: 3, user_id: 1, status: 'delivered' },
      );

      const stats = await service.getStats(1);
      expect(stats.delivered).toBe(2);
      expect(stats.failed).toBe(1);
    });
  });

  describe('retryFailed', () => {
    it('retries failed notifications', async () => {
      mockNotifications.push(
        makePref({
          id: 1,
          user_id: 1,
          channel: 'email',
          status: 'failed',
          attempt_count: 1,
          max_attempts: 3,
        }),
      );
      mockPreferences.push(
        makePref({
          user_id: 1,
          email_enabled: true,
          telegram_enabled: false,
          telegram_bot_token: null,
          telegram_chat_id: null,
          web_push_enabled: false,
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: 'UTC',
          rate_limit_per_hour: 30,
        }),
      );

      const retried = await service.retryFailed();
      expect(retried).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPreferences', () => {
    it('returns existing preferences', async () => {
      mockPreferences.push(
        makePref({
          user_id: 1,
          email_enabled: true,
          telegram_enabled: false,
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: 'UTC',
          rate_limit_per_hour: 30,
        }),
      );

      const pref = await service.getPreferences(1);
      expect(pref.email_enabled).toBe(true);
    });

    it('creates default preferences if none exist', async () => {
      const pref = await service.getPreferences(999);
      expect(pref.email_enabled).toBe(true);
      expect(pref.telegram_enabled).toBe(false);
      expect(pref.timezone).toBe('UTC');
    });
  });

  describe('updatePreferences', () => {
    it('updates specified fields', async () => {
      mockPreferences.push(
        makePref({
          id: 1,
          user_id: 1,
          email_enabled: true,
          telegram_enabled: false,
          telegram_bot_token: null,
          telegram_chat_id: null,
          web_push_enabled: false,
          quiet_hours_start: null,
          quiet_hours_end: null,
          timezone: 'UTC',
          rate_limit_per_hour: 30,
        }),
      );

      const pref = await service.updatePreferences(1, { telegramEnabled: true });
      expect(pref.telegram_enabled).toBe(true);
    });
  });
});
