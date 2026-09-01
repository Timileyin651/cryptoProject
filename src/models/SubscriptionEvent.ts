import { DataTypes, Optional } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface SubscriptionEventAttributes extends BaseModelAttributes {
  user_id: number;
  subscription_id: number | null;
  event_type: string;
  payload: Record<string, unknown> | null;
}

export type SubscriptionEventCreationAttributes = BaseModelCreationAttributes &
  Omit<SubscriptionEventAttributes, 'id' | 'created_at' | 'updated_at'>;

export class SubscriptionEvent extends BaseModel<
  SubscriptionEventAttributes,
  SubscriptionEventCreationAttributes
> {
  public user_id!: number;
  public subscription_id!: number | null;
  public event_type!: string;
  public payload!: Record<string, unknown> | null;

  static initModel() {
    return SubscriptionEvent.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        subscription_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'subscriptions', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        event_type: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        payload: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize: SubscriptionEvent.sequelize,
        tableName: 'subscription_events',
        modelName: 'SubscriptionEvent',
      },
    );
  }
}
