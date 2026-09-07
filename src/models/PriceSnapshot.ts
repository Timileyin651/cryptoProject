import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface PriceSnapshotAttributes extends BaseModelAttributes {
  trading_pair_id: number;
  bid_price: string;
  ask_price: string;
  volume_24h: string;
  fetched_at: Date;
}

export type PriceSnapshotCreationAttributes = BaseModelCreationAttributes &
  Omit<PriceSnapshotAttributes, 'id' | 'created_at' | 'updated_at'>;

export class PriceSnapshot extends BaseModel<
  PriceSnapshotAttributes,
  PriceSnapshotCreationAttributes
> {
  public trading_pair_id!: number;
  public bid_price!: string;
  public ask_price!: string;
  public volume_24h!: string;
  public fetched_at!: Date;

  static initModel(sequelize: Sequelize) {
    return PriceSnapshot.init(
      {
        ...BaseModel.baseColumns,
        trading_pair_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'trading_pairs',
            key: 'id',
          },
        },
        bid_price: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
        },
        ask_price: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
        },
        volume_24h: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: 0,
        },
        fetched_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
      },
      {
        sequelize,
        tableName: 'price_snapshots',
        modelName: 'PriceSnapshot',
      },
    );
  }
}
