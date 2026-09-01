import { DataTypes } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface ExchangeCoinAttributes extends BaseModelAttributes {
  exchange_id: number;
  coin_id: number;
  network_id: number | null;
  deposit_enabled: boolean;
  withdrawal_enabled: boolean;
  deposit_fee: number;
  withdrawal_fee: number;
  min_withdrawal: number | null;
  max_withdrawal: number | null;
  min_deposit: number | null;
  confirmation_blocks: number | null;
  exchange_symbol: string | null;
  metadata: Record<string, unknown> | null;
}

export type ExchangeCoinCreationAttributes = BaseModelCreationAttributes &
  Omit<ExchangeCoinAttributes, 'id' | 'created_at' | 'updated_at'>;

export class ExchangeCoin extends BaseModel<ExchangeCoinAttributes, ExchangeCoinCreationAttributes> {
  public exchange_id!: number;
  public coin_id!: number;
  public network_id!: number | null;
  public deposit_enabled!: boolean;
  public withdrawal_enabled!: boolean;
  public deposit_fee!: number;
  public withdrawal_fee!: number;
  public min_withdrawal!: number | null;
  public max_withdrawal!: number | null;
  public min_deposit!: number | null;
  public confirmation_blocks!: number | null;
  public exchange_symbol!: string | null;
  public metadata!: Record<string, unknown> | null;

  static initModel() {
    return ExchangeCoin.init(
      {
        ...BaseModel.baseColumns,
        exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'exchanges', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        coin_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'coins', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        network_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'networks', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        deposit_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        withdrawal_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        deposit_fee: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: 0,
        },
        withdrawal_fee: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: false,
          defaultValue: 0,
        },
        min_withdrawal: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        max_withdrawal: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        min_deposit: {
          type: DataTypes.DECIMAL(36, 18),
          allowNull: true,
        },
        confirmation_blocks: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 1,
        },
        exchange_symbol: {
          type: DataTypes.STRING(30),
          allowNull: true,
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true,
        },
      },
      {
        sequelize: ExchangeCoin.sequelize,
        tableName: 'exchange_coins',
        modelName: 'ExchangeCoin',
        indexes: [
          {
            unique: true,
            fields: ['exchange_id', 'coin_id', 'network_id'],
          },
        ],
      },
    );
  }
}
