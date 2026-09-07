import { Request, Response, NextFunction } from 'express';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { FeatureEntitlement } from '../models/FeatureEntitlement';
import { logger } from '../utils/logger';

class MarketingController {
  /** GET /api/v1/marketing/pricing — Public plans data for React frontend. */
  async getPricing(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await SubscriptionPlan.findAll({
        where: { is_active: true },
        order: [['sort_order', 'ASC']],
      });

      const plansWithEntitlements = await Promise.all(
        plans.map(async (plan) => {
          const entitlements = await FeatureEntitlement.findAll({
            where: { plan_id: plan.id, is_enabled: true },
          });

          return {
            ...plan.toJSON(),
            entitlements: entitlements.map((e) => ({
              feature_key: e.feature_key,
              limit_value: e.limit_value,
            })),
          };
        }),
      );

      res.status(200).json({ data: plansWithEntitlements });
    } catch (error) {
      next(error);
    }
  }
}

export const marketingController = new MarketingController();
