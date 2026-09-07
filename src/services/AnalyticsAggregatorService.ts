import { Op, fn, col, literal } from 'sequelize';
import { AnalyticsBucket, BucketResolution } from '../models/AnalyticsBucket';
import { OpportunitySnapshot } from '../models/OpportunitySnapshot';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { FundingRateHistory } from '../models/FundingRateHistory';
import { logger } from '../utils/logger';

// ──────────────────── Resolution intervals ──────────────────────────────

const RESOLUTION_MS: Record<BucketResolution, number> = {
  '1m': 60 * 1000,
  '5m': 5 * 60 * 1000,
  '1h': 60 * 60 * 1000,
  '1d': 24 * 60 * 60 * 1000,
};

// ──────────────────── AnalyticsAggregatorService ────────────────────────

class AnalyticsAggregatorService {
  /**
   * Run the full aggregation pipeline.
   * Aggregates raw snapshots into 1h and 1d buckets.
   * Should be called periodically (e.g. every 5 minutes).
   */
  async runFullAggregation(): Promise<{ bucketsCreated: number }> {
    const start = Date.now();
    let totalBuckets = 0;

    try {
      // Aggregate spread metrics from snapshots
      totalBuckets += await this.aggregateMetric('spread', 'gross_spread_pct');
      totalBuckets += await this.aggregateMetric('profit', 'net_profit');
      totalBuckets += await this.aggregateMetric('price', 'buy_price');

      // Aggregate funding rates
      totalBuckets += await this.aggregateFundingRates();

      // Aggregate opportunity frequency
      totalBuckets += await this.aggregateFrequency();

      const duration = Date.now() - start;
      logger.info(`[AnalyticsAggregator] Aggregated ${totalBuckets} buckets in ${duration}ms`);
    } catch (error) {
      logger.error('[AnalyticsAggregator] Aggregation failed:', error);
    }

    return { bucketsCreated: totalBuckets };
  }

  /**
   * Aggregate a single metric from snapshots into buckets.
   */
  private async aggregateMetric(metricType: string, snapshotField: string): Promise<number> {
    let created = 0;

    // Aggregate for each resolution
    for (const resolution of ['1h', '1d'] as BucketResolution[]) {
      const intervalMs = RESOLUTION_MS[resolution];
      const now = Date.now();
      const lookbackMs = resolution === '1h' ? 48 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = new Date(now - lookbackMs);

      // Get distinct (symbol, exchange) combinations from recent snapshots
      const combos = await OpportunitySnapshot.findAll({
        attributes: ['opportunity_id'],
        where: { snapshot_at: { [Op.gte]: since } },
        group: ['opportunity_id'],
        raw: true,
        limit: 500,
      });

      if (combos.length === 0) continue;

      // For each resolution window, aggregate
      const bucketCount = await this.buildAndUpsertBuckets(
        metricType,
        snapshotField,
        resolution,
        intervalMs,
        since,
        new Date(now),
      );

      created += bucketCount;
    }

    return created;
  }

