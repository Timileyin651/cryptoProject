import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface EmailVerificationAttributes extends BaseModelAttributes {
  user_id: number;
  token_hash: string;
  expires_at: Date;
  is_used: boolean;
}

export type EmailVerificationCreationAttributes = BaseModelCreationAttributes &
  Omit<EmailVerificationAttributes, 'id' | 'created_at' | 'updated_at'>;

export class EmailVerification extends BaseModel<
  EmailVerificationAttributes,
  EmailVerificationCreationAttributes
> {
  public user_id!: number;
  public token_hash!: string;
  public expires_at!: Date;
  public is_used!: boolean;

  static initModel(sequelize: Sequelize) {
    return EmailVerification.init(
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
        expires_at: {
          type: DataTypes.DATE,
          allowNull: false,
        },
        is_used: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
      },
      {
        sequelize,
        tableName: 'email_verifications',
        modelName: 'EmailVerification',
      },
    );
  }
}
