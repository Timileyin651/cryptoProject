import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface FundingRateHistoryAttributes extends BaseModelAttributes {
  /** Exchange slug (e.g. "binance"). */
  exchange_slug: string;
  /** Perp symbol (e.g. "BTC/USDT:USDT"). */
  symbol: string;
  /** Base currency. */
  base_currency: string;
  /** Quote currency. */
  quote_currency: string;
  /** Funding rate as a fraction (e.g. 0.0001 = 0.01%). */
  funding_rate: number;
  /** Funding rate APR. */
  funding_rate_apr: number | null;
  /** Spot price at this point. */
  spot_price: number | null;
  /** Perp price at this point. */
  perp_price: number | null;
  /** Basis (perp - spot). */
  basis: number | null;
  /** Basis as fraction of spot. */
  basis_pct: number | null;
  /** When this rate was recorded. */
  recorded_at: Date;
}

export type FundingRateHistoryCreationAttributes = BaseModelCreationAttributes &
  Omit<FundingRateHistoryAttributes, 'id' | 'created_at' | 'updated_at'>;

export class FundingRateHistory extends BaseModel<
  FundingRateHistoryAttributes,
  FundingRateHistoryCreationAttributes
> {
  public exchange_slug!: string;
  public symbol!: string;
  public base_currency!: string;
  public quote_currency!: string;
  public funding_rate!: number;
  public funding_rate_apr!: number | null;
  public spot_price!: number | null;
  public perp_price!: number | null;
  public basis!: number | null;
  public basis_pct!: number | null;
  public recorded_at!: Date;

  static initModel(sequelize: Sequelize) {
    return FundingRateHistory.init(
      {
        ...BaseModel.baseColumns,
        exchange_slug: { type: DataTypes.STRING(50), allowNull: false },
        symbol: { type: DataTypes.STRING(30), allowNull: false },
        base_currency: { type: DataTypes.STRING(10), allowNull: false },
        quote_currency: { type: DataTypes.STRING(10), allowNull: false },
        funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: false },
        funding_rate_apr: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
        spot_price: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        perp_price: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        basis: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        basis_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        recorded_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        tableName: 'funding_rate_history',
        modelName: 'FundingRateHistory',
        indexes: [
          { name: 'idx_frhist_exch_base_time', fields: ['exchange_slug', 'base_currency', 'recorded_at'] },
          { name: 'idx_frhist_symbol_time', fields: ['symbol', 'recorded_at'] },
          { name: 'idx_frhist_recorded_at', fields: ['recorded_at'] },
          { name: 'idx_frhist_base_time', fields: ['base_currency', 'recorded_at'] },
          // Prevent duplicate entries for the same exchange/symbol/timestamp
          {
            name: 'idx_frhist_exch_symbol_time',
            unique: true,
            fields: ['exchange_slug', 'symbol', 'recorded_at'],
          },
        ],
      },
    );
  }
}
