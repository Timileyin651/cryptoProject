import { QueryInterface, DataTypes } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    // ── alerts ──
    await queryInterface.createTable('alerts', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      name: {
        type: DataTypes.STRING(100),
        allowNull: false,
      },
      description: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('active', 'paused', 'triggered', 'expired', 'deleted'),
        allowNull: false,
        defaultValue: 'active',
      },
      conditions: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: {},
      },
      channels: {
        type: DataTypes.JSON,
        allowNull: false,
        defaultValue: ['email'],
      },
      cooldown_seconds: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 3600,
      },
      last_notified_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      trigger_count: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      is_enabled: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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
    });

    await queryInterface.addIndex('alerts', ['user_id', 'status'], { name: 'idx_alerts_user_status' });
    await queryInterface.addIndex('alerts', ['user_id', 'is_enabled'], { name: 'idx_alerts_user_enabled' });
    await queryInterface.addIndex('alerts', ['status'], { name: 'idx_alerts_status' });
    await queryInterface.addIndex('alerts', ['is_enabled'], { name: 'idx_alerts_enabled' });
    await queryInterface.addIndex('alerts', ['last_notified_at'], { name: 'idx_alerts_last_notified' });

    // ── notifications ──
    await queryInterface.createTable('notifications', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
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
    });

    await queryInterface.addIndex('notifications', ['user_id', 'status'], { name: 'idx_notifs_user_status' });
    await queryInterface.addIndex('notifications', ['alert_id', 'status'], { name: 'idx_notifs_alert_status' });
    await queryInterface.addIndex('notifications', ['dedup_key'], { unique: true, name: 'idx_notifications_dedup' });
    await queryInterface.addIndex('notifications', ['status'], { name: 'idx_notifs_status' });
    await queryInterface.addIndex('notifications', ['channel'], { name: 'idx_notifs_channel' });
    await queryInterface.addIndex('notifications', ['last_attempt_at'], { name: 'idx_notifs_last_attempt' });

    // ── notification_preferences ──
    await queryInterface.createTable('notification_preferences', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
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
      },
      quiet_hours_end: {
        type: DataTypes.INTEGER,
        allowNull: true,
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
    });

    await queryInterface.addIndex('notification_preferences', ['user_id'], {
      unique: true,
      name: 'idx_notif_pref_user',
    });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('notification_preferences');
    await queryInterface.dropTable('notifications');
    await queryInterface.dropTable('alerts');
  },
};
