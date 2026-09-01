import { DataTypes } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface TradingPairAttributes extends BaseModelAttributes {
  exchange_id: number;
  symbol: string;
  base_currency: string;
  quote_currency: string;
  is_active: boolean;
}

export type TradingPairCreationAttributes = BaseModelCreationAttributes &
  Omit<TradingPairAttributes, 'id' | 'created_at' | 'updated_at'>;

export class TradingPair extends BaseModel<TradingPairAttributes, TradingPairCreationAttributes> {
  public exchange_id!: number;
  public symbol!: string;
  public base_currency!: string;
  public quote_currency!: string;
  public is_active!: boolean;

  static initModel() {
    return TradingPair.init(
      {
        ...BaseModel.baseColumns,
        exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'exchanges',
            key: 'id',
          },
        },
        symbol: {
          type: DataTypes.STRING(20),
          allowNull: false,
        },
        base_currency: {
          type: DataTypes.STRING(10),
          allowNull: false,
        },
        quote_currency: {
          type: DataTypes.STRING(10),
          allowNull: false,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize: TradingPair.sequelize,
        tableName: 'trading_pairs',
        modelName: 'TradingPair',
      },
    );
  }
}
