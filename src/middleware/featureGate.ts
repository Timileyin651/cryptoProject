import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/SubscriptionService';
import { ForbiddenError } from '../utils/errors';

/**
 * Express middleware factory that gates access behind a feature entitlement.
 *
 * Usage:
 *   router.get('/advanced-scan', authenticate, requireFeature('ADVANCED_SCANNER'), handler);
 *
 * The middleware attaches `req.featureAccess` so downstream handlers can
 * inspect limits / remaining quota.
 */
export function requireFeature(featureKey: string) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        next(new ForbiddenError('Authentication required'));
        return;
      }

      const access = await subscriptionService.checkFeature(userId, featureKey);
      (req as any).featureAccess = access;

      if (!access.allowed) {
        throw new ForbiddenError(`Feature '${featureKey}' is not available on your current plan.`);
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Express middleware factory that enforces a per-period usage counter
 * against the plan's limit for a given column on `subscription_plans`.
 *
 * The current usage count must be resolved by the caller and set on
 * the request before this middleware runs, or you can provide a
 * `countFn` that receives the request and returns the count.
 *
 * Usage:
 *   router.post('/scan', authenticate, requireUsageLimit('max_scans_per_day', getScanCount), handler);
 */
export function requireUsageLimit(
  limitColumn: string,
  countFn?: (req: Request) => Promise<number>,
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        next(new ForbiddenError('Authentication required'));
        return;
      }

      const limit = await subscriptionService.getPlanLimit(userId, limitColumn);

      // null = unlimited – skip check
      if (limit === null) {
        next();
        return;
      }

      const used = countFn ? await countFn(req) : 0;

      if (used >= limit) {
        throw new ForbiddenError(
          `Usage limit reached for '${limitColumn}' (${used}/${limit}). Upgrade your plan for higher limits.`,
        );
      }

      // Attach usage info for downstream handlers
      (req as any).usageLimit = { limitColumn, limit, used, remaining: limit - used };
      next();
    } catch (error) {
      next(error);
    }
  };
}
