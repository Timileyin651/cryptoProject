import { Router } from 'express';
import { analyticsController } from '../../controllers/AnalyticsController';
import { authenticate } from '../../middleware/authenticate';
import { requireFeatures } from '../../middleware/planGuard';
import { FEATURES } from '../../middleware/planGuard';

const router = Router();

/**
 * GET /api/v1/analytics/overview
 *
 * Comprehensive analytics overview for a symbol.
 * Basic+ feature — requires historical analytics.
 */
router.get(
  '/analytics/overview',
  authenticate,
  requireFeatures(FEATURES.HISTORICAL_ANALYTICS),
  (req, res, next) => analyticsController.overview(req, res, next),
);

/**
 * GET /api/v1/analytics/spread
 *
 * Spread history OHLC chart data.
 * Basic+ feature.
 */
router.get(
  '/analytics/spread',
  authenticate,
  requireFeatures(FEATURES.HISTORICAL_ANALYTICS),
  (req, res, next) => analyticsController.spreadHistory(req, res, next),
);

/**
 * GET /api/v1/analytics/profit
 *
 * Net profit history.
 * Basic+ feature.
 */
router.get(
  '/analytics/profit',
  authenticate,
  requireFeatures(FEATURES.HISTORICAL_ANALYTICS),
  (req, res, next) => analyticsController.profitHistory(req, res, next),
);

/**
 * GET /api/v1/analytics/price
 *
 * Price history.
 * Basic+ feature.
 */
router.get(
  '/analytics/price',
  authenticate,
  requireFeatures(FEATURES.HISTORICAL_ANALYTICS),
  (req, res, next) => analyticsController.priceHistory(req, res, next),
);

/**
 * GET /api/v1/analytics/funding
 *
 * Funding rate history.
 * Pro+ feature.
 */
router.get(
  '/analytics/funding',
  authenticate,
  requireFeatures(FEATURES.FUNDING_VIEW),
  (req, res, next) => analyticsController.fundingHistory(req, res, next),
);

/**
 * GET /api/v1/analytics/frequency
 *
 * Opportunity frequency over time.
 * Basic+ feature.
 */
router.get(
  '/analytics/frequency',
  authenticate,
  requireFeatures(FEATURES.HISTORICAL_ANALYTICS),
  (req, res, next) => analyticsController.frequencyHistory(req, res, next),
);

/**
 * POST /api/v1/analytics/aggregate
 *
 * Trigger manual aggregation (admin).
 */
router.post('/analytics/aggregate', (req, res, next) =>
  analyticsController.triggerAggregation(req, res, next),
);

export default router;
