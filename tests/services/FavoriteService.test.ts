import { FavoriteService } from '../../src/services/FavoriteService';

// Mock subscription service
jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    resolvePlan: jest.fn().mockResolvedValue({
      id: 1,
      slug: 'free',
      name: 'Free',
    }),
  },
}));

jest.mock('../../src/models/OpportunityRecord', () => ({
  OpportunityRecord: {
    findByPk: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(id === 999 ? null : { id, symbol: 'BTC/USDT' }),
      ),
  },
}));

jest.mock('../../src/models/Exchange', () => ({
  Exchange: {
    findByPk: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(id === 999 ? null : { id, name: 'Binance' }),
      ),
  },
}));

// Shared in-memory stores accessible from tests via the mock models
const mockCoins: any[] = [];
const mockExchanges: any[] = [];
const mockWatchlists: any[] = [];
const mockItems: any[] = [];

jest.mock('../../src/models/FavoriteCoin', () => {
  const findAll = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockCoins.filter((c) => c.user_id === where?.user_id)),
    );
  const findOne = jest.fn().mockImplementation(({ where }: any) => {
    const match = mockCoins.find((c) => {
      for (const key of Object.keys(where)) {
        if (c[key] !== where[key]) return false;
      }
      return true;
    });
    return Promise.resolve(match ?? null);
  });
  const count = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockCoins.filter((c) => c.user_id === where?.user_id).length),
    );
  const max = jest.fn().mockImplementation((_col: string, { where }: any) => {
    const filtered = mockCoins.filter((c) => c.user_id === where?.user_id);
    return Promise.resolve(
      filtered.length ? Math.max(...filtered.map((c) => c.sort_order ?? 0)) : 0,
    );
  });
  const create = jest.fn().mockImplementation((data: any) => {
    const inst = { id: Date.now() + Math.random(), ...data };
    inst.reload = jest.fn().mockResolvedValue(inst);
    inst.update = jest.fn().mockImplementation((updates: any) => {
      Object.assign(inst, updates);
      return Promise.resolve(inst);
    });
    inst.destroy = jest.fn().mockImplementation(() => {
      const idx = mockCoins.indexOf(inst);
      if (idx >= 0) mockCoins.splice(idx, 1);
      return Promise.resolve(1);
    });
    mockCoins.push(inst);
    return Promise.resolve(inst);
  });
  const update = jest.fn().mockResolvedValue([1]);
  const destroy = jest.fn().mockResolvedValue(1);
  return { FavoriteCoin: { findAll, findOne, count, max, create, update, destroy } };
});

jest.mock('../../src/models/FavoriteExchange', () => {
  const findAll = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockExchanges.filter((e) => e.user_id === where?.user_id)),
    );
  const findOne = jest.fn().mockImplementation(({ where }: any) => {
    const match = mockExchanges.find((e) => {
      for (const key of Object.keys(where)) {
        if (e[key] !== where[key]) return false;
      }
      return true;
    });
    return Promise.resolve(match ?? null);
  });
  const count = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockExchanges.filter((e) => e.user_id === where?.user_id).length),
    );
  const max = jest.fn().mockImplementation((_col: string, { where }: any) => {
    const filtered = mockExchanges.filter((e) => e.user_id === where?.user_id);
    return Promise.resolve(
      filtered.length ? Math.max(...filtered.map((e) => e.sort_order ?? 0)) : 0,
    );
  });
  const create = jest.fn().mockImplementation((data: any) => {
    const inst = { id: Date.now() + Math.random(), ...data };
    inst.reload = jest.fn().mockResolvedValue(inst);
    inst.update = jest.fn().mockImplementation((updates: any) => {
      Object.assign(inst, updates);
      return Promise.resolve(inst);
    });
    inst.destroy = jest.fn().mockImplementation(() => {
      const idx = mockExchanges.indexOf(inst);
      if (idx >= 0) mockExchanges.splice(idx, 1);
      return Promise.resolve(1);
    });
    mockExchanges.push(inst);
    return Promise.resolve(inst);
  });
  const update = jest.fn().mockResolvedValue([1]);
  const destroy = jest.fn().mockResolvedValue(1);
  return { FavoriteExchange: { findAll, findOne, count, max, create, update, destroy } };
});

