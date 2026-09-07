import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface WatchlistItemAttributes extends BaseModelAttributes {
  watchlist_id: number;
  opportunity_id: number;
  notes: string | null;
  /** Price alert target — null means no alert set. */
  alert_above: number | null;
  alert_below: number | null;
  sort_order: number;
}

export type WatchlistItemCreationAttributes = BaseModelCreationAttributes &
  Omit<WatchlistItemAttributes, 'id' | 'created_at' | 'updated_at'>;

export class WatchlistItem extends BaseModel<
  WatchlistItemAttributes,
  WatchlistItemCreationAttributes
> {
  public watchlist_id!: number;
  public opportunity_id!: number;
  public notes!: string | null;
  public alert_above!: number | null;
  public alert_below!: number | null;
  public sort_order!: number;

  static initModel(sequelize: Sequelize) {
    return WatchlistItem.init(
      {
        ...BaseModel.baseColumns,
        watchlist_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'watchlists', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        opportunity_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'opportunity_records', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        notes: {
          type: DataTypes.TEXT,
          allowNull: true,
          comment: 'User notes about this watchlist item',
        },
        alert_above: {
          type: DataTypes.DECIMAL(20, 8),
          allowNull: true,
          comment: 'Alert when spread/ROI rises above this value',
        },
        alert_below: {
          type: DataTypes.DECIMAL(20, 8),
          allowNull: true,
          comment: 'Alert when spread/ROI drops below this value',
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
      },
      {
        sequelize,
        tableName: 'watchlist_items',
        modelName: 'WatchlistItem',
        indexes: [
          { unique: true, fields: ['watchlist_id', 'opportunity_id'] },
          { fields: ['watchlist_id', 'sort_order'] },
          { fields: ['opportunity_id'] },
        ],
      },
    );
  }
}
