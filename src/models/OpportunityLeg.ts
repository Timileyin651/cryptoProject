import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface OpportunityLegAttributes extends BaseModelAttributes {
  /** FK to the parent opportunity record. */
  opportunity_id: number;
  /** Which leg this is: "buy" or "sell". */
  leg_side: 'buy' | 'sell';
  /** Exchange slug for this leg. */
  exchange_slug: string;
  /** Exchange ID for this leg. */
  exchange_id: number;
  /** Symbol traded on this exchange. */
  symbol: string;
  /** Execution price for this leg. */
  price: string;
  /** Quantity in base currency. */
  quantity: string;
  /** Notional value (price × quantity). */
  notional: string;
  /** Trading fee for this leg. */
  fee: string;
  /** Fee rate (fraction). */
  fee_rate: string;
  /** VWAP if multiple book levels consumed. */
  vwap: string;
  /** Slippage for this leg (fraction). */
  slippage: string;
  /** Available depth on this side. */
  depth: string;
  /** Fill ratio for this leg. */
  fill_ratio: string;
}

export type OpportunityLegCreationAttributes = BaseModelCreationAttributes &
  Omit<OpportunityLegAttributes, 'id' | 'created_at' | 'updated_at'>;

export class OpportunityLeg extends BaseModel<
  OpportunityLegAttributes,
  OpportunityLegCreationAttributes
> {
  public opportunity_id!: number;
  public leg_side!: 'buy' | 'sell';
  public exchange_slug!: string;
  public exchange_id!: number;
  public symbol!: string;
  public price!: string;
  public quantity!: string;
  public notional!: string;
  public fee!: string;
  public fee_rate!: string;
  public vwap!: string;
  public slippage!: string;
  public depth!: string;
  public fill_ratio!: string;

  static initModel(sequelize: Sequelize) {
    return OpportunityLeg.init(
      {
        ...BaseModel.baseColumns,
        opportunity_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'opportunity_records', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        leg_side: {
          type: DataTypes.ENUM('buy', 'sell'),
          allowNull: false,
        },
        exchange_slug: { type: DataTypes.STRING(50), allowNull: false },
        exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'exchanges', key: 'id' },
        },
        symbol: { type: DataTypes.STRING(30), allowNull: false },
        price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        quantity: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        notional: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        fee: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        fee_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        vwap: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        slippage: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        depth: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        fill_ratio: { type: DataTypes.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },
      },
      {
        sequelize,
        tableName: 'opportunity_legs',
        modelName: 'OpportunityLeg',
        indexes: [{ fields: ['opportunity_id'] }, { fields: ['opportunity_id', 'leg_side'] }],
      },
    );
  }
}
