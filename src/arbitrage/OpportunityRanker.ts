import { ArbitrageOpportunity, OpportunityStatus } from './types';
import { logger } from '../utils/logger';

// ──────────────────── Sort keys ──────────────────────────────────────────

export type SortKey =
  'netProfit' | 'roi' | 'grossSpreadPct' | 'totalCost' | 'liquidity' | 'bookAge';

export type SortDirection = 'asc' | 'desc';

export interface RankerConfig {
  /** Maximum number of opportunities to return. Default: 100. */
  maxResults?: number;
  /** Only include these statuses. If empty, all statuses are included. */
  includeStatuses?: OpportunityStatus[];
  /** Minimum net profit to include. Default: -Infinity (no filter). */
  minNetProfit?: number;
  /** Minimum ROI to include. Default: -Infinity. */
  minRoi?: number;
  /** Maximum total cost as fraction of gross spread. Default: Infinity. */
  maxCostRatio?: number;
  /** Primary sort key. Default: 'roi'. */
  sortBy?: SortKey;
  /** Sort direction. Default: 'desc'. */
  sortDirection?: SortDirection;
}

// ──────────────────── OpportunityRanker ──────────────────────────────────

/**
 * Ranks, filters, and deduplicates arbitrage opportunities.
 *
 * Takes a list of calculated opportunities and produces a ranked,
 * filtered output suitable for display or automated execution.
 */
export class OpportunityRanker {
  private config: Required<RankerConfig>;

  constructor(config: RankerConfig = {}) {
    this.config = {
      maxResults: 100,
      includeStatuses: [],
      minNetProfit: -Infinity,
      minRoi: -Infinity,
      maxCostRatio: Infinity,
      sortBy: 'roi',
      sortDirection: 'desc',
      ...config,
    };
  }

  /**
   * Rank and filter a list of opportunities.
   *
   * @param opportunities - Raw calculated opportunities.
   * @param overrides - Optional config overrides for this call.
   * @returns Filtered and sorted opportunities.
   */
  rank(
    opportunities: ArbitrageOpportunity[],
    overrides?: Partial<RankerConfig>,
  ): ArbitrageOpportunity[] {
    const config = { ...this.config, ...overrides };

    // ── Filter ──
    let filtered = opportunities.filter((opp) => {
      // Status filter
      if (config.includeStatuses.length > 0) {
        if (!config.includeStatuses.includes(opp.status)) return false;
      }

      // Profit filter
      if (opp.netProfit < config.minNetProfit) return false;

      // ROI filter
      if (opp.roi < config.minRoi) return false;

      // Cost ratio filter: totalCost / grossSpread
      if (opp.grossSpread > 0) {
        const costRatio = opp.totalCost / (opp.grossSpread * opp.tradeSizeBase);
        if (costRatio > config.maxCostRatio) return false;
      }

      return true;
    });

    // ── Deduplicate: keep best opportunity per (symbol, buyExchange, sellExchange) ──
    filtered = this.deduplicate(filtered);

    // ── Sort ──
    filtered = this.sort(filtered, config.sortBy, config.sortDirection);

    // ── Limit ──
    if (filtered.length > config.maxResults) {
      filtered = filtered.slice(0, config.maxResults);
    }

    return filtered;
  }

  /**
   * Get a summary of opportunities grouped by status.
   */
  summarize(opportunities: ArbitrageOpportunity[]): Record<
    OpportunityStatus,
    {
      count: number;
      bestRoi: number;
      bestNetProfit: number;
      totalNetProfit: number;
    }
  > {
    const summary: Record<
      string,
      {
        count: number;
        bestRoi: number;
        bestNetProfit: number;
        totalNetProfit: number;
      }
    > = {};

    for (const status of [
      'active',
      'marginal',
      'unprofitable',
      'illiquid',
      'blocked',
      'expired',
      'pending',
    ] as OpportunityStatus[]) {
      summary[status] = {
        count: 0,
        bestRoi: 0,
        bestNetProfit: 0,
        totalNetProfit: 0,
      };
    }

    for (const opp of opportunities) {
      const s = summary[opp.status];
      s.count++;
      s.totalNetProfit += opp.netProfit;
      if (opp.roi > s.bestRoi) s.bestRoi = opp.roi;
      if (opp.netProfit > s.bestNetProfit) s.bestNetProfit = opp.netProfit;
    }

    return summary as Record<OpportunityStatus, (typeof summary)[string]>;
  }

