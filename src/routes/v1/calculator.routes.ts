import { Router } from 'express';
import {
  calculatorController,
  calculatorRateLimiter,
} from '../../controllers/CalculatorController';
import { authenticate } from '../../middleware/authenticate';
import { requireFeatures } from '../../middleware/planGuard';
import { FEATURES } from '../../middleware/planGuard';

const router = Router();

/**
 * POST /api/v1/calculator/spread
 *
 * Calculate estimated profit/ROI for an arbitrage trade.
 * Basic+ feature — advanced calculator requires paid plan.
 * Rate-limited (30 req/15min per IP).
 */
router.post(
  '/calculator/spread',
  authenticate,
  requireFeatures(FEATURES.ADVANCED_CALCULATOR),
  calculatorRateLimiter,
  (req, res, next) => calculatorController.calculateSpread(req, res, next),
);

export default router;
