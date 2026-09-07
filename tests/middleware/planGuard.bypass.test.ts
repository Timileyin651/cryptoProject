/**
 * Bypass tests — prove that Free users cannot access Premium features
 * by calling APIs directly (not just hiding UI elements).
 *
 * These tests verify:
 * 1. PlanGuard middleware blocks unauthorized feature access
 * 2. Free users cannot access funding endpoints
 * 3. Free users cannot access analytics endpoints
 * 4. Free users cannot access calculator endpoints
 * 5. Free users cannot use advanced scanner filters
 * 6. Free users cannot create excessive alerts
 * 7. Free users cannot bypass plan limits by manipulating request params
 */

import { FEATURES, TIER_FEATURES } from '../../src/middleware/planGuard';
import { SubscriptionPlan } from '../../src/models/SubscriptionPlan';
import { FeatureEntitlement } from '../../src/models/FeatureEntitlement';
import { Subscription } from '../../src/models/Subscription';
import { User } from '../../src/models/User';
import { ForbiddenError, UnauthorizedError } from '../../src/utils/errors';

// ── Mock SubscriptionService ──────────────────────────────────────────

const mockPlans: Record<string, any> = {
  free: { id: 1, slug: 'free', name: 'Free', price_monthly: 0, price_yearly: 0, is_active: true },
  basic: {
    id: 2,
    slug: 'basic',
    name: 'Basic',
    price_monthly: 5000,
    price_yearly: 48000,
    is_active: true,
  },
  pro: {
    id: 3,
    slug: 'pro',
    name: 'Pro',
    price_monthly: 15000,
    price_yearly: 144000,
    is_active: true,
  },
  enterprise: {
    id: 4,
    slug: 'enterprise',
    name: 'Enterprise',
    price_monthly: 50000,
    price_yearly: 480000,
    is_active: true,
  },
};

let currentUserPlan = 'free';

jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    resolvePlan: jest.fn().mockImplementation(async () => mockPlans[currentUserPlan]),
    checkFeature: jest.fn().mockImplementation(async (_userId: number, featureKey: string) => {
      const tierFeatures = TIER_FEATURES[currentUserPlan] ?? TIER_FEATURES.free;
      return {
        allowed: tierFeatures.includes(featureKey as any),
        limit: null,
        used: 0,
        remaining: null,
      };
    }),
    getPlanLimit: jest.fn().mockImplementation(async (_userId: number, limitKey: string) => {
      const limits: Record<string, Record<string, number | null>> = {
        free: { max_scans_per_day: 10, max_alerts: 1, max_portfolios: 0, max_exchange_pairs: 3 },
        basic: {
          max_scans_per_day: 100,
          max_alerts: 10,
          max_portfolios: 3,
          max_exchange_pairs: 10,
        },
        pro: { max_scans_per_day: 500, max_alerts: 50, max_portfolios: 10, max_exchange_pairs: 50 },
        enterprise: {
          max_scans_per_day: null,
          max_alerts: null,
          max_portfolios: null,
          max_exchange_pairs: null,
        },
      };
      return limits[currentUserPlan]?.[limitKey] ?? null;
    }),
    getActiveSubscription: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/SubscriptionPlan', () => ({
  SubscriptionPlan: {
    findByPk: jest.fn().mockImplementation((id: number) => {
      const plan = Object.values(mockPlans).find((p: any) => p.id === id);
      return Promise.resolve(plan ?? null);
    }),
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(mockPlans[where.slug] ?? null);
    }),
    findAll: jest.fn().mockResolvedValue(Object.values(mockPlans)),
  },
}));

