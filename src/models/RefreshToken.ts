import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface RefreshTokenAttributes extends BaseModelAttributes {
  user_id: number;
  token_hash: string;
  family: string;
  is_revoked: boolean;
  expires_at: Date;
  user_agent: string | null;
}

export type RefreshTokenCreationAttributes = BaseModelCreationAttributes &
  Omit<RefreshTokenAttributes, 'id' | 'created_at' | 'updated_at'>;

export class RefreshToken extends BaseModel<
  RefreshTokenAttributes,
  RefreshTokenCreationAttributes
> {
  public user_id!: number;
  public token_hash!: string;
  public family!: string;
  public is_revoked!: boolean;
  public expires_at!: Date;
  public user_agent!: string | null;

  static initModel(sequelize: Sequelize) {
    return RefreshToken.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: {
            model: 'users',
            key: 'id',
          },
        },
        token_hash: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
        },
        family: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        is_revoked: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        expires_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        user_agent: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'refresh_tokens',
        modelName: 'RefreshToken',
      },
    );
  }
}
