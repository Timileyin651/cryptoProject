const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('networks', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      slug: {
        type: Sequelize.STRING(50),
        allowNull: false,
        unique: true,
        comment: 'e.g. ethereum, bsc, polygon, bitcoin',
      },
      chain_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'EVM chain ID or equivalent network identifier',
      },
      native_currency_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'coins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'The native gas token of this network',
      },
      explorer_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      rpc_url: {
        type: Sequelize.STRING(500),
        allowNull: true,
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      avg_block_time_seconds: {
        type: Sequelize.INTEGER,
        allowNull: true,
        comment: 'Average block time in seconds',
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

    await queryInterface.addIndex('networks', ['slug']);
    await queryInterface.addIndex('networks', ['chain_id']);
    await queryInterface.addIndex('networks', ['native_currency_id']);
    await queryInterface.addIndex('networks', ['is_active']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('networks');
  },
};
