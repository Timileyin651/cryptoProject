import { Op, fn, col } from 'sequelize';
import { AnalyticsBucket, BucketResolution } from '../models/AnalyticsBucket';
import { FundingRateHistory } from '../models/FundingRateHistory';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { logger } from '../utils/logger';

// ──────────────────── Range presets ─────────────────────────────────────

export type ChartRange = '1h' | '6h' | '24h' | '7d' | '30d' | 'custom';

const RANGE_MS: Record<Exclude<ChartRange, 'custom'>, number> = {
  '1h': 1 * 60 * 60 * 1000,
  '6h': 6 * 60 * 60 * 1000,
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
};

function resolveRange(
  range: ChartRange,
  customMs?: number,
): { since: Date; resolution: BucketResolution } {
  const now = Date.now();
  let ms: number;

  if (range === 'custom' && customMs && customMs > 0) {
    ms = Math.min(customMs, 90 * 24 * 60 * 60 * 1000); // max 90 days
  } else {
    ms = RANGE_MS[range as keyof typeof RANGE_MS] ?? RANGE_MS['24h'];
  }

  if (ms <= 6 * 60 * 60 * 1000) return { since: new Date(now - ms), resolution: '1m' };
  if (ms <= 48 * 60 * 60 * 1000) return { since: new Date(now - ms), resolution: '5m' };
  if (ms <= 14 * 24 * 60 * 60 * 1000) return { since: new Date(now - ms), resolution: '1h' };
  return { since: new Date(now - ms), resolution: '1d' };
}

// ──────────────────── Chart data shapes ─────────────────────────────────

export interface ChartDataPoint {
  timestamp: number;
  value: number;
}

export interface OHLCDataPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface SpreadHistoryResult {
  /** OHLC spread data for the chart. */
  chart: OHLCDataPoint[];
  /** Summary stats. */
  stats: {
    currentSpread: number;
    avgSpread: number;
    maxSpread: number;
    minSpread: number;
    dataPoints: number;
    since: Date;
  };
}

export interface ProfitHistoryResult {
  chart: OHLCDataPoint[];
  stats: {
    currentProfit: number;
    avgProfit: number;
    totalProfit: number;
    dataPoints: number;
  };
}

export interface PriceHistoryResult {
  chart: OHLCDataPoint[];
  stats: {
    currentPrice: number;
    avgPrice: number;
    highPrice: number;
    lowPrice: number;
  };
}

export interface FundingRateHistoryResult {
  chart: OHLCDataPoint[];
  stats: {
    currentRate: number;
    avgRate: number;
    maxRate: number;
    minRate: number;
    apr: number;
  };
}

export interface FrequencyResult {
  chart: ChartDataPoint[];
  stats: {
    totalOpportunities: number;
    avgPerHour: number;
  };
}

// ──────────────────── AnalyticsQueryService ─────────────────────────────

class AnalyticsQueryService {
  /**
   * Get spread history for a symbol over a time range.
   */
  async getSpreadHistory(
    range: ChartRange,
    symbol?: string,
    customMs?: number,
  ): Promise<SpreadHistoryResult> {
    const { since, resolution } = resolveRange(range, customMs);

    const where: any = {
      metric_type: 'spread',
      resolution,
      bucket_start: { [Op.gte]: since },
    };
    if (symbol) where.symbol = symbol;

    const buckets = await AnalyticsBucket.findAll({
      where,
      order: [['bucket_start', 'ASC']],
      attributes: ['bucket_start', 'open', 'high', 'low', 'close', 'avg', 'count'],
      raw: true,
    });

    const chart: OHLCDataPoint[] = buckets.map((b: any) => ({
      timestamp: new Date(b.bucket_start).getTime(),
      open: parseFloat(b.open),
      high: parseFloat(b.high),
      low: parseFloat(b.low),
      close: parseFloat(b.close),
    }));

    const values = chart.map((c) => c.close);
    const currentSpread = values.length > 0 ? values[values.length - 1] : 0;
    const avgSpread = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const maxSpread = values.length > 0 ? Math.max(...values) : 0;
    const minSpread = values.length > 0 ? Math.min(...values) : 0;

    return {
      chart,
      stats: {
        currentSpread,
        avgSpread,
        maxSpread,
        minSpread,
        dataPoints: chart.length,
        since,
      },
    };
  }

  /**
   * Get net profit history.
   */
  async getProfitHistory(
    range: ChartRange,
    symbol?: string,
    customMs?: number,
  ): Promise<ProfitHistoryResult> {
    const { since, resolution } = resolveRange(range, customMs);

    const where: any = {
      metric_type: 'profit',
      resolution,
      bucket_start: { [Op.gte]: since },
    };
    if (symbol) where.symbol = symbol;

    const buckets = await AnalyticsBucket.findAll({
      where,
      order: [['bucket_start', 'ASC']],
      attributes: ['bucket_start', 'open', 'high', 'low', 'close', 'avg', 'sum'],
      raw: true,
    });

    const chart: OHLCDataPoint[] = buckets.map((b: any) => ({
      timestamp: new Date(b.bucket_start).getTime(),
      open: parseFloat(b.open),
      high: parseFloat(b.high),
      low: parseFloat(b.low),
      close: parseFloat(b.close),
    }));

    const values = chart.map((c) => c.close);
    const currentProfit = values.length > 0 ? values[values.length - 1] : 0;
    const avgProfit = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const totalProfit = buckets.reduce((sum: number, b: any) => sum + parseFloat(b.sum || '0'), 0);

    return {
      chart,
      stats: {
        currentProfit,
        avgProfit,
        totalProfit,
        dataPoints: chart.length,
      },
    };
  }