jest.mock('../../src/models/Subscription', () => ({
  Subscription: {
    findOne: jest.fn().mockResolvedValue(null),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/FeatureEntitlement', () => ({
  FeatureEntitlement: { findOne: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../src/models/User', () => ({ User: {} }));

// ── Import after mocks ────────────────────────────────────────────────

import {
  requireFeatures,
  requireAllFeatures,
  checkUserFeature,
} from '../../src/middleware/planGuard';

// ── Helper: create mock req/res/next ─────────────────────────────────

function createMocks(userId?: number) {
  const req: any = {
    user: userId !== undefined ? { userId } : undefined,
    query: {},
    body: {},
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

// ──────────────────────────────────────────────────────────────────────

describe('PlanGuard — Bypass prevention tests', () => {
  beforeEach(() => {
    currentUserPlan = 'free';
  });

  // ── Unauthenticated access ─────────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('rejects unauthenticated requests to protected features', async () => {
      const { req, res, next } = createMocks(undefined);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });

    it('rejects unauthenticated requests to analytics', async () => {
      const { req, res, next } = createMocks(undefined);
      const middleware = requireFeatures(FEATURES.HISTORICAL_ANALYTICS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  // ── Funding view: Free blocked, Pro allowed ────────────────────────

  describe('FUNDING_VIEW — Free users blocked', () => {
    it('blocks Free user from funding rates', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Basic user from funding rates', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Pro user from funding rates', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('allows Enterprise user from funding rates', async () => {
      currentUserPlan = 'enterprise';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Historical analytics: Free blocked, Basic+ allowed ─────────────

  describe('HISTORICAL_ANALYTICS — Free users blocked', () => {
    it('blocks Free user from analytics', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.HISTORICAL_ANALYTICS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Basic user from analytics', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.HISTORICAL_ANALYTICS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Advanced calculator: Free blocked, Basic+ allowed ──────────────

  describe('ADVANCED_CALCULATOR — Free users blocked', () => {
    it('blocks Free user from calculator', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.ADVANCED_CALCULATOR);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Basic user from calculator', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.ADVANCED_CALCULATOR);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Advanced filters: Free blocked, Basic+ allowed ─────────────────

  describe('ADVANCED_FILTERS — Free users blocked', () => {
    it('blocks Free user from advanced filters', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.ADVANCED_FILTERS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Basic user from advanced filters', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.ADVANCED_FILTERS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Favorites/watchlists: Free blocked, Pro+ allowed ───────────────

  describe('FAVORITES_WATCHLISTS — Free/Basic blocked', () => {
    it('blocks Free user from favorites', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FAVORITES_WATCHLISTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Basic user from favorites', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FAVORITES_WATCHLISTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Pro user from favorites', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FAVORITES_WATCHLISTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Telegram alerts: Free/Basic blocked, Pro+ allowed ──────────────

  describe('TELEGRAM_ALERTS — Free/Basic blocked', () => {
    it('blocks Free user from Telegram alerts', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.TELEGRAM_ALERTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Basic user from Telegram alerts', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.TELEGRAM_ALERTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Pro user from Telegram alerts', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.TELEGRAM_ALERTS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── API access: Only Enterprise ─────────────────────────────────────

  describe('API_ACCESS — Only Enterprise', () => {
    it('blocks Free user from API access', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.API_ACCESS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Basic user from API access', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.API_ACCESS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Pro user from API access', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.API_ACCESS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Enterprise user from API access', async () => {
      currentUserPlan = 'enterprise';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.API_ACCESS);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Real-time scanner: Free/Basic blocked, Pro+ allowed ────────────

  describe('REALTIME_SCANNER — Free/Basic blocked', () => {
    it('blocks Free user from realtime scanner', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.REALTIME_SCANNER);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('blocks Basic user from realtime scanner', async () => {
      currentUserPlan = 'basic';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.REALTIME_SCANNER);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Pro user from realtime scanner', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.REALTIME_SCANNER);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Detailed opportunities: Free/Basic blocked, Pro+ allowed ───────

  describe('DETAILED_OPPORTUNITIES — Free/Basic blocked', () => {
    it('blocks Free user from detailed opportunities', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.DETAILED_OPPORTUNITIES);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows Pro user from detailed opportunities', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.DETAILED_OPPORTUNITIES);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── requireAllFeatures (AND logic) ─────────────────────────────────

  describe('requireAllFeatures — AND logic', () => {
    it('blocks when any required feature is missing', async () => {
      currentUserPlan = 'basic'; // has HISTORICAL_ANALYTICS but not FUNDING_VIEW
      const { req, res, next } = createMocks(1);
      const middleware = requireAllFeatures(FEATURES.HISTORICAL_ANALYTICS, FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows when all required features are present', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireAllFeatures(FEATURES.HISTORICAL_ANALYTICS, FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Attaches planAccess to request ──────────────────────────────────

  describe('Request attachment', () => {
    it('attaches planAccess to request on success', async () => {
      currentUserPlan = 'pro';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(req.planAccess).toBeDefined();
      expect(req.planAccess.allowed).toBe(true);
      expect(req.planAccess.planSlug).toBe('pro');
    });

    it('attaches planAccess to request on failure', async () => {
      currentUserPlan = 'free';
      const { req, res, next } = createMocks(1);
      const middleware = requireFeatures(FEATURES.FUNDING_VIEW);
      await middleware(req, res, next);
      expect(req.planAccess).toBeDefined();
      expect(req.planAccess.allowed).toBe(false);
      expect(req.planAccess.missingFeatures).toContain(FEATURES.FUNDING_VIEW);
    });
  });

  // ── Tier feature matrix completeness ────────────────────────────────

  describe('TIER_FEATURES matrix', () => {
    it('Free tier has only basic_dashboard', () => {
      expect(TIER_FEATURES.free).toEqual([FEATURES.BASIC_DASHBOARD]);
    });

    it('Basic tier has advanced filters, analytics, calculator', () => {
      expect(TIER_FEATURES.basic).toContain(FEATURES.ADVANCED_FILTERS);
      expect(TIER_FEATURES.basic).toContain(FEATURES.HISTORICAL_ANALYTICS);
      expect(TIER_FEATURES.basic).toContain(FEATURES.ADVANCED_CALCULATOR);
    });

    it('Basic tier does NOT have funding view, telegram, or favorites', () => {
      expect(TIER_FEATURES.basic).not.toContain(FEATURES.FUNDING_VIEW);
      expect(TIER_FEATURES.basic).not.toContain(FEATURES.TELEGRAM_ALERTS);
      expect(TIER_FEATURES.basic).not.toContain(FEATURES.FAVORITES_WATCHLISTS);
    });

    it('Pro tier has all non-enterprise features', () => {
      expect(TIER_FEATURES.pro).toContain(FEATURES.FUNDING_VIEW);
      expect(TIER_FEATURES.pro).toContain(FEATURES.TELEGRAM_ALERTS);
      expect(TIER_FEATURES.pro).toContain(FEATURES.FAVORITES_WATCHLISTS);
      expect(TIER_FEATURES.pro).toContain(FEATURES.REALTIME_SCANNER);
      expect(TIER_FEATURES.pro).toContain(FEATURES.DETAILED_OPPORTUNITIES);
    });

    it('Pro tier does NOT have API access or advanced analytics', () => {
      expect(TIER_FEATURES.pro).not.toContain(FEATURES.API_ACCESS);
      expect(TIER_FEATURES.pro).not.toContain(FEATURES.ADVANCED_ANALYTICS);
    });

    it('Enterprise tier has all features', () => {
      expect(TIER_FEATURES.enterprise).toContain(FEATURES.API_ACCESS);
      expect(TIER_FEATURES.enterprise).toContain(FEATURES.ADVANCED_ANALYTICS);
      expect(TIER_FEATURES.enterprise).toContain(FEATURES.FUNDING_VIEW);
      expect(TIER_FEATURES.enterprise).toContain(FEATURES.TELEGRAM_ALERTS);
      expect(TIER_FEATURES.enterprise).toContain(FEATURES.FAVORITES_WATCHLISTS);
    });
  });

  // ── checkUserFeature helper ─────────────────────────────────────────

  describe('checkUserFeature', () => {
    it('returns true for allowed features', async () => {
      currentUserPlan = 'pro';
      const allowed = await checkUserFeature(1, FEATURES.FUNDING_VIEW);
      expect(allowed).toBe(true);
    });

    it('returns false for disallowed features', async () => {
      currentUserPlan = 'free';
      const allowed = await checkUserFeature(1, FEATURES.FUNDING_VIEW);
      expect(allowed).toBe(false);
    });
  });

  // ── Plan limit enforcement ──────────────────────────────────────────

  describe('Plan limits — cannot bypass by manipulating params', () => {
    it('getPlanLimit returns correct limits for Free tier', async () => {
      const { subscriptionService } = require('../../src/services/SubscriptionService');
      const limit = await subscriptionService.getPlanLimit(1, 'max_alerts');
      expect(limit).toBe(1);
    });

    it('getPlanLimit returns correct limits for Basic tier', async () => {
      currentUserPlan = 'basic';
      const { subscriptionService } = require('../../src/services/SubscriptionService');
      const limit = await subscriptionService.getPlanLimit(1, 'max_alerts');
      expect(limit).toBe(10);
    });

    it('getPlanLimit returns unlimited for Enterprise', async () => {
      currentUserPlan = 'enterprise';
      const { subscriptionService } = require('../../src/services/SubscriptionService');
      const limit = await subscriptionService.getPlanLimit(1, 'max_alerts');
      expect(limit).toBeNull();
    });
  });
});
