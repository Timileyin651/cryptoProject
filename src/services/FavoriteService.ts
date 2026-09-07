import { FavoriteCoin, FavoriteCoinAttributes } from '../models/FavoriteCoin';
import { FavoriteExchange, FavoriteExchangeAttributes } from '../models/FavoriteExchange';
import { Watchlist, WatchlistAttributes } from '../models/Watchlist';
import { WatchlistItem, WatchlistItemAttributes } from '../models/WatchlistItem';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { Exchange } from '../models/Exchange';
import { subscriptionService } from './SubscriptionService';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Plan tier limits ─────────────────────────────────

export interface FavoriteLimits {
  maxFavoriteCoins: number | null;
  maxFavoriteExchanges: number | null;
  maxWatchlists: number | null;
  maxWatchlistItems: number | null;
}

const TIER_LIMITS: Record<string, FavoriteLimits> = {
  free: {
    maxFavoriteCoins: 5,
    maxFavoriteExchanges: 2,
    maxWatchlists: 1,
    maxWatchlistItems: 10,
  },
  basic: {
    maxFavoriteCoins: 20,
    maxFavoriteExchanges: 5,
    maxWatchlists: 5,
    maxWatchlistItems: 50,
  },
  pro: {
    maxFavoriteCoins: 50,
    maxFavoriteExchanges: 10,
    maxWatchlists: 20,
    maxWatchlistItems: 200,
  },
  enterprise: {
    maxFavoriteCoins: null,
    maxFavoriteExchanges: null,
    maxWatchlists: null,
    maxWatchlistItems: null,
  },
};

// ──────────────────── FavoriteService ──────────────────────────────────

class FavoriteService {
  /** Resolve the favorite limits for a user's plan. */
  async resolveLimits(userId: number): Promise<FavoriteLimits> {
    const plan = await subscriptionService.resolvePlan(userId);
    return TIER_LIMITS[plan.slug] ?? TIER_LIMITS.free;
  }

  // ──────────────────── Favorite Coins ────────────────────────────────

