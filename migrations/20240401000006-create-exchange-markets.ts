const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('exchange_markets', {
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
      // ── Market type ──
      market_type: {
        type: Sequelize.ENUM('spot', 'futures', 'margin'),
        allowNull: false,
        defaultValue: 'spot',
      },
      // ── Trading fees ──
      taker_fee: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0.001,
        comment: 'Taker fee as decimal (0.001 = 0.1%)',
      },
      maker_fee: {
        type: Sequelize.DECIMAL(10, 6),
        allowNull: false,
        defaultValue: 0.001,
        comment: 'Maker fee as decimal (0.001 = 0.1%)',
      },
      // ── Order constraints ──
      min_order_size: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
        comment: 'Minimum order size in quote currency',
      },
      max_order_size: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
        comment: 'Maximum order size in quote currency',
      },
      min_price_tick: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
        comment: 'Smallest price increment',
      },
      min_qty_tick: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
        comment: 'Smallest quantity increment',
      },
      // ── Market status ──
      status: {
        type: Sequelize.ENUM('active', 'inactive', 'halted', 'delisted'),
        allowNull: false,
        defaultValue: 'active',
      },
      // ── WebSocket / subscription support ──
      supports_orderbook: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      supports_ticker: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      supports_trades: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      // ── Extra ──
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

    await queryInterface.addIndex('exchange_markets', ['trading_pair_id', 'exchange_id'], {
      unique: true,
    });
    await queryInterface.addIndex('exchange_markets', ['exchange_id']);
    await queryInterface.addIndex('exchange_markets', ['market_type']);
    await queryInterface.addIndex('exchange_markets', ['status']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('exchange_markets');
  },
};
