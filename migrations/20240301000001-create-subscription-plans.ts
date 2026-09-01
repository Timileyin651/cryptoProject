const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('subscription_plans', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      slug: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      description: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      price_monthly: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      price_yearly: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
        defaultValue: 0,
      },
      currency: {
        type: Sequelize.STRING(3),
        allowNull: false,
        defaultValue: 'NGN',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      sort_order: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      // ── Usage limits (all null = unlimited) ──
      max_scans_per_day: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Daily scan limit; null = unlimited',
      },
      max_alerts: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Active alert slots; null = unlimited',
      },
      max_portfolios: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Portfolio slots; null = unlimited',
      },
      max_exchanges_connected: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Exchange API connections; null = unlimited',
      },
      rate_limit_per_minute: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 60,
      },
      data_retention_days: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 30,
        comment: 'How many days of history to keep',
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

    await queryInterface.addIndex('subscription_plans', ['slug']);
    await queryInterface.addIndex('subscription_plans', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('subscription_plans');
  },
};
