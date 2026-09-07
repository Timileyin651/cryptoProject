import { DataTypes, Optional, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface SubscriptionPlanAttributes extends BaseModelAttributes {
  slug: string;
  name: string;
  description: string | null;
  price_monthly: number;
  price_yearly: number;
  currency: string;
  is_active: boolean;
  sort_order: number;
  // Usage limits (null = unlimited)
  max_scans_per_day: number | null;
  max_alerts: number | null;
  max_portfolios: number | null;
  max_exchanges_connected: number | null;
  rate_limit_per_minute: number | null;
  data_retention_days: number | null;
  // ── Scanner-specific limits ──────────────────────────────────────
  /** Max opportunities returned per query (null = unlimited). */
  max_opportunities_per_query: number | null;
  /** Max exchange pairs visible. */
  max_exchange_pairs: number | null;
  /** Max history days for analytics. */
  max_analytics_days: number | null;
  /** Max saved scanner preferences. */
  max_saved_preferences: number | null;
  /** Max watchlist items total. */
  max_watchlist_items: number | null;
  /** Max favorite coins. */
  max_favorite_coins: number | null;
  /** Max favorite exchanges. */
  max_favorite_exchanges: number | null;
  /** Max alert cooldown seconds (minimum allowed). */
  min_alert_cooldown_seconds: number | null;
  /** Whether detailed opportunity data is available. */
  detailed_opportunities: boolean;
  /** Whether real-time scanning is enabled. */
  realtime_scanning: boolean;
  /** Whether funding/perp view is enabled. */
  funding_view: boolean;
  /** Whether Telegram alert channel is enabled. */
  telegram_alerts: boolean;
  /** Whether API access is enabled (Enterprise). */
  api_access: boolean;
}

export type SubscriptionPlanCreationAttributes = BaseModelCreationAttributes &
  Omit<SubscriptionPlanAttributes, 'id' | 'created_at' | 'updated_at'>;

export class SubscriptionPlan extends BaseModel<
  SubscriptionPlanAttributes,
  SubscriptionPlanCreationAttributes
> {
  public slug!: string;
  public name!: string;
  public description!: string | null;
  public price_monthly!: number;
  public price_yearly!: number;
  public currency!: string;
  public is_active!: boolean;
  public sort_order!: number;
  public max_scans_per_day!: number | null;
  public max_alerts!: number | null;
  public max_portfolios!: number | null;
  public max_exchanges_connected!: number | null;
  public rate_limit_per_minute!: number | null;
  public data_retention_days!: number | null;
  public max_opportunities_per_query!: number | null;
  public max_exchange_pairs!: number | null;
  public max_analytics_days!: number | null;
  public max_saved_preferences!: number | null;
  public max_watchlist_items!: number | null;
  public max_favorite_coins!: number | null;
  public max_favorite_exchanges!: number | null;
  public min_alert_cooldown_seconds!: number | null;
  public detailed_opportunities!: boolean;
  public realtime_scanning!: boolean;
  public funding_view!: boolean;
  public telegram_alerts!: boolean;
  public api_access!: boolean;

  static initModel(sequelize: Sequelize) {
    return SubscriptionPlan.init(
      {
        ...BaseModel.baseColumns,
        slug: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        description: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        price_monthly: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        price_yearly: {
          type: DataTypes.DECIMAL(10, 2),
          allowNull: false,
          defaultValue: 0,
        },
        currency: {
          type: DataTypes.STRING(3),
          allowNull: false,
          defaultValue: 'NGN',
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        max_scans_per_day: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        max_alerts: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        max_portfolios: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        max_exchanges_connected: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        rate_limit_per_minute: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 60,
        },
        data_retention_days: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 30,
        },
        // ── Scanner-specific ──
        max_opportunities_per_query: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 25,
          comment: 'Max opportunities per query (null = unlimited)',
        },
        max_exchange_pairs: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 3,
          comment: 'Max exchange pairs visible',
        },
        max_analytics_days: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 7,
          comment: 'Max history days for analytics',
        },
        max_saved_preferences: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 3,
          comment: 'Max saved scanner preferences',
        },
        max_watchlist_items: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 10,
          comment: 'Max watchlist items total',
        },
        max_favorite_coins: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 5,
          comment: 'Max favorite coins',
        },
        max_favorite_exchanges: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 2,
          comment: 'Max favorite exchanges',
        },
        min_alert_cooldown_seconds: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 7200,
          comment: 'Minimum alert cooldown seconds',
        },
        detailed_opportunities: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether detailed opportunity data is available',
        },
        realtime_scanning: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether real-time scanning is enabled',
        },
        funding_view: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether funding/perp view is enabled',
        },
        telegram_alerts: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether Telegram alert channel is enabled',
        },
        api_access: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
          comment: 'Whether API access is enabled (Enterprise)',
        },
      },
      {
        sequelize,
        tableName: 'subscription_plans',
        modelName: 'SubscriptionPlan',
      },
    );
  }
}
