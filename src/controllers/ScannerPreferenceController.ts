import { Request, Response, NextFunction } from 'express';
import { scannerFilterService } from '../services/ScannerFilterService';
import { opportunityService } from '../services/OpportunityService';

// ──────────────────── ScannerPreferenceController ───────────────────────

export class ScannerPreferenceController {
  /**
   * GET /api/v1/scanner/preferences
   *
   * List all saved preferences for the authenticated user.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const preferences = await scannerFilterService.listPreferences(userId);
      res.status(200).json({ data: preferences });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/scanner/preferences/:id
   *
   * Get a single saved preference.
   */
  async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid preference ID' });
        return;
      }

      const pref = await scannerFilterService.getPreference(userId, id);
      res.status(200).json({ data: pref });
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/scanner/preferences
   *
   * Create a new saved preference.
   * Body: { name: string, filters: ScannerFilterState, isDefault?: boolean }
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { name, filters, isDefault } = req.body;

      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      if (!filters || typeof filters !== 'object') {
        res.status(400).json({ error: 'filters object is required' });
        return;
      }

      const pref = await scannerFilterService.createPreference(userId, {
        name,
        filters,
        isDefault,
      });

      res.status(201).json({ data: pref });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/scanner/preferences/:id
   *
   * Update an existing saved preference.
   */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid preference ID' });
        return;
      }

      const { name, filters, isDefault } = req.body;
      const pref = await scannerFilterService.updatePreference(userId, id, {
        name,
        filters,
        isDefault,
      });

      res.status(200).json({ data: pref });
    } catch (error) {
      next(error);
    }
  }

  /**
   * DELETE /api/v1/scanner/preferences/:id
   *
   * Delete a saved preference.
   */
  async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid preference ID' });
        return;
      }

      await scannerFilterService.deletePreference(userId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /**
   * POST /api/v1/scanner/preferences/:id/apply
   *
   * Apply a saved preference: run a query with the saved filters
   * and return results. Also increments usage count.
   */
  async apply(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid preference ID' });
        return;
      }

      const { options, preference } = await scannerFilterService.applyPreference(userId, id);

      // Enforce plan limits
      const { sanitized, restrictions } = await scannerFilterService.enforceLimits(userId, options);
      sanitized._userId = userId;
      sanitized._restrictions = restrictions;

      const result = await opportunityService.query(sanitized);

      res.status(200).json({
        data: result.data,
        pagination: result.pagination,
        appliedPreference: {
          id: preference.id,
          name: preference.name,
          filters: preference.filters,
        },
        restrictions,
      });
    } catch (error) {
      next(error);
    }
  }

  /**
   * PUT /api/v1/scanner/preferences/reorder
   *
   * Reorder preferences. Body: { orderedIds: number[] }
   */
  async reorder(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'orderedIds array is required' });
        return;
      }

      await scannerFilterService.reorderPreferences(userId, orderedIds);
      res.status(200).json({ message: 'Reordered successfully' });
    } catch (error) {
      next(error);
    }
  }

  /**
   * GET /api/v1/scanner/limits
   *
   * Get the current user's plan filter limits.
   */
  async getLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const limits = await scannerFilterService.resolveLimits(userId);
      const prefCount = (await scannerFilterService.listPreferences(userId)).length;

      res.status(200).json({
        data: {
          limits,
          currentPreferences: prefCount,
          maxPreferences: limits.maxSavedPreferences,
        },
      });
    } catch (error) {
      next(error);
    }
  }
}

export const scannerPreferenceController = new ScannerPreferenceController();
