import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Add scanner-specific limit/feature columns to `subscription_plans`.
 *
 * These columns are declared on the SubscriptionPlan model (used by
 * plan gating for the opportunity scanner) but were never added to the
 * table, which caused Sequelize lookups such as
 * `getActiveSubscription`/`resolvePlan` to fail with
 * "Unknown column 'plan.max_opportunities_per_query' in 'field list'".
 *
 * Column definitions mirror the model exactly (int nullable limits with
 * a sensible default, boolean feature flags defaulting to false).
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  await queryInterface.addColumn('subscription_plans', 'max_opportunities_per_query', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 25,
    comment: 'Max opportunities per query (null = unlimited)',
  });

  await queryInterface.addColumn('subscription_plans', 'max_exchange_pairs', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 3,
    comment: 'Max exchange pairs visible',
  });

  await queryInterface.addColumn('subscription_plans', 'max_analytics_days', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 7,
    comment: 'Max history days for analytics',
  });

  await queryInterface.addColumn('subscription_plans', 'max_saved_preferences', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 3,
    comment: 'Max saved scanner preferences',
  });

  await queryInterface.addColumn('subscription_plans', 'max_watchlist_items', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 10,
    comment: 'Max watchlist items total',
  });

  await queryInterface.addColumn('subscription_plans', 'max_favorite_coins', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 5,
    comment: 'Max favorite coins',
  });

  await queryInterface.addColumn('subscription_plans', 'max_favorite_exchanges', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 2,
    comment: 'Max favorite exchanges',
  });

  await queryInterface.addColumn('subscription_plans', 'min_alert_cooldown_seconds', {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 7200,
    comment: 'Minimum alert cooldown seconds',
  });

  await queryInterface.addColumn('subscription_plans', 'detailed_opportunities', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether detailed opportunity data is available',
  });

  await queryInterface.addColumn('subscription_plans', 'realtime_scanning', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether real-time scanning is enabled',
  });

  await queryInterface.addColumn('subscription_plans', 'funding_view', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether funding/perp view is enabled',
  });

  await queryInterface.addColumn('subscription_plans', 'telegram_alerts', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether Telegram alert channel is enabled',
  });

  await queryInterface.addColumn('subscription_plans', 'api_access', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
    comment: 'Whether API access is enabled (Enterprise)',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const columns = [
    'max_opportunities_per_query',
    'max_exchange_pairs',
    'max_analytics_days',
    'max_saved_preferences',
    'max_watchlist_items',
    'max_favorite_coins',
    'max_favorite_exchanges',
    'min_alert_cooldown_seconds',
    'detailed_opportunities',
    'realtime_scanning',
    'funding_view',
    'telegram_alerts',
    'api_access',
  ];

  for (const column of columns) {
    await queryInterface.removeColumn('subscription_plans', column);
  }
}
