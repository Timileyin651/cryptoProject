import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface ArbitrageOpportunityAttributes extends BaseModelAttributes {
  buy_exchange_id: number;
  sell_exchange_id: number;
  symbol: string;
  buy_price: string;
  sell_price: string;
  spread_pct: string;
  detected_at: Date;
  status: 'detected' | 'executed' | 'expired';
}

export type ArbitrageOpportunityCreationAttributes = BaseModelCreationAttributes &
  Omit<ArbitrageOpportunityAttributes, 'id' | 'created_at' | 'updated_at'>;

export class ArbitrageOpportunity extends BaseModel<
  ArbitrageOpportunityAttributes,
  ArbitrageOpportunityCreationAttributes
> {
  public buy_exchange_id!: number;
  public sell_exchange_id!: number;
  public symbol!: string;
  public buy_price!: string;
  public sell_price!: string;
  public spread_pct!: string;
  public detected_at!: Date;
  public status!: 'detected' | 'executed' | 'expired';

  static initModel(sequelize: Sequelize) {
    return ArbitrageOpportunity.init(
      {
        ...BaseModel.baseColumns,
        buy_exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'exchanges',
            key: 'id',
          },
        },
        sell_exchange_id: {
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
        buy_price: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
        },
        sell_price: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
        },
        spread_pct: {
          type: DataTypes.DECIMAL(10, 6),
          allowNull: false,
        },
        detected_at: {
          type: DataTypes.DATE,
          allowNull: false,
          defaultValue: DataTypes.NOW,
        },
        status: {
          type: DataTypes.ENUM('detected', 'executed', 'expired'),
          allowNull: false,
          defaultValue: 'detected',
        },
      },
      {
        sequelize,
        tableName: 'arbitrage_opportunities',
        modelName: 'ArbitrageOpportunity',
      },
    );
  }
}
