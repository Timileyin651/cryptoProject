import { Request, Response, NextFunction } from 'express';
import { favoriteService } from '../services/FavoriteService';

// ──────────────────── FavoriteController ───────────────────────────────

export class FavoriteController {
  // ──────────────────── Favorite Coins ────────────────────────────────

  /** GET /api/v1/favorites/coins */
  async listCoins(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const coins = await favoriteService.listFavoriteCoins(userId);
      res.status(200).json({ data: coins });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/favorites/coins/:id */
  async getCoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid coin ID' });
        return;
      }

      const coin = await favoriteService.getFavoriteCoin(userId, id);
      res.status(200).json({ data: coin });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/favorites/coins */
  async addCoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { coinSymbol, coinName, notes } = req.body;
      if (!coinSymbol || typeof coinSymbol !== 'string') {
        res.status(400).json({ error: 'coinSymbol is required' });
        return;
      }

      const coin = await favoriteService.addFavoriteCoin(userId, { coinSymbol, coinName, notes });
      res.status(201).json({ data: coin });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/favorites/coins/:id */
  async updateCoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid coin ID' });
        return;
      }

      const { coinName, notes, sortOrder } = req.body;
      const coin = await favoriteService.updateFavoriteCoin(userId, id, {
        coinName,
        notes,
        sortOrder,
      });
      res.status(200).json({ data: coin });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/favorites/coins/:id */
  async removeCoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid coin ID' });
        return;
      }

      await favoriteService.removeFavoriteCoin(userId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Favorite Exchanges ────────────────────────────

  /** GET /api/v1/favorites/exchanges */
  async listExchanges(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const exchanges = await favoriteService.listFavoriteExchanges(userId);
      res.status(200).json({ data: exchanges });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/favorites/exchanges/:id */
  async getExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid exchange ID' });
        return;
      }

      const exch = await favoriteService.getFavoriteExchange(userId, id);
      res.status(200).json({ data: exch });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/favorites/exchanges */
  async addExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { exchangeId, notes } = req.body;
      if (exchangeId === undefined || typeof exchangeId !== 'number') {
        res.status(400).json({ error: 'exchangeId (number) is required' });
        return;
      }

      const exch = await favoriteService.addFavoriteExchange(userId, { exchangeId, notes });
      res.status(201).json({ data: exch });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/favorites/exchanges/:id */
  async updateExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid exchange ID' });
        return;
      }

      const { notes, sortOrder } = req.body;
      const exch = await favoriteService.updateFavoriteExchange(userId, id, { notes, sortOrder });
      res.status(200).json({ data: exch });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/favorites/exchanges/:id */
  async removeExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid exchange ID' });
        return;
      }

      await favoriteService.removeFavoriteExchange(userId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Watchlists ────────────────────────────────────

  /** GET /api/v1/favorites/watchlists */
  async listWatchlists(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const watchlists = await favoriteService.listWatchlists(userId);
      res.status(200).json({ data: watchlists });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/favorites/watchlists/:id */
  async getWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid watchlist ID' });
        return;
      }

      const wl = await favoriteService.getWatchlist(userId, id);
      res.status(200).json({ data: wl });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/favorites/watchlists */
  async createWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { name, description, isDefault } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }

      const wl = await favoriteService.createWatchlist(userId, { name, description, isDefault });
      res.status(201).json({ data: wl });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/favorites/watchlists/:id */
  async updateWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid watchlist ID' });
        return;
      }

      const { name, description, isDefault, sortOrder } = req.body;
      const wl = await favoriteService.updateWatchlist(userId, id, {
        name,
        description,
        isDefault,
        sortOrder,
      });
      res.status(200).json({ data: wl });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/favorites/watchlists/:id */
  async deleteWatchlist(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid watchlist ID' });
        return;
      }

      await favoriteService.deleteWatchlist(userId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Watchlist Items ───────────────────────────────

  /** POST /api/v1/favorites/watchlists/:id/items */
  async addItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const watchlistId = parseInt(req.params.id, 10);
      if (isNaN(watchlistId)) {
        res.status(400).json({ error: 'Invalid watchlist ID' });
        return;
      }

      const { opportunityId, notes, alertAbove, alertBelow } = req.body;
      if (opportunityId === undefined || typeof opportunityId !== 'number') {
        res.status(400).json({ error: 'opportunityId (number) is required' });
        return;
      }

      const item = await favoriteService.addItem(userId, watchlistId, {
        opportunityId,
        notes,
        alertAbove,
        alertBelow,
      });
      res.status(201).json({ data: item });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/favorites/watchlists/:watchlistId/items/:itemId */
  async removeItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const watchlistId = parseInt(req.params.watchlistId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      if (isNaN(watchlistId) || isNaN(itemId)) {
        res.status(400).json({ error: 'Invalid watchlist or item ID' });
        return;
      }

      await favoriteService.removeItem(userId, watchlistId, itemId);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/favorites/watchlists/:watchlistId/items/:itemId */
  async updateItem(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const watchlistId = parseInt(req.params.watchlistId, 10);
      const itemId = parseInt(req.params.itemId, 10);
      if (isNaN(watchlistId) || isNaN(itemId)) {
        res.status(400).json({ error: 'Invalid watchlist or item ID' });
        return;
      }

      const { notes, alertAbove, alertBelow, sortOrder } = req.body;
      const item = await favoriteService.updateItem(userId, watchlistId, itemId, {
        notes,
        alertAbove,
        alertBelow,
        sortOrder,
      });
      res.status(200).json({ data: item });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/favorites/watchlists/:id/reorder */
  async reorderItems(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const watchlistId = parseInt(req.params.id, 10);
      if (isNaN(watchlistId)) {
        res.status(400).json({ error: 'Invalid watchlist ID' });
        return;
      }

      const { orderedIds } = req.body;
      if (!Array.isArray(orderedIds)) {
        res.status(400).json({ error: 'orderedIds array is required' });
        return;
      }

      await favoriteService.reorderItems(userId, watchlistId, orderedIds);
      res.status(200).json({ message: 'Reordered successfully' });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Limits ────────────────────────────────────────

  /** GET /api/v1/favorites/limits */
  async getLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await favoriteService.getLimits(userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const favoriteController = new FavoriteController();