  /**
   * Build OHLC buckets from snapshots for a given metric and resolution.
   */
  private async buildAndUpsertBuckets(
    metricType: string,
    field: string,
    resolution: BucketResolution,
    intervalMs: number,
    since: Date,
    until: Date,
  ): Promise<number> {
    // Use raw SQL for efficient time-bucketed aggregation
    const bucketTableAlias = 'b';
    const sql = `
      INSERT INTO analytics_buckets (
        metric_type, resolution, bucket_start, bucket_end,
        symbol, exchange_slug, base_currency,
        \`open\`, high, low, \`close\`, avg, \`sum\`, count,
        created_at, updated_at
      )
      SELECT
        :metricType AS metric_type,
        :resolution AS resolution,
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(s.snapshot_at) / :intervalSec) * :intervalSec) AS bucket_start,
        FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(s.snapshot_at) / :intervalSec) * :intervalSec + :intervalSec) AS bucket_end,
        o.symbol AS symbol,
        NULL AS exchange_slug,
        o.base_currency AS base_currency,
        SUBSTRING_INDEX(GROUP_CONCAT(CAST(s.${field} AS CHAR) ORDER BY s.snapshot_at ASC), ',', 1) AS \`open\`,
        MAX(CAST(s.${field} AS DECIMAL(36,18))) AS high,
        MIN(CAST(s.${field} AS DECIMAL(36,18))) AS low,
        SUBSTRING_INDEX(GROUP_CONCAT(CAST(s.${field} AS CHAR) ORDER BY s.snapshot_at DESC), ',', 1) AS \`close\`,
        AVG(CAST(s.${field} AS DECIMAL(36,18))) AS avg,
        SUM(CAST(s.${field} AS DECIMAL(36,18))) AS \`sum\`,
        COUNT(*) AS count
      FROM opportunity_snapshots s
      JOIN opportunity_records o ON o.id = s.opportunity_id
      WHERE s.snapshot_at >= :since
        AND s.snapshot_at < :until
        AND s.${field} IS NOT NULL
      GROUP BY bucket_start, o.symbol, o.base_currency
      ON DUPLICATE KEY UPDATE
        high = GREATEST(analytics_buckets.high, VALUES(high)),
        low = LEAST(analytics_buckets.low, VALUES(low)),
        \`close\` = VALUES(\`close\`),
        avg = VALUES(avg),
        \`sum\` = VALUES(\`sum\`),
        count = VALUES(count),
        updated_at = NOW()
    `;

    const [results] = await AnalyticsBucket.sequelize!.query(sql, {
      replacements: {
        metricType,
        resolution,
        intervalSec: Math.floor(intervalMs / 1000),
        intervalMs,
        since: since.toISOString(),
        until: until.toISOString(),
      },
    });

    return (results as any).affectedRows ?? 0;
  }

  /**
   * Aggregate funding rates from the funding_rate_history table.
   */
  private async aggregateFundingRates(): Promise<number> {
    let created = 0;

    for (const resolution of ['1h', '1d'] as BucketResolution[]) {
      const intervalMs = RESOLUTION_MS[resolution];
      const now = Date.now();
      const lookbackMs = resolution === '1h' ? 48 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = new Date(now - lookbackMs);

      const sql = `
        INSERT INTO analytics_buckets (
          metric_type, resolution, bucket_start, bucket_end,
          symbol, exchange_slug, base_currency,
          \`open\`, high, low, \`close\`, avg, \`sum\`, count,
          max_funding_rate, min_funding_rate, avg_funding_rate,
          created_at, updated_at
        )
        SELECT
          'funding' AS metric_type,
          :resolution AS resolution,
          FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(f.recorded_at) / :intervalSec) * :intervalSec) AS bucket_start,
          FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(f.recorded_at) / :intervalSec) * :intervalSec + :intervalSec) AS bucket_end,
          f.symbol AS symbol,
          f.exchange_slug AS exchange_slug,
          f.base_currency AS base_currency,
          SUBSTRING_INDEX(GROUP_CONCAT(CAST(f.funding_rate AS CHAR) ORDER BY f.recorded_at ASC), ',', 1) AS \`open\`,
          MAX(f.funding_rate) AS high,
          MIN(f.funding_rate) AS low,
          SUBSTRING_INDEX(GROUP_CONCAT(CAST(f.funding_rate AS CHAR) ORDER BY f.recorded_at DESC), ',', 1) AS \`close\`,
          AVG(f.funding_rate) AS avg,
          SUM(f.funding_rate) AS \`sum\`,
          COUNT(*) AS count,
          MAX(f.funding_rate) AS max_funding_rate,
          MIN(f.funding_rate) AS min_funding_rate,
          AVG(f.funding_rate) AS avg_funding_rate
        FROM funding_rate_history f
        WHERE f.recorded_at >= :since
          AND f.recorded_at < :until
        GROUP BY bucket_start, f.symbol, f.exchange_slug, f.base_currency
        ON DUPLICATE KEY UPDATE
          high = GREATEST(analytics_buckets.high, VALUES(high)),
          low = LEAST(analytics_buckets.low, VALUES(low)),
          \`close\` = VALUES(\`close\`),
          avg = VALUES(avg),
          count = VALUES(count),
          max_funding_rate = VALUES(max_funding_rate),
          min_funding_rate = VALUES(min_funding_rate),
          avg_funding_rate = VALUES(avg_funding_rate),
          updated_at = NOW()
      `;

      const [results] = await AnalyticsBucket.sequelize!.query(sql, {
        replacements: {
          resolution,
          intervalSec: Math.floor(intervalMs / 1000),
          since: since.toISOString(),
          until: new Date(now).toISOString(),
        },
      });

      created += (results as any).affectedRows ?? 0;
    }

    return created;
  }

