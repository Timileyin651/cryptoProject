import { Op, fn, col, literal, WhereOptions, OrderItem } from 'sequelize';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { OpportunitySnapshot } from '../models/OpportunitySnapshot';
import { OpportunityLeg } from '../models/OpportunityLeg';
import { Exchange } from '../models/Exchange';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Query Options ─────────────────────────────────────

export interface OpportunityQueryOptions {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
  search?: string;
  opportunityType?: string;
  status?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  symbol?: string;
  exchange?: string;
  network?: string;
  minProfit?: number;
  maxProfit?: number;
  minRoi?: number;
  maxRoi?: number;
  minSpread?: number;
  maxSpread?: number;
  minVolume?: number;
  liquidityExecutable?: boolean;
  withdrawalAvailable?: boolean;
  depositAvailable?: boolean;
  updatedAfter?: string;
  updatedBefore?: string;
  scanId?: string;
  // ── Plan-enforced filters (set by ScannerFilterService) ──────────
  /** Filter to stablecoin quote currencies only. */
  _stablecoinFilter?: boolean;
  /** Filter to fiat quote currencies only. */
  _fiatFilter?: boolean;
  /** User ID for plan enforcement (attached by middleware). */
  _userId?: number;
  /** Restrictions applied by plan enforcement. */
  _restrictions?: string[];
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
}

// ──────────────────── Sortable columns ──────────────────────────────────

const SORTABLE_COLUMNS: Record<string, string> = {
  id: 'id',
  symbol: 'symbol',
  base_currency: 'base_currency',
  buy_price: 'buy_price',
  sell_price: 'sell_price',
  gross_spread: 'gross_spread',
  gross_spread_pct: 'gross_spread_pct',
  net_profit: 'net_profit',
  roi: 'roi',
  total_cost: 'total_cost',
  total_fees: 'total_fees',
  buy_fee: 'buy_fee',
  sell_fee: 'sell_fee',
  trade_size_base: 'trade_size_base',
  capital_required: 'capital_required',
  buy_depth: 'buy_depth',
  sell_depth: 'sell_depth',
  status: 'status',
  opportunity_type: 'opportunity_type',
  calculated_at: 'calculated_at',
  updated_at: 'updated_at',
  created_at: 'created_at',
  current_funding_rate: 'current_funding_rate',
  funding_rate_apr: 'funding_rate_apr',
  basis: 'basis',
  basis_pct: 'basis_pct',
  net_return_pct: 'net_return_pct',
  buy_exchange_slug: 'buy_exchange_slug',
  sell_exchange_slug: 'sell_exchange_slug',
  network: 'network',
};

// ──────────────────── OpportunityService ────────────────────────────────

class OpportunityService {
  // ──────────────────── Query ─────────────────────────────────────────

  /**
   * Query opportunities with pagination, filtering, sorting, and search.
   */
  async query(options: OpportunityQueryOptions = {}): Promise<PaginatedResult<OpportunityRecord>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(100, Math.max(1, options.limit ?? 25));
    const offset = (page - 1) * limit;

    const where = this.buildWhereClause(options);
    const order = this.buildOrderClause(options);

