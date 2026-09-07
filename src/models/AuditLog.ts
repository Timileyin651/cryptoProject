import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export type AuditAction =
  | 'user.update'
  | 'user.deactivate'
  | 'user.delete'
  | 'user.role_change'
  | 'plan.create'
  | 'plan.update'
  | 'plan.delete'
  | 'subscription.override'
  | 'subscription.cancel'
  | 'subscription.extend'
  | 'payment.refund'
  | 'payment.override'
  | 'exchange.create'
  | 'exchange.update'
  | 'exchange.deactivate'
  | 'coin.create'
  | 'coin.update'
  | 'coin.delete'
  | 'network.create'
  | 'network.update'
  | 'network.delete'
  | 'opportunity.delete'
  | 'alert.force_disable'
  | 'notification.retry_all'
  | 'settings.update'
  | 'system.scan_trigger'
  | 'system.cache_clear';

export interface AuditLogAttributes extends BaseModelAttributes {
  /** User who performed the action. */
  actor_id: number;
  /** Actor's email for quick reference. */
  actor_email: string;
  /** What was done. */
  action: AuditAction;
  /** Resource type (e.g. 'user', 'plan', 'exchange'). */
  resource_type: string;
  /** Resource ID affected. */
  resource_id: number | null;
  /** JSON snapshot of what changed. */
  changes: Record<string, unknown> | null;
  /** Request IP address. */
  ip_address: string | null;
  /** User agent string. */
  user_agent: string | null;
  /** Whether the action succeeded. */
  success: boolean;
  /** Error message if action failed. */
  error_message: string | null;
}

export type AuditLogCreationAttributes = BaseModelCreationAttributes &
  Omit<AuditLogAttributes, 'id' | 'created_at' | 'updated_at'>;

export class AuditLog extends BaseModel<AuditLogAttributes, AuditLogCreationAttributes> {
  public actor_id!: number;
  public actor_email!: string;
  public action!: AuditAction;
  public resource_type!: string;
  public resource_id!: number | null;
  public changes!: Record<string, unknown> | null;
  public ip_address!: string | null;
  public user_agent!: string | null;
  public success!: boolean;
  public error_message!: string | null;

  static initModel(sequelize: Sequelize) {
    return AuditLog.init(
      {
        ...BaseModel.baseColumns,
        actor_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'RESTRICT',
        },
        actor_email: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        action: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        resource_type: {
          type: DataTypes.STRING(50),
          allowNull: false,
        },
        resource_id: {
          type: DataTypes.INTEGER,
          allowNull: true,
        },
        changes: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        ip_address: {
          type: DataTypes.STRING(45),
          allowNull: true,
        },
        user_agent: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        success: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        error_message: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'audit_logs',
        modelName: 'AuditLog',
        indexes: [
          { fields: ['actor_id'], name: 'idx_audit_actor' },
          { fields: ['action'], name: 'idx_audit_action' },
          { fields: ['resource_type', 'resource_id'], name: 'idx_audit_resource' },
          { fields: ['created_at'], name: 'idx_audit_created' },
          { fields: ['actor_id', 'created_at'], name: 'idx_audit_actor_time' },
        ],
      },
    );
  }
}
