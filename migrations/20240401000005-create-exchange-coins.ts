const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    await queryInterface.createTable('exchange_coins', {
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
      coin_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'coins', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      network_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'networks', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
        comment: 'Which network this coin is on at this exchange; null = exchange default',
      },
      // ── Status flags ──
      deposit_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      withdrawal_enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true,
      },
      // ── Fees ──
      deposit_fee: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: false,
        defaultValue: 0,
        comment: 'Flat fee or percentage for deposits',
      },
      withdrawal_fee: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: false,
        defaultValue: 0,
        comment: 'Flat withdrawal fee in coin units',
      },
      // ── Limits ──
      min_withdrawal: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
      },
      max_withdrawal: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
      },
      min_deposit: {
        type: Sequelize.DECIMAL(36, 18),
        allowNull: true,
      },
      // ── Confirmation requirements ──
      confirmation_blocks: {
        type: Sequelize.INTEGER,
        allowNull: true,
        defaultValue: 1,
        comment: 'Number of confirmations before deposit is credited',
      },
      // ── Per-exchange symbol override ──
      exchange_symbol: {
        type: Sequelize.STRING(30),
        allowNull: true,
        comment: 'How this exchange labels the coin (may differ from coin.symbol)',
      },
      // ── Metadata ──
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

    await queryInterface.addIndex('exchange_coins', ['exchange_id', 'coin_id', 'network_id'], {
      unique: true,
    });
    await queryInterface.addIndex('exchange_coins', ['coin_id']);
    await queryInterface.addIndex('exchange_coins', ['network_id']);
    await queryInterface.addIndex('exchange_coins', ['deposit_enabled']);
    await queryInterface.addIndex('exchange_coins', ['withdrawal_enabled']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('exchange_coins');
  },
};
