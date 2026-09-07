import { Router } from 'express';
import { authenticate } from '../../middleware/authenticate';
import { scannerPreferenceController } from '../../controllers/ScannerPreferenceController';

const router = Router();

/**
 * All scanner preference routes require authentication.
 */
router.use(authenticate);

/**
 * GET /api/v1/scanner/limits
 *
 * Get the current user's plan filter limits and preference count.
 */
router.get('/scanner/limits', (req, res, next) =>
  scannerPreferenceController.getLimits(req, res, next),
);

/**
 * GET /api/v1/scanner/preferences
 *
 * List all saved preferences for the authenticated user.
 */
router.get('/scanner/preferences', (req, res, next) =>
  scannerPreferenceController.list(req, res, next),
);

/**
 * GET /api/v1/scanner/preferences/:id
 *
 * Get a single saved preference.
 */
router.get('/scanner/preferences/:id', (req, res, next) =>
  scannerPreferenceController.getById(req, res, next),
);

/**
 * POST /api/v1/scanner/preferences
 *
 * Create a new saved preference.
 */
router.post('/scanner/preferences', (req, res, next) =>
  scannerPreferenceController.create(req, res, next),
);

/**
 * PUT /api/v1/scanner/preferences/:id
 *
 * Update an existing saved preference.
 */
router.put('/scanner/preferences/:id', (req, res, next) =>
  scannerPreferenceController.update(req, res, next),
);

/**
 * DELETE /api/v1/scanner/preferences/:id
 *
 * Delete a saved preference.
 */
router.delete('/scanner/preferences/:id', (req, res, next) =>
  scannerPreferenceController.delete(req, res, next),
);

/**
 * POST /api/v1/scanner/preferences/:id/apply
 *
 * Apply a saved preference: run query with saved filters and return results.
 */
router.post('/scanner/preferences/:id/apply', (req, res, next) =>
  scannerPreferenceController.apply(req, res, next),
);

/**
 * PUT /api/v1/scanner/preferences/reorder
 *
 * Reorder preferences.
 */
router.put('/scanner/preferences/reorder', (req, res, next) =>
  scannerPreferenceController.reorder(req, res, next),
);

export default router;
