const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('feature_entitlements', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      plan_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'subscription_plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      feature_key: {
        type: Sequelize.STRING(100),
        allowNull: false,
        comment: 'Machine-readable feature identifier, e.g. ADVANCED_SCANNER',
      },
      is_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      limit_value: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Per-period usage cap for this feature; null = unlimited',
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
      updated_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.fn('NOW'),
      },
    });

    await queryInterface.addIndex('feature_entitlements', ['plan_id', 'feature_key'], {
      unique: true,
    });
    await queryInterface.addIndex('feature_entitlements', ['feature_key']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('feature_entitlements');
  },
};
