import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface WatchlistAttributes extends BaseModelAttributes {
  user_id: number;
  name: string;
  description: string | null;
  is_default: boolean;
  sort_order: number;
  /** Number of items in the watchlist (denormalized for fast reads). */
  item_count: number;
}

export type WatchlistCreationAttributes = BaseModelCreationAttributes &
  Omit<WatchlistAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Watchlist extends BaseModel<WatchlistAttributes, WatchlistCreationAttributes> {
  public user_id!: number;
  public name!: string;
  public description!: string | null;
  public is_default!: boolean;
  public sort_order!: number;
  public item_count!: number;

  static initModel(sequelize: Sequelize) {
    return Watchlist.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          comment: 'Watchlist name',
        },
        description: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        is_default: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        item_count: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        sequelize,
        tableName: 'watchlists',
        modelName: 'Watchlist',
        indexes: [
          { unique: true, fields: ['user_id', 'name'] },
          { fields: ['user_id', 'sort_order'] },
        ],
      },
    );
  }
}
