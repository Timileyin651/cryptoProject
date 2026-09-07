import { Op } from 'sequelize';
import { Exchange } from '../models/Exchange';
import { ExchangeCoin } from '../models/ExchangeCoin';
import { Coin } from '../models/Coin';
import { Network } from '../models/Network';
import { ExchangeAdapter, AdapterRegistry, CoinNetworkStatus } from '../exchanges/ExchangeAdapter';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';
import { logger } from '../utils/logger';

class ExchangeService {
  private adapterRegistry: AdapterRegistry = new Map();

  // ──────────────────────── Adapter registry ────────────────────────────

  /** Register an adapter at startup. */
  registerAdapter(adapter: ExchangeAdapter): void {
    if (this.adapterRegistry.has(adapter.slug)) {
      logger.warn(`Adapter for '${adapter.slug}' already registered — skipping`);
      return;
    }
    this.adapterRegistry.set(adapter.slug, adapter);
    logger.info(`Registered adapter: ${adapter.name} (${adapter.slug})`);
  }

  /** Get a registered adapter by slug. */
  getAdapter(slug: string): ExchangeAdapter | undefined {
    return this.adapterRegistry.get(slug);
  }

  /** Get all registered adapter slugs. */
  getRegisteredAdapterSlugs(): string[] {
    return Array.from(this.adapterRegistry.keys());
  }

  // ──────────────────────── Exchange CRUD ───────────────────────────────

  async listExchanges(onlyActive = true): Promise<Exchange[]> {
    const where = onlyActive ? { is_active: true } : {};
    return Exchange.findAll({ where, order: [['name', 'ASC']] });
  }

  async getExchangeById(id: number): Promise<Exchange> {
    const exchange = await Exchange.findByPk(id);
    if (!exchange) throw new NotFoundError(`Exchange #${id} not found`);
    return exchange;
  }

  async getExchangeBySlug(slug: string): Promise<Exchange> {
    const exchange = await Exchange.findOne({ where: { slug } });
    if (!exchange) throw new NotFoundError(`Exchange '${slug}' not found`);
    return exchange;
  }

  async createExchange(data: {
    name: string;
    slug: string;
    apiBaseUrl?: string;
    supportsSpot?: boolean;
    supportsFutures?: boolean;
    supportsMargin?: boolean;
    supportsWebsocket?: boolean;
    country?: string;
    metadata?: Record<string, unknown>;
  }): Promise<Exchange> {
    const existing = await Exchange.findOne({ where: { slug: data.slug } });
    if (existing) throw new ConflictError(`Exchange slug '${data.slug}' already exists`);

    return Exchange.create({
      name: data.name,
      slug: data.slug,
      api_base_url: data.apiBaseUrl ?? null,
      is_active: true,
      supports_spot: data.supportsSpot ?? true,
      supports_futures: data.supportsFutures ?? false,
      supports_margin: data.supportsMargin ?? false,
      supports_websocket: data.supportsWebsocket ?? false,
      country: data.country ?? null,
      metadata: data.metadata ?? null,
    });
  }

  async updateExchange(
    id: number,
    data: Partial<{
      name: string;
      apiBaseUrl: string;
      isActive: boolean;
      supportsSpot: boolean;
      supportsFutures: boolean;
      supportsMargin: boolean;
      supportsWebsocket: boolean;
      country: string;
      metadata: Record<string, unknown>;
    }>,
  ): Promise<Exchange> {
    const exchange = await this.getExchangeById(id);
    const updates: Record<string, unknown> = {};

    if (data.name !== undefined) updates.name = data.name;
    if (data.apiBaseUrl !== undefined) updates.api_base_url = data.apiBaseUrl;
    if (data.isActive !== undefined) updates.is_active = data.isActive;
    if (data.supportsSpot !== undefined) updates.supports_spot = data.supportsSpot;
    if (data.supportsFutures !== undefined) updates.supports_futures = data.supportsFutures;
    if (data.supportsMargin !== undefined) updates.supports_margin = data.supportsMargin;
    if (data.supportsWebsocket !== undefined) updates.supports_websocket = data.supportsWebsocket;
    if (data.country !== undefined) updates.country = data.country;
    if (data.metadata !== undefined) updates.metadata = data.metadata;

    if (Object.keys(updates).length > 0) {
      await exchange.update(updates);
    }

    return exchange.reload();
  }