jest.mock('../../src/models/Watchlist', () => {
  const findAll = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockWatchlists.filter((w) => w.user_id === where?.user_id)),
    );
  const findOne = jest.fn().mockImplementation(({ where }: any) => {
    const match = mockWatchlists.find((w) => {
      for (const key of Object.keys(where)) {
        if (w[key] !== where[key]) return false;
      }
      return true;
    });
    return Promise.resolve(match ?? null);
  });
  const findByPk = jest
    .fn()
    .mockImplementation((id: number) =>
      Promise.resolve(mockWatchlists.find((w) => w.id === id) ?? null),
    );
  const count = jest
    .fn()
    .mockImplementation(({ where }: any) =>
      Promise.resolve(mockWatchlists.filter((w) => w.user_id === where?.user_id).length),
    );
  const max = jest.fn().mockImplementation((_col: string, { where }: any) => {
    const filtered = mockWatchlists.filter((w) => w.user_id === where?.user_id);
    return Promise.resolve(
      filtered.length ? Math.max(...filtered.map((w) => w.sort_order ?? 0)) : 0,
    );
  });
  const create = jest.fn().mockImplementation((data: any) => {
    const inst = { id: Date.now() + Math.random(), ...data };
    inst.reload = jest.fn().mockResolvedValue(inst);
    inst.update = jest.fn().mockImplementation((updates: any) => {
      Object.assign(inst, updates);
      return Promise.resolve(inst);
    });
    inst.destroy = jest.fn().mockImplementation(() => {
      const idx = mockWatchlists.indexOf(inst);
      if (idx >= 0) mockWatchlists.splice(idx, 1);
      return Promise.resolve(1);
    });
    mockWatchlists.push(inst);
    return Promise.resolve(inst);
  });
  const update = jest.fn().mockResolvedValue([1]);
  const destroy = jest.fn().mockResolvedValue(1);
  return { Watchlist: { findAll, findOne, findByPk, count, max, create, update, destroy } };
});

jest.mock('../../src/models/WatchlistItem', () => {
  const findAll = jest.fn().mockImplementation(({ where }: any) => {
    if (where?.watchlist_id !== undefined) {
      return Promise.resolve(mockItems.filter((i) => i.watchlist_id === where.watchlist_id));
    }
    return Promise.resolve([...mockItems]);
  });
  const findOne = jest.fn().mockImplementation(({ where }: any) => {
    const match = mockItems.find((i) => {
      for (const key of Object.keys(where)) {
        if (i[key] !== where[key]) return false;
      }
      return true;
    });
    return Promise.resolve(match ?? null);
  });
  const count = jest.fn().mockImplementation(({ include }: any) => {
    if (include?.[0]?.where?.user_id !== undefined) {
      const userId = include[0].where.user_id;
      const wlIds = mockWatchlists.filter((w) => w.user_id === userId).map((w) => w.id);
      return Promise.resolve(mockItems.filter((i) => wlIds.includes(i.watchlist_id)).length);
    }
    return Promise.resolve(mockItems.length);
  });
  const max = jest.fn().mockImplementation((_col: string, { where }: any) => {
    const filtered = mockItems.filter((i) => i.watchlist_id === where?.watchlist_id);
    return Promise.resolve(
      filtered.length ? Math.max(...filtered.map((i) => i.sort_order ?? 0)) : 0,
    );
  });
  const create = jest.fn().mockImplementation((data: any) => {
    const inst = { id: Date.now() + Math.random(), ...data };
    inst.reload = jest.fn().mockResolvedValue(inst);
    inst.update = jest.fn().mockImplementation((updates: any) => {
      Object.assign(inst, updates);
      return Promise.resolve(inst);
    });
    inst.destroy = jest.fn().mockImplementation(() => {
      const idx = mockItems.indexOf(inst);
      if (idx >= 0) mockItems.splice(idx, 1);
      return Promise.resolve(1);
    });
    mockItems.push(inst);
    return Promise.resolve(inst);
  });
  const update = jest.fn().mockResolvedValue([1]);
  const destroy = jest.fn().mockResolvedValue(1);
  return { WatchlistItem: { findAll, findOne, count, max, create, update, destroy } };
});

