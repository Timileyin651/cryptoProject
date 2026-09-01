import { DataTypes } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface ExchangeAttributes extends BaseModelAttributes {
  name: string;
  slug: string;
  api_base_url: string | null;
  is_active: boolean;
}

export type ExchangeCreationAttributes = BaseModelCreationAttributes &
  Omit<ExchangeAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Exchange extends BaseModel<ExchangeAttributes, ExchangeCreationAttributes> {
  public name!: string;
  public slug!: string;
  public api_base_url!: string | null;
  public is_active!: boolean;

  static initModel() {
    return Exchange.init(
      {
        ...BaseModel.baseColumns,
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
          unique: true,
        },
        slug: {
          type: DataTypes.STRING(50),
          allowNull: false,
          unique: true,
        },
        api_base_url: {
          type: DataTypes.STRING(255),
          allowNull: true,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize: Exchange.sequelize,
        tableName: 'exchanges',
        modelName: 'Exchange',
      },
    );
  }
}
