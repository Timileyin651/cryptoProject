import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

// ──────────────────── Types ─────────────────────────────────────────────

export type NotificationStatus = 'pending' | 'sent' | 'delivered' | 'failed' | 'retrying';

export type NotificationChannel = 'email' | 'telegram' | 'web_push';

// ──────────────────── Attributes ────────────────────────────────────────

export interface NotificationAttributes extends BaseModelAttributes {
  user_id: number;
  alert_id: number;
  /** Which channel this notification was sent/retried on. */
  channel: NotificationChannel;
  /** Delivery status. */
  status: NotificationStatus;
  /** Subject line (for email) or title. */
  subject: string;
  /** Plain-text body. */
  body_text: string;
  /** HTML body (for email). */
  body_html: string | null;
  /** JSON payload for channel-specific data (Telegram parse mode, etc.). */
  payload: Record<string, unknown> | null;
  /** Error message if delivery failed. */
  error_message: string | null;
  /** Number of delivery attempts. */
  attempt_count: number;
  /** Max attempts before giving up. Default: 3. */
  max_attempts: number;
  /** When the notification was last attempted. */
  last_attempt_at: Date | null;
  /** When delivery was confirmed. */
  delivered_at: Date | null;
  /** Deduplication key (alert_id + opportunity fingerprint). */
  dedup_key: string;
}

export type NotificationCreationAttributes = BaseModelCreationAttributes &
  Omit<
    NotificationAttributes,
    'id' | 'created_at' | 'updated_at' | 'attempt_count' | 'last_attempt_at' | 'delivered_at'
  >;

// ──────────────────── Model ─────────────────────────────────────────────

export class Notification extends BaseModel<
  NotificationAttributes,
  NotificationCreationAttributes
> {
  public user_id!: number;
  public alert_id!: number;
  public channel!: NotificationChannel;
  public status!: NotificationStatus;
  public subject!: string;
  public body_text!: string;
  public body_html!: string | null;
  public payload!: Record<string, unknown> | null;
  public error_message!: string | null;
  public attempt_count!: number;
  public max_attempts!: number;
  public last_attempt_at!: Date | null;
  public delivered_at!: Date | null;
  public dedup_key!: string;

  static initModel(sequelize: Sequelize) {
    return Notification.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        alert_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'alerts', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        channel: {
          type: DataTypes.ENUM('email', 'telegram', 'web_push'),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM('pending', 'sent', 'delivered', 'failed', 'retrying'),
          allowNull: false,
          defaultValue: 'pending',
        },
        subject: {
          type: DataTypes.STRING(255),
          allowNull: false,
        },
        body_text: {
          type: DataTypes.TEXT,
          allowNull: false,
        },
        body_html: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        payload: {
          type: DataTypes.JSON,
          allowNull: true,
        },
        error_message: {
          type: DataTypes.TEXT,
          allowNull: true,
        },
        attempt_count: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        max_attempts: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 3,
        },
        last_attempt_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        delivered_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        dedup_key: {
          type: DataTypes.STRING(255),
          allowNull: false,
          comment: 'Unique key for deduplication: alert_id:fingerprint',
        },
      },
      {
        sequelize,
        tableName: 'notifications',
        modelName: 'Notification',
        indexes: [
          { fields: ['user_id', 'status'] },
          { fields: ['alert_id', 'status'] },
          { fields: ['dedup_key'], unique: true, name: 'idx_notifications_dedup' },
          { fields: ['status'] },
          { fields: ['channel'] },
          { fields: ['last_attempt_at'] },
        ],
      },
    );
  }
}
