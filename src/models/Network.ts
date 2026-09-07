import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface NetworkAttributes extends BaseModelAttributes {
  name: string;
  slug: string;
  chain_id: number | null;
  native_currency_id: number | null;
  explorer_url: string | null;
  rpc_url: string | null;
  is_active: boolean;
  avg_block_time_seconds: number | null;
  metadata: Record<string, unknown> | null;
}

export type NetworkCreationAttributes = BaseModelCreationAttributes &
  Omit<NetworkAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Network extends BaseModel<NetworkAttributes, NetworkCreationAttributes> {
  public name!: string;
  public slug!: string;
  public chain_id!: number | null;
  public native_currency_id!: number | null;
  public explorer_url!: string | null;
  public rpc_url!: string | null;
  public is_active!: boolean;
  public avg_block_time_seconds!: number | null;
  public metadata!: Record<string, unknown> | null;

  static initModel(sequelize: Sequelize) {
    return Network.init(
      {
        ...BaseModel.baseColumns,
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        slug: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        chain_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        native_currency_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'coins', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        explorer_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        rpc_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        avg_block_time_seconds: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'networks',
        modelName: 'Network',
      },
    );
  }
}