    const { rows, count } = await OpportunityRecord.findAndCountAll({
      where,
      order,
      limit,
      offset,
      include: [
        { model: Exchange, as: 'buyExchange', attributes: ['id', 'name', 'slug', 'logo_url'] },
        { model: Exchange, as: 'sellExchange', attributes: ['id', 'name', 'slug', 'logo_url'] },
      ],
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  /**
   * Get a single opportunity by ID with legs and snapshots.
   */
  async getById(id: number): Promise<OpportunityRecord> {
    const record = await OpportunityRecord.findByPk(id, {
      include: [
        { model: Exchange, as: 'buyExchange', attributes: ['id', 'name', 'slug', 'logo_url'] },
        { model: Exchange, as: 'sellExchange', attributes: ['id', 'name', 'slug', 'logo_url'] },
        { model: OpportunityLeg, as: 'legs' },
        {
          model: OpportunitySnapshot,
          as: 'snapshots',
          order: [['snapshot_at', 'DESC']],
          limit: 100,
        },
      ],
    });

    if (!record) {
      throw new NotFoundError(`Opportunity #${id} not found`);
    }

    return record;
  }

  /**
   * Get historical snapshots for an opportunity.
   */
  async getHistory(
    opportunityId: number,
    options: { page?: number; limit?: number; since?: string } = {},
  ): Promise<PaginatedResult<OpportunitySnapshot>> {
    const page = Math.max(1, options.page ?? 1);
    const limit = Math.min(500, Math.max(1, options.limit ?? 100));
    const offset = (page - 1) * limit;

    const where: WhereOptions = { opportunity_id: opportunityId };
    if (options.since) {
      (where as any).snapshot_at = { [Op.gte]: new Date(options.since) };
    }

    const { rows, count } = await OpportunitySnapshot.findAndCountAll({
      where,
      order: [['snapshot_at', 'DESC']],
      limit,
      offset,
    });

    const totalPages = Math.ceil(count / limit);

    return {
      data: rows,
      pagination: {
        page,
        limit,
        total: count,
        totalPages,
        hasNext: page < totalPages,
        hasPrev: page > 1,
      },
    };
  }

  // ──────────────────── Stats ─────────────────────────────────────────

  /**
   * Get aggregate statistics across all opportunities.
   */
  async getStats(
    options: { opportunityType?: string; since?: string } = {},
  ): Promise<Record<string, any>> {
    const where: WhereOptions = {};
    if (options.opportunityType) {
      (where as any).opportunity_type = options.opportunityType;
    }
    if (options.since) {
      (where as any).calculated_at = { [Op.gte]: new Date(options.since) };
    }

    const [
      totalCount,
      activeCount,
      marginalCount,
      unprofitableCount,
      illiquidCount,
      blockedCount,
      expiredCount,
      lowFundingCount,
      typeCounts,
      profitStats,
      recentOpps,
    ] = await Promise.all([
      OpportunityRecord.count({ where }),
      OpportunityRecord.count({ where: { ...where, status: 'active' } }),
      OpportunityRecord.count({ where: { ...where, status: 'marginal' } }),
      OpportunityRecord.count({ where: { ...where, status: 'unprofitable' } }),
      OpportunityRecord.count({ where: { ...where, status: 'illiquid' } }),
      OpportunityRecord.count({ where: { ...where, status: 'blocked' } }),
      OpportunityRecord.count({ where: { ...where, status: 'expired' } }),
      OpportunityRecord.count({ where: { ...where, status: 'low_funding' } }),
      OpportunityRecord.findAll({
        where,
        attributes: ['opportunity_type', [fn('COUNT', col('id')), 'count']],
        group: ['opportunity_type'],
        raw: true,
      }),
      OpportunityRecord.findOne({
        where: { ...where, status: { [Op.in]: ['active', 'marginal'] } },
        attributes: [
          [fn('MAX', col('net_profit')), 'maxNetProfit'],
          [fn('AVG', col('net_profit')), 'avgNetProfit'],
          [fn('MAX', col('roi')), 'maxRoi'],
          [fn('AVG', col('roi')), 'avgRoi'],
          [fn('SUM', col('net_profit')), 'totalNetProfit'],
          [fn('MAX', col('gross_spread_pct')), 'maxSpreadPct'],
          [fn('AVG', col('gross_spread_pct')), 'avgSpreadPct'],
        ],
        raw: true,
      }),
      OpportunityRecord.findAll({
        where,
        order: [['calculated_at', 'DESC']],
        limit: 5,
        attributes: [
          'id',
          'symbol',
          'opportunity_type',
          'status',
          'net_profit',
          'roi',
          'calculated_at',
          'buy_exchange_slug',
          'sell_exchange_slug',
        ],
        raw: true,
      }),
    ]);

    const byType: Record<string, number> = {};
    for (const row of typeCounts as any[]) {
      byType[row.opportunity_type] = parseInt(row.count, 10);
    }

    return {
      totals: {
        count: totalCount,
        active: activeCount,
        marginal: marginalCount,
        unprofitable: unprofitableCount,
        illiquid: illiquidCount,
        blocked: blockedCount,
        expired: expiredCount,
        lowFunding: lowFundingCount,
      },
      byType,
      profitability: {
        maxNetProfit: (profitStats as any)?.maxNetProfit ?? 0,
        avgNetProfit: (profitStats as any)?.avgNetProfit ?? 0,
        maxRoi: (profitStats as any)?.maxRoi ?? 0,
        avgRoi: (profitStats as any)?.avgRoi ?? 0,
        totalNetProfit: (profitStats as any)?.totalNetProfit ?? 0,
        maxSpreadPct: (profitStats as any)?.maxSpreadPct ?? 0,
        avgSpreadPct: (profitStats as any)?.avgSpreadPct ?? 0,
      },
      recent: recentOpps,
      queryFilters: {
        opportunityType: options.opportunityType ?? null,
        since: options.since ?? null,
      },
    };
  }

  // ──────────────────── Write ─────────────────────────────────────────

  /**
   * Upsert an opportunity: insert new or update existing if the same
   * (opportunity_type + buy_exchange_slug + sell_exchange_slug + symbol)
   * was seen in the last few seconds.
   */
  async upsert(data: Partial<OpportunityRecord['dataValues']>): Promise<OpportunityRecord> {
    // Look for a very recent record with the same key
    const fiveSecsAgo = new Date(Date.now() - 5000);
    const existing = await OpportunityRecord.findOne({
      where: {
        opportunity_type: data.opportunity_type,
        buy_exchange_slug: data.buy_exchange_slug,
        sell_exchange_slug: data.sell_exchange_slug,
        symbol: data.symbol,
        calculated_at: { [Op.gte]: fiveSecsAgo },
      },
    });

    if (existing) {
      await existing.update(data);
      return existing.reload();
    }

    return OpportunityRecord.create(data as any);
  }

  /**
   * Create a snapshot for an opportunity.
   */
  async createSnapshot(opportunityId: number): Promise<OpportunitySnapshot> {
    const opp = await OpportunityRecord.findByPk(opportunityId);
    if (!opp) throw new NotFoundError(`Opportunity #${opportunityId} not found`);

    return OpportunitySnapshot.create({
      opportunity_id: opportunityId,
      status: opp.status,
      buy_price: opp.buy_price,
      sell_price: opp.sell_price,
      gross_spread: opp.gross_spread,
      gross_spread_pct: opp.gross_spread_pct,
      net_profit: opp.net_profit,
      roi: opp.roi,
      total_cost: opp.total_cost,
      buy_depth: opp.buy_depth,
      sell_depth: opp.sell_depth,
      current_funding_rate: opp.current_funding_rate,
      basis: opp.basis,
      snapshot_at: new Date(),
    } as any);
  }

  /**
   * Bulk create legs for an opportunity.
   */
  async createLegs(
    opportunityId: number,
    legs: Array<Partial<OpportunityLeg['dataValues']>>,
  ): Promise<OpportunityLeg[]> {
    const records = legs.map((leg) => ({
      ...leg,
      opportunity_id: opportunityId,
    }));

    return OpportunityLeg.bulkCreate(records as any);
  }

  /**
   * Bulk upsert multiple opportunities (used by engine scan results).
   */
  async bulkUpsert(records: Array<Partial<OpportunityRecord['dataValues']>>): Promise<number> {
    let created = 0;
    for (const record of records) {
      try {
        await this.upsert(record);
        created++;
      } catch (error) {
        logger.warn('[OpportunityService] Failed to upsert record:', error);
      }
    }
    return created;
  }

  /**
   * Delete old opportunities beyond retention period.
   */
  async pruneOld(daysOld = 30): Promise<number> {
    const cutoff = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
    const deleted = await OpportunityRecord.destroy({
      where: {
        calculated_at: { [Op.lt]: cutoff },
      },
    });
    if (deleted > 0) {
      logger.info(
        `[OpportunityService] Pruned ${deleted} opportunities older than ${daysOld} days`,
      );
    }
    return deleted;
  }

  // ──────────────────── Internal ──────────────────────────────────────

  private buildWhereClause(options: OpportunityQueryOptions): WhereOptions {
    const conditions: WhereOptions[] = [];

    if (options.opportunityType) {
      conditions.push({ opportunity_type: options.opportunityType } as any);
    }

    if (options.status) {
      conditions.push({ status: options.status } as any);
    }

    if (options.baseCurrency) {
      conditions.push({ base_currency: options.baseCurrency.toUpperCase() } as any);
    }

    if (options.quoteCurrency) {
      conditions.push({ quote_currency: options.quoteCurrency.toUpperCase() } as any);
    }

    if (options.symbol) {
      conditions.push({ symbol: options.symbol.toUpperCase() } as any);
    }

    if (options.exchange) {
      conditions.push({
        [Op.or]: [
          { buy_exchange_slug: options.exchange },
          { sell_exchange_slug: options.exchange },
        ],
      } as any);
    }

    if (options.network) {
      conditions.push({ network: options.network } as any);
    }

    if (options.minProfit !== undefined) {
      conditions.push({ net_profit: { [Op.gte]: options.minProfit } } as any);
    }

    if (options.maxProfit !== undefined) {
      conditions.push({ net_profit: { [Op.lte]: options.maxProfit } } as any);
    }

    if (options.minRoi !== undefined) {
      conditions.push({ roi: { [Op.gte]: options.minRoi } } as any);
    }

    if (options.maxRoi !== undefined) {
      conditions.push({ roi: { [Op.lte]: options.maxRoi } } as any);
    }

    if (options.minSpread !== undefined) {
      conditions.push({ gross_spread_pct: { [Op.gte]: options.minSpread } } as any);
    }

    if (options.maxSpread !== undefined) {
      conditions.push({ gross_spread_pct: { [Op.lte]: options.maxSpread } } as any);
    }

    if (options.liquidityExecutable !== undefined) {
      conditions.push({ liquidity_executable: options.liquidityExecutable } as any);
    }

    if (options.withdrawalAvailable !== undefined) {
      conditions.push({ withdrawal_available: options.withdrawalAvailable } as any);
    }

    if (options.depositAvailable !== undefined) {
      conditions.push({ deposit_available: options.depositAvailable } as any);
    }

    if (options.updatedAfter) {
      conditions.push({ calculated_at: { [Op.gte]: new Date(options.updatedAfter) } } as any);
    }

    if (options.updatedBefore) {
      conditions.push({ calculated_at: { [Op.lte]: new Date(options.updatedBefore) } } as any);
    }

    if (options.scanId) {
      conditions.push({ scan_id: options.scanId } as any);
    }

    // ── Stablecoin filter: match quote_currency against known stablecoins ──
    if (options._stablecoinFilter) {
      const { STABLECOIN_QUOTES } = require('../models/ScannerPreference');
      conditions.push({
        quote_currency: { [Op.in]: Array.from(STABLECOIN_QUOTES) },
      } as any);
    }

    // ── Fiat filter: match quote_currency against known fiat codes ──
    if (options._fiatFilter) {
      const { FIAT_QUOTES } = require('../models/ScannerPreference');
      conditions.push({
        quote_currency: { [Op.in]: Array.from(FIAT_QUOTES) },
      } as any);
    }

    // Full-text search across symbol, exchange slugs
    if (options.search) {
      const term = `%${options.search}%`;
      conditions.push({
        [Op.or]: [
          { symbol: { [Op.like]: term } },
          { base_currency: { [Op.like]: term } },
          { buy_exchange_slug: { [Op.like]: term } },
          { sell_exchange_slug: { [Op.like]: term } },
          { buy_symbol: { [Op.like]: term } },
          { sell_symbol: { [Op.like]: term } },
        ],
      } as any);
    }

    if (conditions.length === 0) return {};
    if (conditions.length === 1) return conditions[0];
    return { [Op.and]: conditions };
  }

  private buildOrderClause(options: OpportunityQueryOptions): OrderItem[] {
    const sortBy = SORTABLE_COLUMNS[options.sortBy ?? 'calculated_at'] ?? 'calculated_at';
    const direction = options.sortDirection ?? 'DESC';
    return [[sortBy, direction]];
  }
}

export const opportunityService = new OpportunityService();
export { OpportunityService };
