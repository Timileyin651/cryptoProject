import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export type UserRole = 'user' | 'admin' | 'superadmin';

export interface UserAttributes extends BaseModelAttributes {
  email: string;
  first_name: string;
  last_name: string;
  password_hash: string;
  role: UserRole;
  is_email_verified: boolean;
  is_active: boolean;
  last_login_at: Date | null;
}

export type UserCreationAttributes = BaseModelCreationAttributes &
  Omit<UserAttributes, 'id' | 'created_at' | 'updated_at'>;

export class User extends BaseModel<UserAttributes, UserCreationAttributes> {
  public email!: string;
  public first_name!: string;
  public last_name!: string;
  public password_hash!: string;
  public role!: UserRole;
  public is_email_verified!: boolean;
  public is_active!: boolean;
  public last_login_at!: Date | null;

  static initModel(sequelize: Sequelize) {
    return User.init(
      {
        ...BaseModel.baseColumns,
        email: {
          type: DataTypes.STRING(255),
          allowNull: false,
          unique: true,
          validate: {
            isEmail: true,
          },
        },
        first_name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        last_name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        password_hash: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        role: {
          type: DataTypes.ENUM('user', 'admin', 'superadmin'),
          allowNull: false,
          defaultValue: 'user',
        },
        is_email_verified: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        is_active: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        last_login_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'users',
        modelName: 'User',
      },
    );
  }
}
