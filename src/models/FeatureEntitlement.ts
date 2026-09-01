import { DataTypes, Optional } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface FeatureEntitlementAttributes extends BaseModelAttributes {
  plan_id: number;
  feature_key: string;
  is_enabled: boolean;
  limit_value: number | null;
}

export type FeatureEntitlementCreationAttributes = BaseModelCreationAttributes &
  Omit<FeatureEntitlementAttributes, 'id' | 'created_at' | 'updated_at'>;

export class FeatureEntitlement extends BaseModel<
  FeatureEntitlementAttributes,
  FeatureEntitlementCreationAttributes
> {
  public plan_id!: number;
  public feature_key!: string;
  public is_enabled!: boolean;
  public limit_value!: number | null;

  static initModel() {
    return FeatureEntitlement.init(
      {
        ...BaseModel.baseColumns,
        plan_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'subscription_plans', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        feature_key: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        is_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        limit_value: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
      },
      {
        sequelize: FeatureEntitlement.sequelize,
        tableName: 'feature_entitlements',
        modelName: 'FeatureEntitlement',
        indexes: [
          {
            unique: true,
            fields: ['plan_id', 'feature_key'],
          },
        ],
      },
    );
  }
}