  /** List all favorite coins for a user, ordered by sort_order. */
  async listFavoriteCoins(userId: number): Promise<FavoriteCoin[]> {
    return FavoriteCoin.findAll({
      where: { user_id: userId },
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC'],
      ],
    });
  }

  /** Get a single favorite coin by ID. */
  async getFavoriteCoin(userId: number, id: number): Promise<FavoriteCoin> {
    const coin = await FavoriteCoin.findOne({ where: { id, user_id: userId } });
    if (!coin) throw new NotFoundError(`Favorite coin #${id} not found`);
    return coin;
  }

  /** Add a coin to favorites. Enforces plan limits. */
  async addFavoriteCoin(
    userId: number,
    data: { coinSymbol: string; coinName?: string; notes?: string },
  ): Promise<FavoriteCoin> {
    const symbol = data.coinSymbol.toUpperCase().trim();
    if (!symbol) throw new BadRequestError('Coin symbol is required');
    if (symbol.length > 20) throw new BadRequestError('Coin symbol must be 20 characters or less');

    // Check for duplicate
    const existing = await FavoriteCoin.findOne({
      where: { user_id: userId, coin_symbol: symbol },
    });
    if (existing) {
      throw new BadRequestError(`Coin '${symbol}' is already in your favorites`);
    }

    // Enforce plan limits
    const limits = await this.resolveLimits(userId);
    if (limits.maxFavoriteCoins !== null) {
      const count = await FavoriteCoin.count({ where: { user_id: userId } });
      if (count >= limits.maxFavoriteCoins) {
        throw new ForbiddenError(
          `Favorite coin limit reached (${count}/${limits.maxFavoriteCoins}). Upgrade your plan for more.`,
        );
      }
    }

    // Determine sort_order (append to end)
    const maxOrder = await FavoriteCoin.max<number, FavoriteCoin>('sort_order', {
      where: { user_id: userId },
    }).catch(() => 0);

    return FavoriteCoin.create({
      user_id: userId,
      coin_symbol: symbol,
      coin_name: data.coinName ?? null,
      notes: data.notes ?? null,
      sort_order: (maxOrder ?? 0) + 1,
    });
  }

  /** Update a favorite coin. */
  async updateFavoriteCoin(
    userId: number,
    id: number,
    data: { coinName?: string; notes?: string; sortOrder?: number },
  ): Promise<FavoriteCoin> {
    const coin = await this.getFavoriteCoin(userId, id);
    const updates: Record<string, unknown> = {};
    if (data.coinName !== undefined) updates.coin_name = data.coinName;
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
    if (Object.keys(updates).length > 0) await coin.update(updates);
    return coin.reload();
  }

  /** Remove a coin from favorites. */
  async removeFavoriteCoin(userId: number, id: number): Promise<void> {
    const coin = await this.getFavoriteCoin(userId, id);
    await coin.destroy();
  }

  // ──────────────────── Favorite Exchanges ────────────────────────────

  /** List all favorite exchanges for a user, with exchange details. */
  async listFavoriteExchanges(userId: number): Promise<FavoriteExchange[]> {
    return FavoriteExchange.findAll({
      where: { user_id: userId },
      include: [{ model: Exchange, as: 'exchange' }],
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC'],
      ],
    });
  }

  /** Get a single favorite exchange by ID. */
  async getFavoriteExchange(userId: number, id: number): Promise<FavoriteExchange> {
    const exch = await FavoriteExchange.findOne({
      where: { id, user_id: userId },
      include: [{ model: Exchange, as: 'exchange' }],
    });
    if (!exch) throw new NotFoundError(`Favorite exchange #${id} not found`);
    return exch;
  }

  /** Add an exchange to favorites. Enforces plan limits. */
  async addFavoriteExchange(
    userId: number,
    data: { exchangeId: number; notes?: string },
  ): Promise<FavoriteExchange> {
    // Verify exchange exists
    const exchange = await Exchange.findByPk(data.exchangeId);
    if (!exchange) throw new NotFoundError(`Exchange #${data.exchangeId} not found`);

    // Check for duplicate
    const existing = await FavoriteExchange.findOne({
      where: { user_id: userId, exchange_id: data.exchangeId },
    });
    if (existing) {
      throw new BadRequestError(`Exchange '${exchange.name}' is already in your favorites`);
    }

    // Enforce plan limits
    const limits = await this.resolveLimits(userId);
    if (limits.maxFavoriteExchanges !== null) {
      const count = await FavoriteExchange.count({ where: { user_id: userId } });
      if (count >= limits.maxFavoriteExchanges) {
        throw new ForbiddenError(
          `Favorite exchange limit reached (${count}/${limits.maxFavoriteExchanges}). Upgrade your plan for more.`,
        );
      }
    }

    const maxOrder = await FavoriteExchange.max<number, FavoriteExchange>('sort_order', {
      where: { user_id: userId },
    }).catch(() => 0);

    return FavoriteExchange.create({
      user_id: userId,
      exchange_id: data.exchangeId,
      notes: data.notes ?? null,
      sort_order: (maxOrder ?? 0) + 1,
    });
  }

  /** Update a favorite exchange. */
  async updateFavoriteExchange(
    userId: number,
    id: number,
    data: { notes?: string; sortOrder?: number },
  ): Promise<FavoriteExchange> {
    const exch = await this.getFavoriteExchange(userId, id);
    const updates: Record<string, unknown> = {};
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
    if (Object.keys(updates).length > 0) await exch.update(updates);
    return exch.reload();
  }

  /** Remove an exchange from favorites. */
  async removeFavoriteExchange(userId: number, id: number): Promise<void> {
    const exch = await this.getFavoriteExchange(userId, id);
    await exch.destroy();
  }

  // ──────────────────── Watchlists ────────────────────────────────────

  /** List all watchlists for a user. */
  async listWatchlists(userId: number): Promise<Watchlist[]> {
    return Watchlist.findAll({
      where: { user_id: userId },
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC'],
      ],
    });
  }

  /** Get a single watchlist by ID with its items. */
  async getWatchlist(userId: number, id: number): Promise<Watchlist> {
    const wl = await Watchlist.findOne({
      where: { id, user_id: userId },
      include: [
        {
          model: WatchlistItem,
          as: 'items',
          include: [{ model: OpportunityRecord, as: 'opportunity' }],
          order: [['sort_order', 'ASC']],
        },
      ],
    });
    if (!wl) throw new NotFoundError(`Watchlist #${id} not found`);
    return wl;
  }

  /** Create a new watchlist. Enforces plan limits. */
  async createWatchlist(
    userId: number,
    data: { name: string; description?: string; isDefault?: boolean },
  ): Promise<Watchlist> {
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestError('Watchlist name is required');
    }
    if (data.name.length > 100) {
      throw new BadRequestError('Watchlist name must be 100 characters or less');
    }

    // Check name uniqueness
    const existing = await Watchlist.findOne({
      where: { user_id: userId, name: data.name.trim() },
    });
    if (existing) {
      throw new BadRequestError(`A watchlist named '${data.name}' already exists`);
    }

    // Enforce plan limits
    const limits = await this.resolveLimits(userId);
    if (limits.maxWatchlists !== null) {
      const count = await Watchlist.count({ where: { user_id: userId } });
      if (count >= limits.maxWatchlists) {
        throw new ForbiddenError(
          `Watchlist limit reached (${count}/${limits.maxWatchlists}). Upgrade your plan for more.`,
        );
      }
    }

    // Handle default flag
    if (data.isDefault) {
      await Watchlist.update(
        { is_default: false },
        { where: { user_id: userId, is_default: true } },
      );
    }

    const maxOrder = await Watchlist.max<number, Watchlist>('sort_order', {
      where: { user_id: userId },
    }).catch(() => 0);

    return Watchlist.create({
      user_id: userId,
      name: data.name.trim(),
      description: data.description ?? null,
      is_default: data.isDefault ?? false,
      sort_order: (maxOrder ?? 0) + 1,
      item_count: 0,
    });
  }

  /** Update a watchlist. */
  async updateWatchlist(
    userId: number,
    id: number,
    data: { name?: string; description?: string; isDefault?: boolean; sortOrder?: number },
  ): Promise<Watchlist> {
    const wl = await this.getWatchlistMetadata(userId, id);

    if (data.name && data.name !== wl.name) {
      const existing = await Watchlist.findOne({
        where: { user_id: userId, name: data.name.trim() },
      });
      if (existing) {
        throw new BadRequestError(`A watchlist named '${data.name}' already exists`);
      }
    }

    if (data.isDefault) {
      await Watchlist.update(
        { is_default: false },
        { where: { user_id: userId, is_default: true } },
      );
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description;
    if (data.isDefault !== undefined) updates.is_default = data.isDefault;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
    if (Object.keys(updates).length > 0) await wl.update(updates);
    return wl.reload();
  }

  /** Delete a watchlist and all its items. */
  async deleteWatchlist(userId: number, id: number): Promise<void> {
    const wl = await this.getWatchlistMetadata(userId, id);
    // Items cascade-delete via FK constraint
    await wl.destroy();
  }

  /** Get watchlist metadata without items (for internal use). */
  private async getWatchlistMetadata(userId: number, id: number): Promise<Watchlist> {
    const wl = await Watchlist.findOne({ where: { id, user_id: userId } });
    if (!wl) throw new NotFoundError(`Watchlist #${id} not found`);
    return wl;
  }

  // ──────────────────── Watchlist Items ───────────────────────────────

  /** Add an opportunity to a watchlist. Enforces plan item limits. */
  async addItem(
    userId: number,
    watchlistId: number,
    data: {
      opportunityId: number;
      notes?: string;
      alertAbove?: number;
      alertBelow?: number;
    },
  ): Promise<WatchlistItem> {
    const wl = await this.getWatchlistMetadata(userId, watchlistId);

    // Verify opportunity exists
    const opp = await OpportunityRecord.findByPk(data.opportunityId);
    if (!opp) throw new NotFoundError(`Opportunity #${data.opportunityId} not found`);

    // Check for duplicate in this watchlist
    const existing = await WatchlistItem.findOne({
      where: { watchlist_id: watchlistId, opportunity_id: data.opportunityId },
    });
    if (existing) {
      throw new BadRequestError(
        `Opportunity #${data.opportunityId} is already in watchlist '${wl.name}'`,
      );
    }

    // Enforce plan item limits
    const limits = await this.resolveLimits(userId);
    if (limits.maxWatchlistItems !== null) {
      const totalItems = await WatchlistItem.count({
        include: [{ model: Watchlist, as: 'watchlist', where: { user_id: userId } }],
      });
      if (totalItems >= limits.maxWatchlistItems) {
        throw new ForbiddenError(
          `Watchlist item limit reached (${totalItems}/${limits.maxWatchlistItems}). Upgrade your plan for more.`,
        );
      }
    }

    const maxOrder = await WatchlistItem.max<number, WatchlistItem>('sort_order', {
      where: { watchlist_id: watchlistId },
    }).catch(() => 0);

    const item = await WatchlistItem.create({
      watchlist_id: watchlistId,
      opportunity_id: data.opportunityId,
      notes: data.notes ?? null,
      alert_above: data.alertAbove ?? null,
      alert_below: data.alertBelow ?? null,
      sort_order: (maxOrder ?? 0) + 1,
    });

    // Update denormalized count
    await wl.update({ item_count: wl.item_count + 1 });

    return item;
  }

  /** Remove an item from a watchlist. */
  async removeItem(userId: number, watchlistId: number, itemId: number): Promise<void> {
    await this.getWatchlistMetadata(userId, watchlistId);
    const item = await WatchlistItem.findOne({
      where: { id: itemId, watchlist_id: watchlistId },
    });
    if (!item) throw new NotFoundError(`Watchlist item #${itemId} not found`);
    await item.destroy();

    // Update denormalized count
    const wl = await Watchlist.findByPk(watchlistId);
    if (wl && wl.item_count > 0) {
      await wl.update({ item_count: wl.item_count - 1 });
    }
  }

  /** Update a watchlist item (notes, alerts, sort order). */
  async updateItem(
    userId: number,
    watchlistId: number,
    itemId: number,
    data: {
      notes?: string;
      alertAbove?: number | null;
      alertBelow?: number | null;
      sortOrder?: number;
    },
  ): Promise<WatchlistItem> {
    await this.getWatchlistMetadata(userId, watchlistId);
    const item = await WatchlistItem.findOne({
      where: { id: itemId, watchlist_id: watchlistId },
    });
    if (!item) throw new NotFoundError(`Watchlist item #${itemId} not found`);

    const updates: Record<string, unknown> = {};
    if (data.notes !== undefined) updates.notes = data.notes;
    if (data.alertAbove !== undefined) updates.alert_above = data.alertAbove;
    if (data.alertBelow !== undefined) updates.alert_below = data.alertBelow;
    if (data.sortOrder !== undefined) updates.sort_order = data.sortOrder;
    if (Object.keys(updates).length > 0) await item.update(updates);
    return item.reload();
  }

  /** Reorder items within a watchlist. */
  async reorderItems(userId: number, watchlistId: number, orderedIds: number[]): Promise<void> {
    await this.getWatchlistMetadata(userId, watchlistId);
    for (let i = 0; i < orderedIds.length; i++) {
      await WatchlistItem.update(
        { sort_order: i },
        { where: { id: orderedIds[i], watchlist_id: watchlistId } },
      );
    }
  }

  // ──────────────────── Limits endpoint ───────────────────────────────

  /** Return the current usage and limits for a user. */
  async getLimits(userId: number): Promise<{
    limits: FavoriteLimits;
    usage: {
      favoriteCoins: number;
      favoriteExchanges: number;
      watchlists: number;
      watchlistItems: number;
    };
  }> {
    const limits = await this.resolveLimits(userId);

    const [favoriteCoins, favoriteExchanges, watchlists, watchlistItems] = await Promise.all([
      FavoriteCoin.count({ where: { user_id: userId } }),
      FavoriteExchange.count({ where: { user_id: userId } }),
      Watchlist.count({ where: { user_id: userId } }),
      WatchlistItem.count({
        include: [{ model: Watchlist, as: 'watchlist', where: { user_id: userId } }],
      }),
    ]);

    return {
      limits,
      usage: { favoriteCoins, favoriteExchanges, watchlists, watchlistItems },
    };
  }
}

export const favoriteService = new FavoriteService();
export { FavoriteService };