  /**
   * Get the top N most profitable opportunities.
   */
  topProfitable(opportunities: ArbitrageOpportunity[], n = 10): ArbitrageOpportunity[] {
    return this.rank(opportunities, {
      includeStatuses: ['active', 'marginal'],
      sortBy: 'netProfit',
      sortDirection: 'desc',
      maxResults: n,
    });
  }

  /**
   * Get opportunities with the best risk-adjusted return.
   * Prefers lower total cost relative to gross spread.
   */
  bestRiskAdjusted(opportunities: ArbitrageOpportunity[], n = 10): ArbitrageOpportunity[] {
    // Filter to only active/marginal
    const eligible = opportunities.filter((o) => o.status === 'active' || o.status === 'marginal');

    // Score by: netProfit / (totalCost + epsilon) * bookFreshness
    const scored = eligible.map((opp) => ({
      opp,
      score: this.riskAdjustedScore(opp),
    }));

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, n).map((s) => s.opp);
  }

  // ──────────────────── Internal ────────────────────────────────────────

  /**
   * Remove duplicates: for the same (symbol, buyExchange, sellExchange),
   * keep only the best opportunity (highest ROI).
   */
  private deduplicate(opportunities: ArbitrageOpportunity[]): ArbitrageOpportunity[] {
    const bestByKey = new Map<string, ArbitrageOpportunity>();

    for (const opp of opportunities) {
      const key = `${opp.symbol}:${opp.direction.buyExchange}:${opp.direction.sellExchange}`;
      const existing = bestByKey.get(key);
      if (!existing || opp.roi > existing.roi) {
        bestByKey.set(key, opp);
      }
    }

    return Array.from(bestByKey.values());
  }

  /**
   * Sort opportunities by the given key and direction.
   */
  private sort(
    opportunities: ArbitrageOpportunity[],
    sortBy: SortKey,
    direction: SortDirection,
  ): ArbitrageOpportunity[] {
    const sorted = [...opportunities];

    sorted.sort((a, b) => {
      let cmp = 0;

      switch (sortBy) {
        case 'netProfit':
          cmp = a.netProfit - b.netProfit;
          break;
        case 'roi':
          cmp = a.roi - b.roi;
          break;
        case 'grossSpreadPct':
          cmp = a.grossSpreadPct - b.grossSpreadPct;
          break;
        case 'totalCost':
          cmp = a.totalCost - b.totalCost;
          break;
        case 'liquidity':
          cmp =
            a.liquidity.buyFillRatio +
            a.liquidity.sellFillRatio -
            (b.liquidity.buyFillRatio + b.liquidity.sellFillRatio);
          break;
        case 'bookAge':
          cmp = a.bookAgeMs - b.bookAgeMs;
          break;
      }

      return direction === 'desc' ? -cmp : cmp;
    });

    return sorted;
  }

  /**
   * Risk-adjusted score: higher is better.
   * Considers profitability, cost efficiency, liquidity depth, and data freshness.
   */
  private riskAdjustedScore(opp: ArbitrageOpportunity): number {
    const epsilon = 1e-10;

    // Profitability component (normalized by capital)
    const profitScore = opp.roi;

    // Cost efficiency: how much of the gross spread survives
    const grossSpreadTotal = opp.grossSpread * opp.tradeSizeBase;
    const costEfficiency = grossSpreadTotal > 0 ? 1 - opp.totalCost / grossSpreadTotal : 0;

    // Liquidity depth: both sides fill ratio
    const liquidityScore = (opp.liquidity.buyFillRatio + opp.liquidity.sellFillRatio) / 2;

    // Freshness: newer data is better (decay over 30s)
    const freshnessScore = Math.max(0, 1 - opp.bookAgeMs / 30_000);

    // Weighted combination
    return profitScore * 0.4 + costEfficiency * 0.25 + liquidityScore * 0.2 + freshnessScore * 0.15;
  }
}
