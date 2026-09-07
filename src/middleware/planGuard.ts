import { Request, Response, NextFunction } from 'express';
import { subscriptionService } from '../services/SubscriptionService';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Feature Keys ─────────────────────────────────────

/**
 * Canonical feature keys for the product.
 * These map 1:1 to feature_entitlements rows in the database.
 *
 * Tier mapping:
 *   Free     → basic_dashboard only
 *   Basic    → + advanced_filters, limited exchanges, limited history
 *   Pro      → + realtime, detailed data, analytics, calculator, favorites, alerts, funding, telegram
 *   Enterprise → + api_access, advanced_analytics, higher limits
 */
export const FEATURES = {
  // Scanner
  BASIC_DASHBOARD: 'scanner.basic_dashboard',
  ADVANCED_FILTERS: 'scanner.advanced_filters',
  FULL_EXCHANGE_COVERAGE: 'scanner.full_exchange_coverage',
  REALTIME_SCANNER: 'scanner.realtime_scanner',
  DETAILED_OPPORTUNITIES: 'scanner.detailed_opportunities',

  // Analytics
  HISTORICAL_ANALYTICS: 'scanner.historical_analytics',
  ADVANCED_ANALYTICS: 'scanner.advanced_analytics',

  // Calculator
  ADVANCED_CALCULATOR: 'scanner.advanced_calculator',

  // Favorites & Watchlists
  FAVORITES_WATCHLISTS: 'scanner.favorites_watchlists',

  // Alerts
  REALTIME_ALERTS: 'scanner.realtime_alerts',
  TELEGRAM_ALERTS: 'scanner.telegram_alerts',

  // Funding / Perp
  FUNDING_VIEW: 'scanner.funding_view',

  // Enterprise
  API_ACCESS: 'scanner.api_access',
} as const;

export type FeatureKey = (typeof FEATURES)[keyof typeof FEATURES];

// ──────────────────── Tier → Feature Matrix ────────────────────────────

/**
 * Default feature entitlements per plan slug.
 * Used as a fallback when feature_entitlements rows don't exist yet.
 * These define the MINIMUM guaranteed features for each tier.
 */
export const TIER_FEATURES: Record<string, FeatureKey[]> = {
  free: [FEATURES.BASIC_DASHBOARD],
  basic: [
    FEATURES.BASIC_DASHBOARD,
    FEATURES.ADVANCED_FILTERS,
    FEATURES.HISTORICAL_ANALYTICS,
    FEATURES.ADVANCED_CALCULATOR,
  ],
  pro: [
    FEATURES.BASIC_DASHBOARD,
    FEATURES.ADVANCED_FILTERS,
    FEATURES.FULL_EXCHANGE_COVERAGE,
    FEATURES.REALTIME_SCANNER,
    FEATURES.DETAILED_OPPORTUNITIES,
    FEATURES.HISTORICAL_ANALYTICS,
    FEATURES.ADVANCED_CALCULATOR,
    FEATURES.FAVORITES_WATCHLISTS,
    FEATURES.REALTIME_ALERTS,
    FEATURES.TELEGRAM_ALERTS,
    FEATURES.FUNDING_VIEW,
  ],
  enterprise: [
    FEATURES.BASIC_DASHBOARD,
    FEATURES.ADVANCED_FILTERS,
    FEATURES.FULL_EXCHANGE_COVERAGE,
    FEATURES.REALTIME_SCANNER,
    FEATURES.DETAILED_OPPORTUNITIES,
    FEATURES.HISTORICAL_ANALYTICS,
    FEATURES.ADVANCED_ANALYTICS,
    FEATURES.ADVANCED_CALCULATOR,
    FEATURES.FAVORITES_WATCHLISTS,
    FEATURES.REALTIME_ALERTS,
    FEATURES.TELEGRAM_ALERTS,
    FEATURES.FUNDING_VIEW,
    FEATURES.API_ACCESS,
  ],
};

// ──────────────────── Access result ────────────────────────────────────

export interface PlanAccess {
  allowed: boolean;
  planSlug: string;
  missingFeatures: string[];
}

