import { DataTypes } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export type MarketType = 'spot' | 'futures' | 'margin';
export type MarketStatus = 'active' | 'inactive' | 'halted' | 'delisted';

export interface ExchangeMarketAttributes extends BaseModelAttributes {
  trading_pair_id: number;
  exchange_id: number;
  market_type: MarketType;
  taker_fee: number;
  maker_fee: number;
  min_order_size: number | null;
  max_order_size: number | null;
  min_price_tick: number | null;
  min_qty_tick: number | null;
  status: MarketStatus;
  supports_orderbook: boolean;
  supports_ticker: boolean;
  supports_trades: boolean;
  metadata: Record<string, unknown> | null;
}

export type ExchangeMarketCreationAttributes = BaseModelCreationAttributes &
  Omit<ExchangeMarketAttributes, 'id' | 'created_at' | 'updated_at'>;

export class ExchangeMarket extends BaseModel<
  ExchangeMarketAttributes,
  ExchangeMarketCreationAttributes
> {
  public trading_pair_id!: number;
  public exchange_id!: number;
  public market_type!: MarketType;
  public taker_fee!: number;
  public maker_fee!: number;
  public min_order_size!: number | null;
  public max_order_size!: number | null;
  public min_price_tick!: number | null;
  public min_qty_tick!: number | null;
  public status!: MarketStatus;
  public supports_orderbook!: boolean;
  public supports_ticker!: boolean;
  public supports_trades!: boolean;
  public metadata!: Record<string, unknown> | null;

  static initModel() {
    return ExchangeMarket.init(
      {
        ...BaseModel.baseColumns,
        trading_pair_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'trading_pairs', key: 'id' },
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
        market_type: {
          type: DataTypes.ENUM('spot', 'futures', 'margin'),
          allowNull: false,
          defaultValue: 'spot',
        },
        taker_fee: {
          type: DataTypes.DECIMAL(10, 6),
          allowNull: false,
          defaultValue: 0.001,
        },
        maker_fee: {
          type: DataTypes.DECIMAL(10, 6),
          allowNull: false,
          defaultValue: 0.001,
        },
        min_order_size: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        max_order_size: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        min_price_tick: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        min_qty_tick: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        status: {
          type: DataTypes.ENUM('active', 'inactive', 'halted', 'delisted'),
          allowNull: false,
          defaultValue: 'active',
        },
        supports_orderbook: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        supports_ticker: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        supports_trades: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize: ExchangeMarket.sequelize,
        tableName: 'exchange_markets',
        modelName: 'ExchangeMarket',
        indexes: [
          {
            unique: true,
            fields: ['trading_pair_id', 'exchange_id'],
          },
        ],
      },
    );
  }
}
