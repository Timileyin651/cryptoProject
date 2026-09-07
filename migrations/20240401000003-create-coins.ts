const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('coins', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      symbol: {
        type: Sequelize.STRING(10),
        allowNull: false,
        unique: true,
        comment: 'Ticker symbol, e.g. BTC, ETH',
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(100),
        allowNull: false,
        unique: true,
        comment: 'URL-safe identifier, e.g. bitcoin, ethereum',
      },
      decimals: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 18,
      },
      logo_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      coingecko_id: {
        type: Sequelize.STRING(100),
        allowNull: true,
        comment: 'CoinGecko identifier for price lookups',
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      metadata: {
        type: Sequelize.JSON,
        allowNull: true,
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

    await queryInterface.addIndex('coins', ['symbol']);
    await queryInterface.addIndex('coins', ['slug']);
    await queryInterface.addIndex('coins', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('coins');
  },
};
