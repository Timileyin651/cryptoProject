import { DataTypes, Optional } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export type SubscriptionStatus = 'active' | 'inactive' | 'cancelled' | 'expired' | 'past_due';
export type BillingCycle = 'monthly' | 'yearly';

export interface SubscriptionAttributes extends BaseModelAttributes {
  user_id: number;
  plan_id: number;
  status: SubscriptionStatus;
  billing_cycle: BillingCycle;
  started_at: Date;
  current_period_start: Date;
  current_period_end: Date | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  renewal_ready: boolean;
  gateway_subscription_id: string | null;
}

export type SubscriptionCreationAttributes = BaseModelCreationAttributes &
  Omit<SubscriptionAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Subscription extends BaseModel<
  SubscriptionAttributes,
  SubscriptionCreationAttributes
> {
  public user_id!: number;
  public plan_id!: number;
  public status!: SubscriptionStatus;
  public billing_cycle!: BillingCycle;
  public started_at!: Date;
  public current_period_start!: Date;
  public current_period_end!: Date | null;
  public cancelled_at!: Date | null;
  public cancel_reason!: string | null;
  public renewal_ready!: boolean;
  public gateway_subscription_id!: string | null;

  static initModel() {
    return Subscription.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        plan_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'subscription_plans', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        status: {
          type: DataTypes.ENUM('active', 'inactive', 'cancelled', 'expired', 'past_due'),
          allowNull: false,
          defaultValue: 'active',
        },
        billing_cycle: {
          type: DataTypes.ENUM('monthly', 'yearly'),
          allowNull: false,
          defaultValue: 'monthly',
        },
        started_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        current_period_start: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        current_period_end: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        cancelled_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        cancel_reason: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        renewal_ready: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        gateway_subscription_id: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
      },
      {
        sequelize: Subscription.sequelize,
        tableName: 'subscriptions',
        modelName: 'Subscription',
      },
    );
  }
}
