import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface OpportunitySnapshotAttributes extends BaseModelAttributes {
  /** FK to the parent opportunity record. */
  opportunity_id: number;
  /** Status at this snapshot. */
  status: string;
  /** Buy price at this point. */
  buy_price: string;
  /** Sell price at this point. */
  sell_price: string;
  /** Gross spread at this point. */
  gross_spread: string;
  /** Gross spread pct at this point. */
  gross_spread_pct: string;
  /** Net profit at this point. */
  net_profit: string;
  /** ROI at this point. */
  roi: string;
  /** Total cost at this point. */
  total_cost: string;
  /** Buy depth at this point. */
  buy_depth: string;
  /** Sell depth at this point. */
  sell_depth: string;
  /** Funding rate at this point (funding only). */
  current_funding_rate: string | null;
  /** Basis at this point (funding only). */
  basis: string | null;
  /** When this snapshot was taken. */
  snapshot_at: Date;
}

export type OpportunitySnapshotCreationAttributes = BaseModelCreationAttributes &
  Omit<OpportunitySnapshotAttributes, 'id' | 'created_at' | 'updated_at'>;

export class OpportunitySnapshot extends BaseModel<
  OpportunitySnapshotAttributes,
  OpportunitySnapshotCreationAttributes
> {
  public opportunity_id!: number;
  public status!: string;
  public buy_price!: string;
  public sell_price!: string;
  public gross_spread!: string;
  public gross_spread_pct!: string;
  public net_profit!: string;
  public roi!: string;
  public total_cost!: string;
  public buy_depth!: string;
  public sell_depth!: string;
  public current_funding_rate!: string | null;
  public basis!: string | null;
  public snapshot_at!: Date;

  static initModel(sequelize: Sequelize) {
    return OpportunitySnapshot.init(
      {
        ...BaseModel.baseColumns,
        opportunity_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'opportunity_records', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        status: { type: DataTypes.STRING(20), allowNull: false },
        buy_price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        sell_price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        gross_spread: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        gross_spread_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: false },
        net_profit: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        roi: { type: DataTypes.DECIMAL(12, 8), allowNull: false },
        total_cost: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        buy_depth: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        sell_depth: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        current_funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        basis: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        snapshot_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      },
      {
        sequelize,
        tableName: 'opportunity_snapshots',
        modelName: 'OpportunitySnapshot',
        indexes: [
          { fields: ['opportunity_id'] },
          { fields: ['opportunity_id', 'snapshot_at'] },
          { fields: ['snapshot_at'] },
        ],
      },
    );
  }
}
