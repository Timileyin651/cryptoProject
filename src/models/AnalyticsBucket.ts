import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

/**
 * Time resolution for buckets.
 * - 1m:  1-minute candles (raw data, high frequency)
 * - 5m:  5-minute candles
 * - 1h:  1-hour candles
 * - 1d:  1-day candles
 */
export type BucketResolution = '1m' | '5m' | '1h' | '1d';

export interface AnalyticsBucketAttributes extends BaseModelAttributes {
  /** What this bucket represents: "spread", "profit", "price", "funding", "frequency". */
  metric_type: string;
  /** Resolution of this bucket. */
  resolution: BucketResolution;
  /** Start of the time window (inclusive). */
  bucket_start: Date;
  /** End of the time window (exclusive). */
  bucket_end: Date;

  // ── Filter context ──────────────────────────────────────────────
  /** Symbol this bucket is for (e.g. "BTC/USDT"). Null = global. */
  symbol: string | null;
  /** Exchange slug. Null = cross-exchange or global. */
  exchange_slug: string | null;
  /** Base currency filter. Null = all. */
  base_currency: string | null;

  // ── OHLC values ─────────────────────────────────────────────────
  /** Opening value. */
  open: string;
  /** Highest value in the bucket. */
  high: string;
  /** Lowest value in the bucket. */
  low: string;
  /** Closing value. */
  close: string;

  // ── Aggregated values ───────────────────────────────────────────
  /** Average value across the bucket. */
  avg: string;
  /** Total sum (for volume, frequency, etc.). */
  sum: string;
  /** Number of data points aggregated. */
  count: number;

  // ── Funding-specific (null for non-funding buckets) ─────────────
  /** Max funding rate in this bucket. */
  max_funding_rate: string | null;
  /** Min funding rate in this bucket. */
  min_funding_rate: string | null;
  /** Average funding rate in this bucket. */
  avg_funding_rate: string | null;
}

export type AnalyticsBucketCreationAttributes = BaseModelCreationAttributes &
  Omit<AnalyticsBucketAttributes, 'id' | 'created_at' | 'updated_at'>;

export class AnalyticsBucket extends BaseModel<
  AnalyticsBucketAttributes,
  AnalyticsBucketCreationAttributes
> {
  public metric_type!: string;
  public resolution!: BucketResolution;
  public bucket_start!: Date;
  public bucket_end!: Date;
  public symbol!: string | null;
  public exchange_slug!: string | null;
  public base_currency!: string | null;
  public open!: string;
  public high!: string;
  public low!: string;
  public close!: string;
  public avg!: string;
  public sum!: string;
  public count!: number;
  public max_funding_rate!: string | null;
  public min_funding_rate!: string | null;
  public avg_funding_rate!: string | null;

  static initModel(sequelize: Sequelize) {
    return AnalyticsBucket.init(
      {
        ...BaseModel.baseColumns,
        metric_type: { type: DataTypes.STRING(30), allowNull: false },
        resolution: { type: DataTypes.ENUM('1m', '5m', '1h', '1d'), allowNull: false },
        bucket_start: { type: DataTypes.DATE, allowNull: false },
        bucket_end: { type: DataTypes.DATE, allowNull: false },
        symbol: { type: DataTypes.STRING(20), allowNull: true },
        exchange_slug: { type: DataTypes.STRING(50), allowNull: true },
        base_currency: { type: DataTypes.STRING(10), allowNull: true },
        open: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        high: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        low: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        close: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        avg: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        sum: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        max_funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        min_funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        avg_funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
      },
      {
        sequelize,
        tableName: 'analytics_buckets',
        modelName: 'AnalyticsBucket',
        indexes: [
          { name: 'idx_ab_metric_res_start', fields: ['metric_type', 'resolution', 'bucket_start'] },
          { name: 'idx_ab_metric_res_sym_start', fields: ['metric_type', 'resolution', 'symbol', 'bucket_start'] },
          { name: 'idx_ab_metric_res_exch_start', fields: ['metric_type', 'resolution', 'exchange_slug', 'bucket_start'] },
          { name: 'idx_ab_symbol_start', fields: ['symbol', 'bucket_start'] },
          { name: 'idx_ab_bucket_start', fields: ['bucket_start'] },
          { name: 'idx_ab_bucket_end', fields: ['bucket_end'] },
          // Composite unique constraint: one bucket per metric+resolution+context+window
          {
            name: 'idx_ab_unique_bucket',
            unique: true,
            fields: [
              'metric_type',
              'resolution',
              'symbol',
              'exchange_slug',
              'base_currency',
              'bucket_start',
            ],
          },
        ],
      },
    );
  }
}
