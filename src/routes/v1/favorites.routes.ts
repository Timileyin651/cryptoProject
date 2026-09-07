import { Router } from 'express';
import { favoriteController } from '../../controllers/FavoriteController';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Favorite Coins ──
router.get('/coins', (req, res, next) => favoriteController.listCoins(req, res, next));
router.get('/coins/:id', (req, res, next) => favoriteController.getCoin(req, res, next));
router.post('/coins', (req, res, next) => favoriteController.addCoin(req, res, next));
router.put('/coins/:id', (req, res, next) => favoriteController.updateCoin(req, res, next));
router.delete('/coins/:id', (req, res, next) => favoriteController.removeCoin(req, res, next));

// ── Favorite Exchanges ──
router.get('/exchanges', (req, res, next) => favoriteController.listExchanges(req, res, next));
router.get('/exchanges/:id', (req, res, next) => favoriteController.getExchange(req, res, next));
router.post('/exchanges', (req, res, next) => favoriteController.addExchange(req, res, next));
router.put('/exchanges/:id', (req, res, next) => favoriteController.updateExchange(req, res, next));
router.delete('/exchanges/:id', (req, res, next) =>
  favoriteController.removeExchange(req, res, next),
);

// ── Watchlists ──
router.get('/watchlists', (req, res, next) => favoriteController.listWatchlists(req, res, next));
router.get('/watchlists/:id', (req, res, next) => favoriteController.getWatchlist(req, res, next));
router.post('/watchlists', (req, res, next) => favoriteController.createWatchlist(req, res, next));
router.put('/watchlists/:id', (req, res, next) =>
  favoriteController.updateWatchlist(req, res, next),
);
router.delete('/watchlists/:id', (req, res, next) =>
  favoriteController.deleteWatchlist(req, res, next),
);

// ── Watchlist Items ──
router.post('/watchlists/:id/items', (req, res, next) =>
  favoriteController.addItem(req, res, next),
);
router.put('/watchlists/:watchlistId/items/:itemId', (req, res, next) =>
  favoriteController.updateItem(req, res, next),
);
router.delete('/watchlists/:watchlistId/items/:itemId', (req, res, next) =>
  favoriteController.removeItem(req, res, next),
);
router.put('/watchlists/:id/reorder', (req, res, next) =>
  favoriteController.reorderItems(req, res, next),
);

// ── Limits ──
router.get('/limits', (req, res, next) => favoriteController.getLimits(req, res, next));

export default router;