// ──────────────────── PlanGuard Middleware ──────────────────────────────

/**
 * Middleware factory that gates access behind one or more feature entitlements.
 *
 * Checks the user's current plan against the feature_entitlements table.
 * Falls back to TIER_FEATURES if no entitlement rows exist.
 *
 * Usage:
 *   router.get('/funding/rates', authenticate, requireFeatures(FEATURES.FUNDING_VIEW), handler);
 *   router.get('/analytics', authenticate, requireFeatures(FEATURES.HISTORICAL_ANALYTICS), handler);
 *
 * Multiple features are OR'd — the user needs ANY ONE of the listed features.
 */
export function requireFeatures(...featureKeys: FeatureKey[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      const access = await checkPlanAccess(userId, featureKeys);

      // Attach access info for downstream handlers
      (req as any).planAccess = access;

      if (!access.allowed) {
        const missing = access.missingFeatures.join(', ');
        throw new ForbiddenError(
          `This feature requires a higher plan. Missing: ${missing}. Current plan: ${access.planSlug}`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/**
 * Middleware factory that requires ALL listed features (AND logic).
 *
 * Usage:
 *   router.get('/enterprise/endpoint', authenticate, requireAllFeatures(FEATURES.API_ACCESS, FEATURES.ADVANCED_ANALYTICS), handler);
 */
export function requireAllFeatures(...featureKeys: FeatureKey[]) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      const access = await checkPlanAccessAll(userId, featureKeys);
      (req as any).planAccess = access;

      if (!access.allowed) {
        const missing = access.missingFeatures.join(', ');
        throw new ForbiddenError(
          `This feature requires a higher plan. Missing: ${missing}. Current plan: ${access.planSlug}`,
        );
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

// ──────────────────── Access check helpers ─────────────────────────────

/**
 * Check if a user has ANY of the listed features (OR logic).
 */
async function checkPlanAccess(userId: number, featureKeys: FeatureKey[]): Promise<PlanAccess> {
  const plan = await subscriptionService.resolvePlan(userId);
  const planSlug = plan.slug;

  // Check database entitlements first
  for (const key of featureKeys) {
    const access = await subscriptionService.checkFeature(userId, key);
    if (access.allowed) {
      return { allowed: true, planSlug, missingFeatures: [] };
    }
  }

  // Fallback to tier defaults
  const tierFeatures = TIER_FEATURES[planSlug] ?? TIER_FEATURES.free;
  for (const key of featureKeys) {
    if (tierFeatures.includes(key)) {
      return { allowed: true, planSlug, missingFeatures: [] };
    }
  }

  return {
    allowed: false,
    planSlug,
    missingFeatures: featureKeys.filter((k) => !tierFeatures.includes(k)),
  };
}

/**
 * Check if a user has ALL of the listed features (AND logic).
 */
async function checkPlanAccessAll(userId: number, featureKeys: FeatureKey[]): Promise<PlanAccess> {
  const plan = await subscriptionService.resolvePlan(userId);
  const planSlug = plan.slug;
  const tierFeatures = TIER_FEATURES[planSlug] ?? TIER_FEATURES.free;

  const missing: string[] = [];

  for (const key of featureKeys) {
    // Check DB entitlement
    const dbAccess = await subscriptionService.checkFeature(userId, key);
    if (dbAccess.allowed) continue;

    // Check tier defaults
    if (tierFeatures.includes(key)) continue;

    missing.push(key);
  }

  return {
    allowed: missing.length === 0,
    planSlug,
    missingFeatures: missing,
  };
}

/**
 * Check plan access without middleware (for use in service layer).
 */
export async function checkUserFeature(userId: number, featureKey: FeatureKey): Promise<boolean> {
  const plan = await subscriptionService.resolvePlan(userId);
  const tierFeatures = TIER_FEATURES[plan.slug] ?? TIER_FEATURES.free;

  // Check DB entitlement
  const access = await subscriptionService.checkFeature(userId, featureKey);
  if (access.allowed) return true;

  // Check tier defaults
  return tierFeatures.includes(featureKey);
}
