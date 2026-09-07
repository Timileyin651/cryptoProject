import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface CoinAttributes extends BaseModelAttributes {
  symbol: string;
  name: string;
  slug: string;
  decimals: number;
  logo_url: string | null;
  coingecko_id: string | null;
  is_active: boolean;
  metadata: Record<string, unknown> | null;
}

export type CoinCreationAttributes = BaseModelCreationAttributes &
  Omit<CoinAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Coin extends BaseModel<CoinAttributes, CoinCreationAttributes> {
  public symbol!: string;
  public name!: string;
  public slug!: string;
  public decimals!: number;
  public logo_url!: string | null;
  public coingecko_id!: string | null;
  public is_active!: boolean;
  public metadata!: Record<string, unknown> | null;

  static initModel(sequelize: Sequelize) {
    return Coin.init(
      {
        ...BaseModel.baseColumns,
        symbol: {
          type: DataTypes.STRING(10),
          allowNull: false,
          unique: true,
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        slug: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
        },
        decimals: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 18,
        },
        logo_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        coingecko_id: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'coins',
        modelName: 'Coin',
      },
    );
  }
}
