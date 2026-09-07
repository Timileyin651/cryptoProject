import { QueryInterface, DataTypes } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    // ── Add role column to users ──
    await queryInterface.addColumn('users', 'role', {
      type: DataTypes.ENUM('user', 'admin', 'superadmin'),
      allowNull: false,
      defaultValue: 'user',
      after: 'password_hash',
    });

    // ── audit_logs ──
    await queryInterface.createTable('audit_logs', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
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

    await queryInterface.addIndex('audit_logs', ['actor_id'], { name: 'idx_audit_actor' });
    await queryInterface.addIndex('audit_logs', ['action'], { name: 'idx_audit_action' });
    await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'], { name: 'idx_audit_resource' });
    await queryInterface.addIndex('audit_logs', ['created_at'], { name: 'idx_audit_created' });
    await queryInterface.addIndex('audit_logs', ['actor_id', 'created_at'], { name: 'idx_audit_actor_time' });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('audit_logs');
    await queryInterface.removeColumn('users', 'role');
  },
};
