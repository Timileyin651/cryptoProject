import { Router } from 'express';
import { opportunityController } from '../../controllers/OpportunityController';
import { enforceScannerLimits, attachScannerRestrictions } from '../../middleware/scannerGate';

const router = Router();

/**
 * GET /api/v1/arbitrage/opportunities
 *
 * List opportunities with pagination, filtering, sorting, search.
 * Plan limits are enforced server-side via scannerGate middleware.
 */
router.get(
  '/arbitrage/opportunities',
  enforceScannerLimits,
  attachScannerRestrictions,
  (req, res, next) => opportunityController.list(req, res, next),
);

/**
 * GET /api/v1/arbitrage/opportunities/:id
 *
 * Get a single opportunity with legs and snapshots.
 */
router.get('/arbitrage/opportunities/:id', (req, res, next) =>
  opportunityController.getById(req, res, next),
);

/**
 * GET /api/v1/arbitrage/history
 *
 * Get historical snapshots for an opportunity.
 * Query: opportunityId (required), page, limit, since
 */
router.get('/arbitrage/history', (req, res, next) => opportunityController.history(req, res, next));

/**
 * GET /api/v1/arbitrage/stats
 *
 * Get aggregate statistics across all opportunities.
 * Query: opportunityType, since
 */
router.get('/arbitrage/stats', (req, res, next) => opportunityController.stats(req, res, next));

export default router;