  /**
   * Aggregate opportunity frequency (count per time window).
   */
  private async aggregateFrequency(): Promise<number> {
    let created = 0;

    for (const resolution of ['1h', '1d'] as BucketResolution[]) {
      const intervalMs = RESOLUTION_MS[resolution];
      const now = Date.now();
      const lookbackMs = resolution === '1h' ? 48 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000;
      const since = new Date(now - lookbackMs);

      const sql = `
        INSERT INTO analytics_buckets (
          metric_type, resolution, bucket_start, bucket_end,
          symbol, exchange_slug, base_currency,
          \`open\`, high, low, \`close\`, avg, \`sum\`, count,
          created_at, updated_at
        )
        SELECT
          'frequency' AS metric_type,
          :resolution AS resolution,
          FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(o.calculated_at) / :intervalSec) * :intervalSec) AS bucket_start,
          FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP(o.calculated_at) / :intervalSec) * :intervalSec + :intervalSec) AS bucket_end,
          o.symbol AS symbol,
          NULL AS exchange_slug,
          o.base_currency AS base_currency,
          COUNT(*) AS \`open\`,
          COUNT(*) AS high,
          COUNT(*) AS low,
          COUNT(*) AS \`close\`,
          COUNT(*) AS avg,
          COUNT(*) AS \`sum\`,
          COUNT(*) AS count
        FROM opportunity_records o
        WHERE o.calculated_at >= :since
          AND o.calculated_at < :until
        GROUP BY bucket_start, o.symbol, o.base_currency
        ON DUPLICATE KEY UPDATE
          \`open\` = VALUES(\`open\`),
          high = VALUES(high),
          low = VALUES(low),
          \`close\` = VALUES(\`close\`),
          avg = VALUES(avg),
          count = VALUES(count),
          updated_at = NOW()
      `;

      const [results] = await AnalyticsBucket.sequelize!.query(sql, {
        replacements: {
          resolution,
          intervalSec: Math.floor(intervalMs / 1000),
          since: since.toISOString(),
          until: new Date(now).toISOString(),
        },
      });

      created += (results as any).affectedRows ?? 0;
    }

    return created;
  }

  /**
   * Store a single funding rate data point.
   */
  async recordFundingRate(data: {
    exchangeSlug: string;
    symbol: string;
    baseCurrency: string;
    quoteCurrency: string;
    fundingRate: number;
    fundingRateApr?: number;
    spotPrice?: number;
    perpPrice?: number;
  }): Promise<void> {
    const basis =
      data.spotPrice != null && data.perpPrice != null ? data.perpPrice - data.spotPrice : null;
    const basisPct =
      basis != null && data.spotPrice != null && data.spotPrice > 0 ? basis / data.spotPrice : null;

    await FundingRateHistory.create({
      exchange_slug: data.exchangeSlug,
      symbol: data.symbol,
      base_currency: data.baseCurrency,
      quote_currency: data.quoteCurrency,
      funding_rate: data.fundingRate,
      funding_rate_apr: data.fundingRateApr ?? null,
      spot_price: data.spotPrice ?? null,
      perp_price: data.perpPrice ?? null,
      basis,
      basis_pct: basisPct,
      recorded_at: new Date(),
    } as any);
  }

  /**
   * Prune old buckets beyond retention.
   */
  async pruneOld(maxAgeDays = 90): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000);
    const deleted = await AnalyticsBucket.destroy({
      where: { bucket_start: { [Op.lt]: cutoff } },
    });
    if (deleted > 0) {
      logger.info(`[AnalyticsAggregator] Pruned ${deleted} old buckets`);
    }
    return deleted;
  }
}

export const analyticsAggregatorService = new AnalyticsAggregatorService();
export { AnalyticsAggregatorService };
