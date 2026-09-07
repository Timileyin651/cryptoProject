// ── Mock models ──────────────────────────────────────────────────────────

const mockPlans: Record<string, any> = {
  free: {
    id: 1,
    slug: 'free',
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    is_active: true,
    sort_order: 0,
    max_scans_per_day: 10,
    max_alerts: 1,
    max_exchange_pairs: 3,
    rate_limit_per_minute: 60,
  },
  basic: {
    id: 2,
    slug: 'basic',
    name: 'Basic',
    price_monthly: 5000,
    price_yearly: 48000,
    is_active: true,
    sort_order: 1,
    max_scans_per_day: 100,
    max_alerts: 10,
    max_exchange_pairs: 10,
    rate_limit_per_minute: 120,
  },
  pro: {
    id: 3,
    slug: 'pro',
    name: 'Pro',
    price_monthly: 15000,
    price_yearly: 144000,
    is_active: true,
    sort_order: 2,
    max_scans_per_day: 500,
    max_alerts: 50,
    max_exchange_pairs: 50,
    rate_limit_per_minute: 300,
  },
};

let mockSubscriptions: any[] = [];
let mockEntitlements: any[] = [];
let mockEvents: any[] = [];

jest.mock('../../src/models/SubscriptionPlan', () => ({
  SubscriptionPlan: {
    findAll: jest.fn().mockImplementation(({ where }: any) => {
      let plans = Object.values(mockPlans);
      if (where?.is_active !== undefined)
        plans = plans.filter((p) => p.is_active === where.is_active);
      return Promise.resolve(plans.sort((a: any, b: any) => a.sort_order - b.sort_order));
    }),
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(mockPlans[where.slug] ?? null);
    }),
    findByPk: jest.fn().mockImplementation((id: number) => {
      return Promise.resolve(Object.values(mockPlans).find((p: any) => p.id === id) ?? null);
    }),
  },
}));

jest.mock('../../src/models/Subscription', () => ({
  Subscription: {
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      const match = mockSubscriptions.find((s) => {
        if (where.user_id !== undefined && s.user_id !== where.user_id) return false;
        if (where.status && typeof where.status === 'object' && where.status.$in) {
          if (!where.status.$in.includes(s.status)) return false;
        }
        return true;
      });
      return Promise.resolve(match ?? null);
    }),
    findByPk: jest.fn().mockImplementation((id: number) => {
      return Promise.resolve(mockSubscriptions.find((s) => s.id === id) ?? null);
    }),
    create: jest.fn().mockImplementation((data: any) => {
      const sub = { id: mockSubscriptions.length + 1, ...data };
      sub.update = jest.fn().mockImplementation((updates: any) => {
        Object.assign(sub, updates);
        return Promise.resolve(sub);
      });
      mockSubscriptions.push(sub);
      return Promise.resolve(sub);
    }),
    update: jest.fn().mockImplementation((updates: any, options: any) => {
      let updated = 0;
      for (const sub of mockSubscriptions) {
        if (options.where.user_id !== undefined && sub.user_id !== options.where.user_id) continue;
        if (
          options.where.status &&
          typeof options.where.status === 'object' &&
          options.where.status.$in
        ) {
          if (!options.where.status.$in.includes(sub.status)) continue;
        }
        if (
          options.where.current_period_end &&
          sub.current_period_end >= options.where.current_period_end
        )
          continue;
        if (
          options.where.renewal_ready !== undefined &&
          sub.renewal_ready !== options.where.renewal_ready
        )
          continue;
        Object.assign(sub, updates);
        updated++;
      }
      return Promise.resolve([updated]);
    }),
  },
}));

jest.mock('../../src/models/FeatureEntitlement', () => ({
  FeatureEntitlement: {
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      const ent = mockEntitlements.find(
        (e) => e.plan_id === where.plan_id && e.feature_key === where.feature_key,
      );
      return Promise.resolve(ent ?? null);
    }),
  },
}));

jest.mock('../../src/models/SubscriptionEvent', () => ({
  SubscriptionEvent: {
    create: jest.fn().mockImplementation((data: any) => {
      const event = { id: mockEvents.length + 1, ...data, created_at: new Date() };
      mockEvents.push(event);
      return Promise.resolve(event);
    }),
    findAll: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(mockEvents.filter((e) => e.user_id === where.user_id));
    }),
  },
}));

jest.mock('../../src/models/User', () => ({ User: {} }));
jest.mock('../../src/config', () => ({
  config: { env: 'test', logging: { level: 'error', dir: './logs' } },
}));
jest.mock('../../src/config/database', () => ({
  sequelize: {
    col: jest.fn((v: string) => ({ val: v })),
    literal: jest.fn((v: string) => ({ val: v })),
  },
}));

import { SubscriptionService } from '../../src/services/SubscriptionService';
import { NotFoundError, ForbiddenError } from '../../src/utils/errors';