  /**
   * Get price history (buy price over time).
   */
  async getPriceHistory(
    range: ChartRange,
    symbol?: string,
    customMs?: number,
  ): Promise<PriceHistoryResult> {
    const { since, resolution } = resolveRange(range, customMs);

    const where: any = {
      metric_type: 'price',
      resolution,
      bucket_start: { [Op.gte]: since },
    };
    if (symbol) where.symbol = symbol;

    const buckets = await AnalyticsBucket.findAll({
      where,
      order: [['bucket_start', 'ASC']],
      attributes: ['bucket_start', 'open', 'high', 'low', 'close'],
      raw: true,
    });

    const chart: OHLCDataPoint[] = buckets.map((b: any) => ({
      timestamp: new Date(b.bucket_start).getTime(),
      open: parseFloat(b.open),
      high: parseFloat(b.high),
      low: parseFloat(b.low),
      close: parseFloat(b.close),
    }));

    const values = chart.map((c) => c.close);
    const currentPrice = values.length > 0 ? values[values.length - 1] : 0;
    const avgPrice = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const highPrice = values.length > 0 ? Math.max(...values) : 0;
    const lowPrice = values.length > 0 ? Math.min(...values) : 0;

    return {
      chart,
      stats: { currentPrice, avgPrice, highPrice, lowPrice },
    };
  }

  /**
   * Get funding rate history for a specific exchange/symbol.
   */
  async getFundingRateHistory(
    range: ChartRange,
    exchangeSlug?: string,
    symbol?: string,
    customMs?: number,
  ): Promise<FundingRateHistoryResult> {
    const { since, resolution } = resolveRange(range, customMs);

    const where: any = {
      metric_type: 'funding',
      resolution,
      bucket_start: { [Op.gte]: since },
    };
    if (symbol) where.symbol = symbol;
    if (exchangeSlug) where.exchange_slug = exchangeSlug;

    const buckets = await AnalyticsBucket.findAll({
      where,
      order: [['bucket_start', 'ASC']],
      attributes: ['bucket_start', 'open', 'high', 'low', 'close', 'avg_funding_rate'],
      raw: true,
    });

    const chart: OHLCDataPoint[] = buckets.map((b: any) => ({
      timestamp: new Date(b.bucket_start).getTime(),
      open: parseFloat(b.open),
      high: parseFloat(b.high),
      low: parseFloat(b.low),
      close: parseFloat(b.close),
    }));

    const values = chart.map((c) => c.close);
    const currentRate = values.length > 0 ? values[values.length - 1] : 0;
    const avgRate = values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
    const maxRate = values.length > 0 ? Math.max(...values) : 0;
    const minRate = values.length > 0 ? Math.min(...values) : 0;
    const intervalsPerYear = (365.25 * 24 * 60 * 60 * 1000) / (8 * 60 * 60 * 1000);
    const apr = avgRate * intervalsPerYear;

    return {
      chart,
      stats: { currentRate, avgRate, maxRate, minRate, apr },
    };
  }

  /**
   * Get opportunity frequency over time.
   */
  async getFrequencyHistory(
    range: ChartRange,
    symbol?: string,
    customMs?: number,
  ): Promise<FrequencyResult> {
    const { since, resolution } = resolveRange(range, customMs);

    const where: any = {
      metric_type: 'frequency',
      resolution,
      bucket_start: { [Op.gte]: since },
    };
    if (symbol) where.symbol = symbol;

    const buckets = await AnalyticsBucket.findAll({
      where,
      order: [['bucket_start', 'ASC']],
      attributes: ['bucket_start', 'count'],
      raw: true,
    });

    const chart: ChartDataPoint[] = buckets.map((b: any) => ({
      timestamp: new Date(b.bucket_start).getTime(),
      value: parseInt(b.count, 10),
    }));

    const totalOpportunities = chart.reduce((sum, c) => sum + c.value, 0);
    const hoursElapsed =
      chart.length > 0
        ? (chart[chart.length - 1].timestamp - chart[0].timestamp) / (60 * 60 * 1000)
        : 1;
    const avgPerHour = hoursElapsed > 0 ? totalOpportunities / hoursElapsed : 0;

    return {
      chart,
      stats: { totalOpportunities, avgPerHour },
    };
  }

  /**
   * Get a comprehensive summary of all analytics for a symbol.
   */
  async getOverview(range: ChartRange, symbol?: string, customMs?: number) {
    const [spread, profit, price, frequency] = await Promise.all([
      this.getSpreadHistory(range, symbol, customMs),
      this.getProfitHistory(range, symbol, customMs),
      this.getPriceHistory(range, symbol, customMs),
      this.getFrequencyHistory(range, symbol, customMs),
    ]);

    // Time since last update
    let lastUpdate: Date | null = null;
    const latestBucket = await AnalyticsBucket.findOne({
      where: symbol ? { symbol } : {},
      order: [['bucket_end', 'DESC']],
      attributes: ['bucket_end'],
      raw: true,
    });
    if (latestBucket) {
      lastUpdate = new Date((latestBucket as any).bucket_end);
    }

    return {
      spread,
      profit,
      price,
      frequency,
      lastUpdate,
      range,
      symbol: symbol ?? 'all',
    };
  }
}

export const analyticsQueryService = new AnalyticsQueryService();
export { AnalyticsQueryService };
