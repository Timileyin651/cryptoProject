import { Model, DataTypes, Optional } from 'sequelize';

export interface BaseModelAttributes {
  id: number;
  created_at: Date;
  updated_at: Date;
}

export type BaseModelCreationAttributes = Optional<
  BaseModelAttributes,
  'id' | 'created_at' | 'updated_at'
>;

export abstract class BaseModel<
  T extends BaseModelAttributes,
  C extends BaseModelCreationAttributes,
> extends Model<T, C> {
  public id!: number;
  public created_at!: Date;
  public updated_at!: Date;

  static readonly baseColumns = {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
  } as const;
}
