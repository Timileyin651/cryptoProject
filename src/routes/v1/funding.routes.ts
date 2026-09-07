import { Router } from 'express';
import { fundingController } from '../../controllers/FundingController';
import { authenticate } from '../../middleware/authenticate';
import { requireFeatures } from '../../middleware/planGuard';
import { FEATURES } from '../../middleware/planGuard';

const router = Router();

/**
 * GET /api/v1/funding/rates
 *
 * Returns current funding rates for all discovered spot/perp pairs.
 * Pro+ feature — funding view not available on Free/Basic.
 */
router.get(
  '/funding/rates',
  authenticate,
  requireFeatures(FEATURES.FUNDING_VIEW),
  (req, res, next) => fundingController.getRates(req, res, next),
);

/**
 * GET /api/v1/funding/opportunities
 *
 * Returns ranked funding arbitrage opportunities.
 * Pro+ feature.
 */
router.get(
  '/funding/opportunities',
  authenticate,
  requireFeatures(FEATURES.FUNDING_VIEW),
  (req, res, next) => fundingController.getOpportunities(req, res, next),
);

export default router;
