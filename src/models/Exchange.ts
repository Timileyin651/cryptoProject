import { DataTypes } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface ExchangeAttributes extends BaseModelAttributes {
  name: string;
  slug: string;
  api_base_url: string | null;
  is_active: boolean;
  logo_url: string | null;
  website_url: string | null;
  supports_spot: boolean;
  supports_futures: boolean;
  supports_margin: boolean;
  supports_websocket: boolean;
  api_version: string | null;
  rate_limit_per_minute: number | null;
  country: string | null;
  trust_score: number | null;
  metadata: Record<string, unknown> | null;
}

export type ExchangeCreationAttributes = BaseModelCreationAttributes &
  Omit<ExchangeAttributes, 'id' | 'created_at' | 'updated_at'>;

export class Exchange extends BaseModel<ExchangeAttributes, ExchangeCreationAttributes> {
  public name!: string;
  public slug!: string;
  public api_base_url!: string | null;
  public is_active!: boolean;
  public logo_url!: string | null;
  public website_url!: string | null;
  public supports_spot!: boolean;
  public supports_futures!: boolean;
  public supports_margin!: boolean;
  public supports_websocket!: boolean;
  public api_version!: string | null;
  public rate_limit_per_minute!: number | null;
  public country!: string | null;
  public trust_score!: number | null;
  public metadata!: Record<string, unknown> | null;

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
        logo_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        website_url: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        supports_spot: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        supports_futures: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        supports_margin: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        supports_websocket: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        api_version: {
          type: DataTypes.STRING(20),
          allowNull: true,
        },
        rate_limit_per_minute: {
          type: DataTypes.INTEGER,
          allowNull: true,
          defaultValue: 600,
        },
        country: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        trust_score: {
          type: DataTypes.DECIMAL(3, 1),
          allowNull: true,
          defaultValue: 5.0,
        },
        metadata: {
          type: DataTypes.JSON,
          allowNull: true,
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
