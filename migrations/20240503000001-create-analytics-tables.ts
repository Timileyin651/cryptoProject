const { Sequelize } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    // ── analytics_buckets ──
    await queryInterface.createTable('analytics_buckets', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      metric_type: { type: Sequelize.STRING(30), allowNull: false },
      resolution: { type: Sequelize.ENUM('1m', '5m', '1h', '1d'), allowNull: false },
      bucket_start: { type: Sequelize.DATE, allowNull: false },
      bucket_end: { type: Sequelize.DATE, allowNull: false },
      symbol: { type: Sequelize.STRING(20), allowNull: true },
      exchange_slug: { type: Sequelize.STRING(50), allowNull: true },
      base_currency: { type: Sequelize.STRING(10), allowNull: true },
      open: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      high: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      low: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      close: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      avg: { type: Sequelize.DECIMAL(36, 18), allowNull: false },
      sum: { type: Sequelize.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
      count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      max_funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      min_funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      avg_funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('analytics_buckets', ['metric_type', 'resolution', 'bucket_start'], { name: 'idx_ab_metric_res_start' });
    await queryInterface.addIndex('analytics_buckets', ['metric_type', 'resolution', 'symbol', 'bucket_start'], { name: 'idx_ab_metric_res_sym_start' });
    await queryInterface.addIndex('analytics_buckets', ['metric_type', 'resolution', 'exchange_slug', 'bucket_start'], { name: 'idx_ab_metric_res_exch_start' });
    await queryInterface.addIndex('analytics_buckets', ['symbol', 'bucket_start'], { name: 'idx_ab_symbol_start' });
    await queryInterface.addIndex('analytics_buckets', ['bucket_start'], { name: 'idx_ab_bucket_start' });
    await queryInterface.addIndex('analytics_buckets', ['bucket_end'], { name: 'idx_ab_bucket_end' });
    await queryInterface.addIndex('analytics_buckets', ['metric_type', 'resolution', 'symbol', 'exchange_slug', 'base_currency', 'bucket_start'], { unique: true, name: 'idx_ab_unique_bucket' });

    // ── funding_rate_history ──
    await queryInterface.createTable('funding_rate_history', {
      id: { type: Sequelize.INTEGER, autoIncrement: true, primaryKey: true },
      exchange_slug: { type: Sequelize.STRING(50), allowNull: false },
      symbol: { type: Sequelize.STRING(30), allowNull: false },
      base_currency: { type: Sequelize.STRING(10), allowNull: false },
      quote_currency: { type: Sequelize.STRING(10), allowNull: false },
      funding_rate: { type: Sequelize.DECIMAL(12, 8), allowNull: false },
      funding_rate_apr: { type: Sequelize.DECIMAL(12, 6), allowNull: true },
      spot_price: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      perp_price: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      basis: { type: Sequelize.DECIMAL(36, 18), allowNull: true },
      basis_pct: { type: Sequelize.DECIMAL(12, 8), allowNull: true },
      recorded_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.NOW },
    });

    await queryInterface.addIndex('funding_rate_history', ['exchange_slug', 'base_currency', 'recorded_at'], { name: 'idx_frhist_exch_base_time' });
    await queryInterface.addIndex('funding_rate_history', ['symbol', 'recorded_at'], { name: 'idx_frhist_symbol_time' });
    await queryInterface.addIndex('funding_rate_history', ['recorded_at'], { name: 'idx_frhist_recorded_at' });
    await queryInterface.addIndex('funding_rate_history', ['exchange_slug', 'symbol', 'recorded_at'], { unique: true, name: 'idx_frhist_exch_symbol_time' });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('funding_rate_history');
    await queryInterface.dropTable('analytics_buckets');
  },
};
