import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface PairSymbolMappingAttributes extends BaseModelAttributes {
  trading_pair_id: number;
  exchange_id: number;
  normalized_symbol: string;
  exchange_symbol: string;
  base_coin_id: number | null;
  quote_coin_id: number | null;
  separator: string | null;
}

export type PairSymbolMappingCreationAttributes = BaseModelCreationAttributes &
  Omit<PairSymbolMappingAttributes, 'id' | 'created_at' | 'updated_at'>;

export class PairSymbolMapping extends BaseModel<
  PairSymbolMappingAttributes,
  PairSymbolMappingCreationAttributes
> {
  public trading_pair_id!: number;
  public exchange_id!: number;
  public normalized_symbol!: string;
  public exchange_symbol!: string;
  public base_coin_id!: number | null;
  public quote_coin_id!: number | null;
  public separator!: string | null;

  static initModel(sequelize: Sequelize) {
    return PairSymbolMapping.init(
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
        normalized_symbol: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        exchange_symbol: {
          type: DataTypes.STRING(30),
          allowNull: false,
        },
        base_coin_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'coins', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        quote_coin_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
          references: { model: 'coins', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL',
        },
        separator: {
          type: DataTypes.STRING(3),
          allowNull: true,
          defaultValue: '/',
        },
      },
      {
        sequelize,
        tableName: 'pair_symbol_mappings',
        modelName: 'PairSymbolMapping',
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
