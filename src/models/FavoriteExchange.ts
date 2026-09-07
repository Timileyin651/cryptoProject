import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface FavoriteExchangeAttributes extends BaseModelAttributes {
  user_id: number;
  exchange_id: number;
  notes: string | null;
  sort_order: number;
}

export type FavoriteExchangeCreationAttributes = BaseModelCreationAttributes &
  Omit<FavoriteExchangeAttributes, 'id' | 'created_at' | 'updated_at'>;

export class FavoriteExchange extends BaseModel<
  FavoriteExchangeAttributes,
  FavoriteExchangeCreationAttributes
> {
  public user_id!: number;
  public exchange_id!: number;
  public notes!: string | null;
  public sort_order!: number;

  static initModel(sequelize: Sequelize) {
    return FavoriteExchange.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'exchanges', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: 'User notes about this exchange',
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        sequelize,
        tableName: 'favorite_exchanges',
        modelName: 'FavoriteExchange',
        indexes: [
          { unique: true, fields: ['user_id', 'exchange_id'] },
          { fields: ['user_id', 'sort_order'] },
        ],
      },
    );
  }
}
