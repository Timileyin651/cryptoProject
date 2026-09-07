const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // ── opportunity_records ──
    await queryInterface.createTable('opportunity_records', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      opportunity_type: {
        type: Sequelize.ENUM('spot', 'funding'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('active', 'marginal', 'unprofitable', 'illiquid', 'blocked', 'expired', 'low_funding'),
        allowNull: false,
        defaultValue: 'active',
      },
      status_reason: { type: Sequelize.TEXT, allowNull: true },

      // ── Pair ──
      symbol: { type: Sequelize.STRING(20), allowNull: false },
      base_currency: { type: Sequelize.STRING(10), allowNull: false },
      quote_currency: { type: Sequelize.STRING(10), allowNull: false },

      // ── Exchange legs ──
      buy_exchange_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      buy_symbol: { type: Sequelize.STRING(30), allowNull: false },
      sell_exchange_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      sell_symbol: { type: Sequelize.STRING(30), allowNull: false },

      // ── Prices ──
      buy_price: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      sell_price: { type: Sequelize.DECIMAL(36, 18), allowNull: false },

      // ── Spread ──
      gross_spread: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      gross_spread_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: false },

      // ── Fees ──
      buy_fee: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      sell_fee: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      total_fees: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      buy_fee_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      sell_fee_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },

      // ── Network ──
      withdrawal_fee: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      network_fee_quote: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      confirmation_time_sec: { type: Sequelize.INTEGER, allowNull: true },
      withdrawal_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      deposit_available: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      network: { type: Sequelize.STRING(30), allowNull: true },
      same_exchange: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

      // ── Slippage ──
      buy_slippage: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      sell_slippage: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      total_slippage: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      buy_vwap: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      sell_vwap: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },

      // ── Liquidity ──
      liquidity_executable: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
      buy_depth: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      sell_depth: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      buy_fill_ratio: { type: Sequelize.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },
      sell_fill_ratio: { type: Sequelize.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },

      // ── Net economics ──
      total_cost: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      net_profit: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      roi: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },

      // ── Trade params ──
      trade_size_base: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 1 },
      capital_required: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },

      // ── Funding-specific ──
      perp_symbol: { type: Sequelize.STRING(30), allowNull: true },
      spot_price: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      perp_price: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      basis: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      basis_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      current_funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      funding_rate_apr: { type: Sequelize.DECIMAL(12, 6), allowNull: true },
      funding_interval_ms: { type: Sequelize.INTEGER, allowNull: true },
      position_side: { type: Sequelize.STRING(30), allowNull: true },
      leverage: { type: Sequelize.DECIMAL(6, 2), allowNull: true, defaultValue: 1 },
      expected_funding_per_interval: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      intervals_in_horizon: { type: Sequelize.INTEGER, allowNull: true },
      total_expected_funding: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      basis_convergence_estimate: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      total_estimated_return: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      estimated_return_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      net_return_estimate: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      net_return_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      is_estimate: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: false },

      // ── Metadata ──
      calculated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      data_age_ms: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      scan_id: { type: Sequelize.STRING(36), allowNull: true },

      // ── Denormalized slugs ──
      buy_exchange_slug: { type: Sequelize.STRING(50), allowNull: false },
      sell_exchange_slug: { type: Sequelize.STRING(50), allowNull: false },

      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    // ── Indexes for opportunity_records ──
    await queryInterface.addIndex('opportunity_records', ['opportunity_type']);
    await queryInterface.addIndex('opportunity_records', ['status']);
    await queryInterface.addIndex('opportunity_records', ['symbol']);
    await queryInterface.addIndex('opportunity_records', ['base_currency']);
    await queryInterface.addIndex('opportunity_records', ['buy_exchange_id']);
    await queryInterface.addIndex('opportunity_records', ['sell_exchange_id']);
    await queryInterface.addIndex('opportunity_records', ['net_profit']);
    await queryInterface.addIndex('opportunity_records', ['roi']);
    await queryInterface.addIndex('opportunity_records', ['calculated_at']);
    await queryInterface.addIndex('opportunity_records', ['scan_id']);
    await queryInterface.addIndex('opportunity_records', ['opportunity_type', 'status']);
    await queryInterface.addIndex('opportunity_records', ['opportunity_type', 'net_profit']);
    await queryInterface.addIndex('opportunity_records', ['base_currency', 'opportunity_type']);

    // ── opportunity_snapshots ──
    await queryInterface.createTable('opportunity_snapshots', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunity_records', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      status: { type: Sequelize.STRING(20), allowNull: false },
      buy_price: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      sell_price: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      gross_spread: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      gross_spread_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: false },
      net_profit: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      roi: { type: Sequelize.DECIMAL(12, 8), allowNull: false },
      total_cost: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      buy_depth: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      sell_depth: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      current_funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      basis: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      snapshot_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('opportunity_snapshots', ['opportunity_id']);
    await queryInterface.addIndex('opportunity_snapshots', ['opportunity_id', 'snapshot_at']);
    await queryInterface.addIndex('opportunity_snapshots', ['snapshot_at']);

    // ── opportunity_legs ──
    await queryInterface.createTable('opportunity_legs', {
      id: {
        type: Sequelize.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      opportunity_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'opportunity_records', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      leg_side: {
        type: Sequelize.ENUM('buy', 'sell'),
        allowNull: false,
      },
      exchange_slug: { type: Sequelize.STRING(50), allowNull: false },
      exchange_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'exchanges', key: 'id' },
      },
      symbol: { type: Sequelize.STRING(30), allowNull: false },
      price: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      quantity: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      notional: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      fee: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      fee_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      vwap: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      slippage: { type: Sequelize.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
      depth: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      fill_ratio: { type: Sequelize.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('opportunity_legs', ['opportunity_id']);
    await queryInterface.addIndex('opportunity_legs', ['opportunity_id', 'leg_side']);
  },

  async down(queryInterface) {
    await queryInterface.dropTable('opportunity_legs');
    await queryInterface.dropTable('opportunity_snapshots');
    await queryInterface.dropTable('opportunity_records');
  },
};