  async deactivateExchange(id: number): Promise<Exchange> {
    return this.updateExchange(id, { isActive: false });
  }

  async activateExchange(id: number): Promise<Exchange> {
    return this.updateExchange(id, { isActive: true });
  }

  // ────────────────── Coin ↔ Exchange sync ──────────────────────────────

  /**
   * Sync the `exchange_coins` table from adapter data.
   * Called during a periodic refresh job or on-demand.
   */
  async syncExchangeCoins(exchangeId: number, statuses: CoinNetworkStatus[]): Promise<void> {
    for (const status of statuses) {
      // Resolve coin by symbol
      const coin = await Coin.findOne({ where: { symbol: status.coin.toUpperCase() } });
      if (!coin) {
        logger.warn(`Coin '${status.coin}' not found in DB — skipping sync entry`);
        continue;
      }

      // Resolve network by slug if provided
      let networkId: number | null = null;
      if (status.network) {
        const network = await Network.findOne({ where: { slug: status.network.toLowerCase() } });
        networkId = network?.id ?? null;
      }

      // Upsert
      const existing = await ExchangeCoin.findOne({
        where: {
          exchange_id: exchangeId,
          coin_id: coin.id,
          network_id: networkId,
        },
      });

      if (existing) {
        await existing.update({
          deposit_enabled: status.depositEnabled,
          withdrawal_enabled: status.withdrawalEnabled,
          withdrawal_fee: parseFloat(status.withdrawalFee) || 0,
          min_withdrawal: status.minWithdrawal ? parseFloat(status.minWithdrawal) : null,
          max_withdrawal: status.maxWithdrawal ? parseFloat(status.maxWithdrawal) : null,
          confirmation_blocks: status.confirmationBlocks,
        });
      } else {
        await ExchangeCoin.create({
          exchange_id: exchangeId,
          coin_id: coin.id,
          network_id: networkId,
          deposit_enabled: status.depositEnabled,
          withdrawal_enabled: status.withdrawalEnabled,
          deposit_fee: 0,
          withdrawal_fee: parseFloat(status.withdrawalFee) || 0,
          min_withdrawal: status.minWithdrawal ? parseFloat(status.minWithdrawal) : null,
          max_withdrawal: status.maxWithdrawal ? parseFloat(status.maxWithdrawal) : null,
          min_deposit: null,
          confirmation_blocks: status.confirmationBlocks,
          exchange_symbol: status.coin.toUpperCase(),
        });
      }
    }
  }

  // ──────────────────── Query helpers ───────────────────────────────────

  /** Get all coins listed on a specific exchange. */
  async getCoinsForExchange(
    exchangeId: number,
  ): Promise<(ExchangeCoin & { coin: Coin; network: Network | null })[]> {
    return ExchangeCoin.findAll({
      where: { exchange_id: exchangeId },
      include: [
        { model: Coin, as: 'coin' },
        { model: Network, as: 'network' },
      ],
    }) as any;
  }

  /** Get all exchanges where a specific coin is listed. */
  async getExchangesForCoin(coinId: number): Promise<(ExchangeCoin & { exchange: Exchange })[]> {
    return ExchangeCoin.findAll({
      where: { coin_id: coinId },
      include: [{ model: Exchange, as: 'exchange' }],
    }) as any;
  }

  /** Find deposit/withdrawal info for a specific coin on a specific exchange+network. */
  async getExchangeCoinInfo(
    exchangeId: number,
    coinId: number,
    networkId?: number,
  ): Promise<ExchangeCoin | null> {
    const where: Record<string, unknown> = {
      exchange_id: exchangeId,
      coin_id: coinId,
    };
    if (networkId !== undefined) {
      where.network_id = networkId;
    }
    return ExchangeCoin.findOne({ where });
  }
}

export const exchangeService = new ExchangeService();
export { ExchangeService };
