import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface FavoriteCoinAttributes extends BaseModelAttributes {
  user_id: number;
  coin_symbol: string;
  coin_name: string | null;
  notes: string | null;
  sort_order: number;
}

export type FavoriteCoinCreationAttributes = BaseModelCreationAttributes &
  Omit<FavoriteCoinAttributes, 'id' | 'created_at' | 'updated_at'>;

export class FavoriteCoin extends BaseModel<
  FavoriteCoinAttributes,
  FavoriteCoinCreationAttributes
> {
  public user_id!: number;
  public coin_symbol!: string;
  public coin_name!: string | null;
  public notes!: string | null;
  public sort_order!: number;

  static initModel(sequelize: Sequelize) {
    return FavoriteCoin.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        coin_symbol: {
          type: DataTypes.STRING(20),
          allowNull: false,
          comment: 'Coin symbol, e.g. BTC, ETH',
        },
        coin_name: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: 'Human-readable coin name',
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: 'User notes about this coin',
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        sequelize,
        tableName: 'favorite_coins',
        modelName: 'FavoriteCoin',
        indexes: [
          { unique: true, fields: ['user_id', 'coin_symbol'] },
          { fields: ['user_id', 'sort_order'] },
        ],
      },
    );
  }
}