describe('FavoriteService', () => {
  let service: FavoriteService;

  beforeEach(() => {
    service = new FavoriteService();
    mockCoins.length = 0;
    mockExchanges.length = 0;
    mockWatchlists.length = 0;
    mockItems.length = 0;
  });

  // ── Favorite Coins ──

  describe('addFavoriteCoin', () => {
    it('adds a coin to favorites', async () => {
      const coin = await service.addFavoriteCoin(1, { coinSymbol: 'BTC', coinName: 'Bitcoin' });
      expect(coin.coin_symbol).toBe('BTC');
      expect(coin.coin_name).toBe('Bitcoin');
      expect(coin.user_id).toBe(1);
    });

    it('normalizes symbol to uppercase', async () => {
      const coin = await service.addFavoriteCoin(1, { coinSymbol: 'eth' });
      expect(coin.coin_symbol).toBe('ETH');
    });

    it('rejects duplicate coins', async () => {
      await service.addFavoriteCoin(1, { coinSymbol: 'BTC' });
      await expect(service.addFavoriteCoin(1, { coinSymbol: 'BTC' })).rejects.toThrow(
        'already in your favorites',
      );
    });

    it('rejects empty symbol', async () => {
      await expect(service.addFavoriteCoin(1, { coinSymbol: '' })).rejects.toThrow('required');
    });

    it('enforces plan limit (free: 5)', async () => {
      for (let i = 0; i < 5; i++) {
        await service.addFavoriteCoin(1, { coinSymbol: `COIN${i}` });
      }
      await expect(service.addFavoriteCoin(1, { coinSymbol: 'COIN6' })).rejects.toThrow(
        'limit reached',
      );
    });
  });

  describe('listFavoriteCoins', () => {
    it('returns coins for the user', async () => {
      await service.addFavoriteCoin(1, { coinSymbol: 'BTC' });
      await service.addFavoriteCoin(1, { coinSymbol: 'ETH' });
      const coins = await service.listFavoriteCoins(1);
      expect(coins.length).toBe(2);
    });

    it('returns empty array when no coins', async () => {
      const coins = await service.listFavoriteCoins(1);
      expect(coins.length).toBe(0);
    });
  });

  describe('removeFavoriteCoin', () => {
    it('removes a coin', async () => {
      const coin = await service.addFavoriteCoin(1, { coinSymbol: 'BTC' });
      await service.removeFavoriteCoin(1, coin.id);
      const coins = await service.listFavoriteCoins(1);
      expect(coins.length).toBe(0);
    });

    it('throws for non-existent coin', async () => {
      await expect(service.removeFavoriteCoin(1, 999)).rejects.toThrow('not found');
    });
  });

  describe('updateFavoriteCoin', () => {
    it('updates notes', async () => {
      const coin = await service.addFavoriteCoin(1, { coinSymbol: 'BTC' });
      const updated = await service.updateFavoriteCoin(1, coin.id, { notes: 'My BTC' });
      expect(updated.notes).toBe('My BTC');
    });
  });

  // ── Favorite Exchanges ──

  describe('addFavoriteExchange', () => {
    it('adds an exchange to favorites', async () => {
      const exch = await service.addFavoriteExchange(1, { exchangeId: 1 });
      expect(exch.exchange_id).toBe(1);
      expect(exch.user_id).toBe(1);
    });

    it('rejects non-existent exchange', async () => {
      await expect(service.addFavoriteExchange(1, { exchangeId: 999 })).rejects.toThrow(
        'not found',
      );
    });

    it('rejects duplicate exchanges', async () => {
      await service.addFavoriteExchange(1, { exchangeId: 1 });
      await expect(service.addFavoriteExchange(1, { exchangeId: 1 })).rejects.toThrow(
        'already in your favorites',
      );
    });

    it('enforces plan limit (free: 2)', async () => {
      await service.addFavoriteExchange(1, { exchangeId: 1 });
      await service.addFavoriteExchange(1, { exchangeId: 2 });
      await expect(service.addFavoriteExchange(1, { exchangeId: 3 })).rejects.toThrow(
        'limit reached',
      );
    });
  });

  describe('listFavoriteExchanges', () => {
    it('returns exchanges for the user', async () => {
      await service.addFavoriteExchange(1, { exchangeId: 1 });
      const exchs = await service.listFavoriteExchanges(1);
      expect(exchs.length).toBe(1);
    });
  });

  describe('removeFavoriteExchange', () => {
    it('removes an exchange', async () => {
      const exch = await service.addFavoriteExchange(1, { exchangeId: 1 });
      await service.removeFavoriteExchange(1, exch.id);
      const exchs = await service.listFavoriteExchanges(1);
      expect(exchs.length).toBe(0);
    });
  });

  // ── Watchlists ──

  describe('createWatchlist', () => {
    it('creates a watchlist', async () => {
      const wl = await service.createWatchlist(1, { name: 'My Watchlist' });
      expect(wl.name).toBe('My Watchlist');
      expect(wl.user_id).toBe(1);
      expect(wl.item_count).toBe(0);
    });

    it('rejects empty name', async () => {
      await expect(service.createWatchlist(1, { name: '' })).rejects.toThrow('required');
    });

    it('rejects duplicate name', async () => {
      await service.createWatchlist(1, { name: 'My Watchlist' });
      await expect(service.createWatchlist(1, { name: 'My Watchlist' })).rejects.toThrow(
        'already exists',
      );
    });

    it('enforces plan limit (free: 1)', async () => {
      await service.createWatchlist(1, { name: 'WL1' });
      await expect(service.createWatchlist(1, { name: 'WL2' })).rejects.toThrow('limit reached');
    });
  });

  describe('listWatchlists', () => {
    it('returns watchlists for the user', async () => {
      await service.createWatchlist(1, { name: 'WL1' });
      const wls = await service.listWatchlists(1);
      expect(wls.length).toBe(1);
    });
  });

  describe('deleteWatchlist', () => {
    it('deletes a watchlist', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      await service.deleteWatchlist(1, wl.id);
      const wls = await service.listWatchlists(1);
      expect(wls.length).toBe(0);
    });
  });

  // ── Watchlist Items ──

  describe('addItem', () => {
    it('adds an item to a watchlist', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      const item = await service.addItem(1, wl.id, { opportunityId: 1 });
      expect(item.opportunity_id).toBe(1);
      expect(item.watchlist_id).toBe(wl.id);
    });

    it('rejects non-existent opportunity', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      await expect(service.addItem(1, wl.id, { opportunityId: 999 })).rejects.toThrow('not found');
    });

    it('rejects duplicate items in same watchlist', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      await service.addItem(1, wl.id, { opportunityId: 1 });
      await expect(service.addItem(1, wl.id, { opportunityId: 1 })).rejects.toThrow(
        'already in watchlist',
      );
    });

    it('updates denormalized item_count', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      await service.addItem(1, wl.id, { opportunityId: 1 });
      expect(wl.item_count).toBe(1);
    });
  });

  describe('removeItem', () => {
    it('removes an item from a watchlist', async () => {
      const wl = await service.createWatchlist(1, { name: 'WL1' });
      const item = await service.addItem(1, wl.id, { opportunityId: 1 });
      await service.removeItem(1, wl.id, item.id);
      expect(wl.item_count).toBe(0);
    });
  });

  // ── Limits ──

  describe('getLimits', () => {
    it('returns limits and usage', async () => {
      const result = await service.getLimits(1);
      expect(result.limits.maxFavoriteCoins).toBe(5);
      expect(result.limits.maxFavoriteExchanges).toBe(2);
      expect(result.limits.maxWatchlists).toBe(1);
      expect(result.usage.favoriteCoins).toBe(0);
    });
  });
});
