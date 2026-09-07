import { Coin } from '../models/Coin';
import { Network } from '../models/Network';
import { ExchangeCoin } from '../models/ExchangeCoin';
import { NotFoundError, ConflictError } from '../utils/errors';

class CoinService {
  // ──────────────────── Coins ───────────────────────────────────────────

  async listCoins(onlyActive = true): Promise<Coin[]> {
    const where = onlyActive ? { is_active: true } : {};
    return Coin.findAll({ where, order: [['symbol', 'ASC']] });
  }

  async getCoinById(id: number): Promise<Coin> {
    const coin = await Coin.findByPk(id);
    if (!coin) throw new NotFoundError(`Coin #${id} not found`);
    return coin;
  }

  async getCoinBySymbol(symbol: string): Promise<Coin> {
    const coin = await Coin.findOne({ where: { symbol: symbol.toUpperCase() } });
    if (!coin) throw new NotFoundError(`Coin '${symbol}' not found`);
    return coin;
  }

  async getCoinBySlug(slug: string): Promise<Coin> {
    const coin = await Coin.findOne({ where: { slug: slug.toLowerCase() } });
    if (!coin) throw new NotFoundError(`Coin '${slug}' not found`);
    return coin;
  }

  async createCoin(data: {
    symbol: string;
    name: string;
    slug: string;
    decimals?: number;
    logoUrl?: string;
    coingeckoId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Coin> {
    const existing = await Coin.findOne({
      where: { symbol: data.symbol.toUpperCase() },
    });
    if (existing) throw new ConflictError(`Coin symbol '${data.symbol}' already exists`);

    return Coin.create({
      symbol: data.symbol.toUpperCase(),
      name: data.name,
      slug: data.slug.toLowerCase(),
      decimals: data.decimals ?? 18,
      logo_url: data.logoUrl ?? null,
      coingecko_id: data.coingeckoId ?? null,
      is_active: true,
      metadata: data.metadata ?? null,
    });
  }

  async updateCoin(
    id: number,
    data: Partial<{
      name: string;
      logoUrl: string;
      coingeckoId: string;
      isActive: boolean;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<Coin> {
    const coin = await this.getCoinById(id);
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.logoUrl !== undefined) updates.logo_url = data.logoUrl;
    if (data.coingeckoId !== undefined) updates.coingecko_id = data.coingeckoId;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    if (data.metadata !== undefined) updates.metadata = data.metadata;

    if (Object.keys(updates).length > 0) {
      await coin.update(updates);
    }
    return coin.reload();
  }

  // ──────────────────── Networks ────────────────────────────────────────

  async listNetworks(onlyActive = true): Promise<Network[]> {
    const where = onlyActive ? { is_active: true } : {};
    return Network.findAll({
      where,
      include: [{ model: Coin, as: 'nativeCurrency' }],
      order: [['name', 'ASC']],
    });
  }

  async getNetworkById(id: number): Promise<Network> {
    const network = await Network.findByPk(id);
    if (!network) throw new NotFoundError(`Network #${id} not found`);
    return network;
  }

  async getNetworkBySlug(slug: string): Promise<Network> {
    const network = await Network.findOne({ where: { slug: slug.toLowerCase() } });
    if (!network) throw new NotFoundError(`Network '${slug}' not found`);
    return network;
  }

  async createNetwork(data: {
    name: string;
    slug: string;
    chainId?: number;
    nativeCurrencyId?: number;
    explorerUrl?: string;
    rpcUrl?: string;
    avgBlockTimeSeconds?: number;
    metadata?: Record<string, unknown>;
  }): Promise<Network> {
    const existing = await Network.findOne({ where: { slug: data.slug.toLowerCase() } });
    if (existing) throw new ConflictError(`Network slug '${data.slug}' already exists`);

    return Network.create({
      name: data.name,
      slug: data.slug.toLowerCase(),
      chain_id: data.chainId ?? null,
      native_currency_id: data.nativeCurrencyId ?? null,
      explorer_url: data.explorerUrl ?? null,
      rpc_url: data.rpcUrl ?? null,
      is_active: true,
      avg_block_time_seconds: data.avgBlockTimeSeconds ?? null,
      metadata: data.metadata ?? null,
    });
  }

  async updateNetwork(
    id: number,
    data: Partial<{
      name: string;
      chainId: number;
      nativeCurrencyId: number;
      explorerUrl: string;
      rpcUrl: string;
      isActive: boolean;
      avgBlockTimeSeconds: number;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<Network> {
    const network = await this.getNetworkById(id);
    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name;
    if (data.chainId !== undefined) updates.chain_id = data.chainId;
    if (data.nativeCurrencyId !== undefined) updates.native_currency_id = data.nativeCurrencyId;
    if (data.explorerUrl !== undefined) updates.explorer_url = data.explorerUrl;
    if (data.rpcUrl !== undefined) updates.rpc_url = data.rpcUrl;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    if (data.avgBlockTimeSeconds !== undefined)
      updates.avg_block_time_seconds = data.avgBlockTimeSeconds;
    if (data.metadata !== undefined) updates.metadata = data.metadata;

    if (Object.keys(updates).length > 0) {
      await network.update(updates);
    }
    return network.reload();
  }

  // ──────────────── Cross-entity lookups ────────────────────────────────

  /**
   * For a given coin, find which networks it's available on
   * across all exchanges.
   */
  async getNetworksForCoin(
    coinId: number,
  ): Promise<(ExchangeCoin & { network: Network | null; exchange: any })[]> {
    return ExchangeCoin.findAll({
      where: { coin_id: coinId },
      include: [
        { model: Network, as: 'network' },
        { model: (await import('../models/Exchange')).Exchange, as: 'exchange' },
      ],
    }) as any;
  }

  /**
   * Get the withdrawal info for a specific coin on a specific exchange+network.
   */
  async getWithdrawalInfo(
    coinId: number,
    exchangeId: number,
    networkId?: number,
  ): Promise<ExchangeCoin | null> {
    const where: Record<string, unknown> = {
      coin_id: coinId,
      exchange_id: exchangeId,
    };
    if (networkId !== undefined) {
      where.network_id = networkId;
    }
    return ExchangeCoin.findOne({ where });
  }
}

export const coinService = new CoinService();
export { CoinService };
