import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

// ──────────────────── Types ─────────────────────────────────────────────

export type NotificationChannel = 'email' | 'telegram' | 'web_push';

export interface ChannelConfig {
  enabled: boolean;
  /** Channel-specific settings. */
  settings: Record<string, unknown>;
}

export interface TelegramConfig extends ChannelConfig {
  settings: {
    botToken?: string;
    chatId?: string;
  };
}

export interface WebPushConfig extends ChannelConfig {
  settings: {
    endpoint?: string;
    keys?: { p256dh: string; auth: string };
  };
}

// ──────────────────── Attributes ────────────────────────────────────────

export interface NotificationPreferenceAttributes extends BaseModelAttributes {
  user_id: number;
  /** JSON config per channel. Keys: 'email', 'telegram', 'web_push'. */
  email_enabled: boolean;
  telegram_enabled: boolean;
  telegram_bot_token: string | null;
  telegram_chat_id: string | null;
  web_push_enabled: boolean;
  /** Quiet hours: hour (0-23) when notifications start being suppressed. */
  quiet_hours_start: number | null;
  /** Quiet hours: hour (0-23) when notifications resume. */
  quiet_hours_end: number | null;
  /** Timezone for quiet hours (e.g. 'America/New_York'). */
  timezone: string;
  /** Maximum notifications per hour across all alerts. */
  rate_limit_per_hour: number;
}

export type NotificationPreferenceCreationAttributes = BaseModelCreationAttributes &
  Omit<NotificationPreferenceAttributes, 'id' | 'created_at' | 'updated_at'>;

// ──────────────────── Model ─────────────────────────────────────────────

export class NotificationPreference extends BaseModel<
  NotificationPreferenceAttributes,
  NotificationPreferenceCreationAttributes
> {
  public user_id!: number;
  public email_enabled!: boolean;
  public telegram_enabled!: boolean;
  public telegram_bot_token!: string | null;
  public telegram_chat_id!: string | null;
  public web_push_enabled!: boolean;
  public quiet_hours_start!: number | null;
  public quiet_hours_end!: number | null;
  public timezone!: string;
  public rate_limit_per_hour!: number;

  static initModel(sequelize: Sequelize) {
    return NotificationPreference.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          unique: true,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        email_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
        telegram_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        telegram_bot_token: {
          type: DataTypes.STRING(255),
          allowNull: true,
          comment: 'Encrypted bot token for Telegram notifications',
        },
        telegram_chat_id: {
          type: DataTypes.STRING(100),
          allowNull: true,
        },
        web_push_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        quiet_hours_start: {
          type: DataTypes.INTEGER,
          allowNull: true,
          validate: { min: 0, max: 23 },
        },
        quiet_hours_end: {
          type: DataTypes.INTEGER,
          allowNull: true,
          validate: { min: 0, max: 23 },
        },
        timezone: {
          type: DataTypes.STRING(50),
          allowNull: false,
          defaultValue: 'UTC',
        },
        rate_limit_per_hour: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 30,
          comment: 'Max notifications per hour across all alerts',
        },
      },
      {
        sequelize,
        tableName: 'notification_preferences',
        modelName: 'NotificationPreference',
        indexes: [{ fields: ['user_id'], unique: true, name: 'idx_notif_pref_user' }],
      },
    );
  }
}
