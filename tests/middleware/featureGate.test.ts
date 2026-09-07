/**
 * featureGate middleware tests — prove that requireFeature and requireUsageLimit
 * correctly gate access based on subscription plans.
 */

jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    checkFeature: jest.fn(),
    getPlanLimit: jest.fn(),
    resolvePlan: jest.fn(),
  },
}));

import { requireFeature, requireUsageLimit } from '../../src/middleware/featureGate';
import { subscriptionService } from '../../src/services/SubscriptionService';
import { ForbiddenError } from '../../src/utils/errors';

function createMocks(userId?: number) {
  const req: any = { user: userId !== undefined ? { userId } : undefined, query: {}, body: {} };
  const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

describe('featureGate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('requireFeature', () => {
    it('calls next() when feature is allowed', async () => {
      (subscriptionService.checkFeature as jest.Mock).mockResolvedValue({
        allowed: true,
        limit: null,
        used: 0,
        remaining: null,
      });
      const { req, res, next } = createMocks(1);
      await requireFeature('scanner.funding_view')(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('attaches featureAccess to request', async () => {
      (subscriptionService.checkFeature as jest.Mock).mockResolvedValue({
        allowed: true,
        limit: 10,
        used: 5,
        remaining: 5,
      });
      const { req, res, next } = createMocks(1);
      await requireFeature('scanner.advanced_filters')(req, res, next);
      expect(req.featureAccess).toBeDefined();
      expect(req.featureAccess.remaining).toBe(5);
    });

    it('calls next with ForbiddenError when feature is not allowed', async () => {
      (subscriptionService.checkFeature as jest.Mock).mockResolvedValue({
        allowed: false,
        limit: null,
        used: 0,
        remaining: null,
      });
      const { req, res, next } = createMocks(1);
      await requireFeature('scanner.funding_view')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('calls next with ForbiddenError when not authenticated', async () => {
      const { req, res, next } = createMocks(undefined);
      await requireFeature('scanner.funding_view')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  describe('requireUsageLimit', () => {
    it('calls next() when usage is below limit', async () => {
      (subscriptionService.getPlanLimit as jest.Mock).mockResolvedValue(100);
      const countFn = jest.fn().mockResolvedValue(50);
      const { req, res, next } = createMocks(1);
      await requireUsageLimit('max_scans_per_day', countFn)(req, res, next);
      expect(next).toHaveBeenCalledWith();
      expect(req.usageLimit).toBeDefined();
      expect(req.usageLimit.remaining).toBe(50);
    });

    it('calls next with ForbiddenError when limit reached', async () => {
      (subscriptionService.getPlanLimit as jest.Mock).mockResolvedValue(10);
      const countFn = jest.fn().mockResolvedValue(10);
      const { req, res, next } = createMocks(1);
      await requireUsageLimit('max_alerts', countFn)(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });

    it('allows unlimited usage when limit is null', async () => {
      (subscriptionService.getPlanLimit as jest.Mock).mockResolvedValue(null);
      const { req, res, next } = createMocks(1);
      await requireUsageLimit('max_scans_per_day')(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('blocks unauthenticated users', async () => {
      const { req, res, next } = createMocks(undefined);
      await requireUsageLimit('max_alerts')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });
});
