const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('pair_symbol_mappings', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      trading_pair_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'trading_pairs', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      exchange_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      normalized_symbol: {
        type: Sequelize.STRING(30),
        allowNull: false,
        comment: 'Our canonical symbol, e.g. BTC/USDT',
      },
      exchange_symbol: {
        type: Sequelize.STRING(30),
        allowNull: false,
        comment: 'How the exchange names this pair, e.g. BTCUSDT, BTC-USDT',
      },
      // ── Optional coin FKs for richer queries ──
      base_coin_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'coins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      quote_coin_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'coins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      // ── Separator hint ──
      separator: {
        type: Sequelize.STRING(3),
        allowNull: true,
        defaultValue: '/',
        comment: 'Separator used in the normalized symbol',
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

    await queryInterface.addIndex('pair_symbol_mappings', ['trading_pair_id', 'exchange_id'], {
      unique: true,
    });
    await queryInterface.addIndex('pair_symbol_mappings', ['exchange_id']);
    await queryInterface.addIndex('pair_symbol_mappings', ['normalized_symbol']);
    await queryInterface.addIndex('pair_symbol_mappings', ['exchange_symbol']);
    await queryInterface.addIndex('pair_symbol_mappings', ['base_coin_id']);
    await queryInterface.addIndex('pair_symbol_mappings', ['quote_coin_id']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('pair_symbol_mappings');
  },
};