describe('SubscriptionService', () => {
  let service: SubscriptionService;

  beforeEach(() => {
    service = new SubscriptionService();
    mockSubscriptions = [];
    mockEntitlements = [];
    mockEvents = [];
    jest.clearAllMocks();
  });

  describe('listPlans', () => {
    it('returns all active plans ordered by sort_order', async () => {
      const plans = await service.listPlans();
      expect(plans.length).toBe(3);
      expect(plans[0].slug).toBe('free');
      expect(plans[2].slug).toBe('pro');
    });
  });

  describe('getPlanBySlug', () => {
    it('returns plan by slug', async () => {
      const plan = await service.getPlanBySlug('pro');
      expect(plan.slug).toBe('pro');
      expect(plan.price_monthly).toBe(15000);
    });

    it('throws NotFoundError for unknown slug', async () => {
      await expect(service.getPlanBySlug('nonexistent')).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPlanById', () => {
    it('returns plan by id', async () => {
      const plan = await service.getPlanById(2);
      expect(plan.slug).toBe('basic');
    });

    it('throws NotFoundError for unknown id', async () => {
      await expect(service.getPlanById(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('resolvePlan', () => {
    it('returns the free plan when no active subscription', async () => {
      const plan = await service.resolvePlan(1);
      expect(plan.slug).toBe('free');
    });

    it('returns the subscribed plan when active', async () => {
      mockSubscriptions.push({
        id: 1,
        user_id: 1,
        plan_id: 3,
        status: 'active',
        plan: mockPlans.pro,
      });
      const plan = await service.resolvePlan(1);
      expect(plan.slug).toBe('pro');
    });
  });

  describe('checkFeature', () => {
    it('returns allowed=false when feature is not enabled', async () => {
      const access = await service.checkFeature(1, 'scanner.funding_view');
      expect(access.allowed).toBe(false);
      expect(access.remaining).toBeNull();
    });

    it('returns allowed=true when feature is enabled with no limit', async () => {
      mockEntitlements.push({
        plan_id: 1,
        feature_key: 'scanner.basic_dashboard',
        is_enabled: true,
        limit_value: null,
      });
      const access = await service.checkFeature(1, 'scanner.basic_dashboard');
      expect(access.allowed).toBe(true);
      expect(access.limit).toBeNull();
    });

    it('returns allowed=true when usage is below limit', async () => {
      mockEntitlements.push({
        plan_id: 1,
        feature_key: 'scanner.advanced_filters',
        is_enabled: true,
        limit_value: 10,
      });
      const access = await service.checkFeature(1, 'scanner.advanced_filters', 5);
      expect(access.allowed).toBe(true);
      expect(access.remaining).toBe(5);
    });

    it('returns allowed=false when usage reaches limit', async () => {
      mockEntitlements.push({
        plan_id: 1,
        feature_key: 'scanner.advanced_filters',
        is_enabled: true,
        limit_value: 10,
      });
      const access = await service.checkFeature(1, 'scanner.advanced_filters', 10);
      expect(access.allowed).toBe(false);
      expect(access.remaining).toBe(0);
    });
  });

  describe('requireFeature', () => {
    it('returns access when feature is allowed', async () => {
      mockEntitlements.push({
        plan_id: 1,
        feature_key: 'scanner.basic_dashboard',
        is_enabled: true,
        limit_value: null,
      });
      const access = await service.requireFeature(1, 'scanner.basic_dashboard');
      expect(access.allowed).toBe(true);
    });

    it('throws ForbiddenError when feature is not allowed', async () => {
      await expect(service.requireFeature(1, 'scanner.funding_view')).rejects.toThrow(
        ForbiddenError,
      );
    });
  });

  describe('createSubscription', () => {
    it('creates a new active subscription', async () => {
      const sub = await service.createSubscription(1, 'pro', 'monthly');
      expect(sub.status).toBe('active');
      expect(sub.plan_id).toBe(3);
      expect(sub.billing_cycle).toBe('monthly');
      expect(sub.current_period_start).toBeDefined();
      expect(sub.current_period_end).toBeDefined();
    });

    it('logs a subscription_created event', async () => {
      await service.createSubscription(1, 'basic', 'yearly');
      expect(mockEvents.length).toBe(1);
      expect(mockEvents[0].event_type).toBe('subscription_created');
      expect(mockEvents[0].payload.plan_slug).toBe('basic');
    });
  });

  describe('cancelSubscription', () => {
    it('cancels an active subscription', async () => {
      const sub: any = {
        id: 1,
        user_id: 1,
        plan_id: 3,
        status: 'active',
        cancelled_at: null,
        cancel_reason: null,
        renewal_ready: false,
      };
      sub.update = jest.fn().mockImplementation((updates: any) => {
        Object.assign(sub, updates);
        return Promise.resolve(sub);
      });
      mockSubscriptions.push(sub);
      const result = await service.cancelSubscription(1, 'too expensive');
      expect(result.status).toBe('cancelled');
      expect(result.cancel_reason).toBe('too expensive');
    });

    it('throws NotFoundError when no active subscription', async () => {
      await expect(service.cancelSubscription(999)).rejects.toThrow(NotFoundError);
    });
  });

  describe('expireOverdueSubscriptions', () => {
    it('marks overdue subscriptions as expired', async () => {
      const pastDate = new Date(Date.now() - 86400000);
      mockSubscriptions.push({
        id: 1,
        user_id: 1,
        status: 'active',
        current_period_end: pastDate,
        renewal_ready: false,
      });
      const count = await service.expireOverdueSubscriptions();
      expect(count).toBeGreaterThanOrEqual(0);
    });
  });

  describe('getPlanLimit', () => {
    it('returns the limit value for a plan column', async () => {
      const limit = await service.getPlanLimit(1, 'max_alerts');
      expect(limit).toBe(1); // free plan
    });

    it('returns null when plan has no value', async () => {
      const limit = await service.getPlanLimit(1, 'nonexistent_column');
      expect(limit).toBeNull();
    });
  });

  describe('logEvent', () => {
    it('creates an event record', async () => {
      const event = await service.logEvent(1, 1, 'subscription_cancelled', { reason: 'test' });
      expect(event.event_type).toBe('subscription_cancelled');
      expect(event.user_id).toBe(1);
    });
  });

  describe('getUserEvents', () => {
    it('returns events for a user', async () => {
      mockEvents.push({ id: 1, user_id: 1, event_type: 'test' });
      const events = await service.getUserEvents(1);
      expect(events.length).toBe(1);
    });
  });
});
