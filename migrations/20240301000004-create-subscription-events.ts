const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('subscription_events', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      subscription_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'subscriptions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      event_type: {
        type: Sequelize.STRING(50),
        allowNull: false,
        comment: 'e.g. plan_changed, subscription_created, cancelled, renewed, expired',
      },
      payload: {
        type: Sequelize.JSON,
        allowNull: true,
        comment: 'Arbitrary event metadata snapshot',
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

    await queryInterface.addIndex('subscription_events', ['user_id']);
    await queryInterface.addIndex('subscription_events', ['subscription_id']);
    await queryInterface.addIndex('subscription_events', ['event_type']);
    await queryInterface.addIndex('subscription_events', ['user_id', 'event_type']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('subscription_events');
  },
};
