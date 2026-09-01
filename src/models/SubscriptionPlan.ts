import { DataTypes, Optional } from 'sequelize';
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

  static initModel() {
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
      },
      {
        sequelize: SubscriptionPlan.sequelize,
        tableName: 'subscription_plans',
        modelName: 'SubscriptionPlan',
      },
    );
  }
}
