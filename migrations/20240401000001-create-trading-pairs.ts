const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('trading_pairs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      exchange_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      symbol: {
        type: Sequelize.STRING(20),
        allowNull: false,
      },
      base_currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      quote_currency: {
        type: Sequelize.STRING(10),
        allowNull: false,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
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

    await queryInterface.addIndex('trading_pairs', ['exchange_id']);
    await queryInterface.addIndex('trading_pairs', ['symbol']);
    await queryInterface.addIndex('trading_pairs', ['base_currency']);
    await queryInterface.addIndex('trading_pairs', ['quote_currency']);
    await queryInterface.addIndex('trading_pairs', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('trading_pairs');
  },
};
