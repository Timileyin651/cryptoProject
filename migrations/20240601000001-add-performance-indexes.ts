import { QueryInterface, DataTypes } from 'sequelize';

/**
 * Add performance indexes for the most-queried columns.
 *
 * These indexes target the hot paths:
 * - Notification dedup + rate limiting
 * - Alert evaluation queries
 * - Subscription active lookup
 * - Payment webhook resolution
 * - Audit log filtering
 * - Token blacklist checks
 */
export async function up(queryInterface: QueryInterface): Promise<void> {
  // ── Notifications ──────────────────────────────────────────────────
  // Note: idx_notifications_dedup on dedup_key already exists from create-alert-tables.
  // Skipping redundant dedup index.

  // Rate limit count: COUNT WHERE user_id = ? AND status IN (...) AND last_attempt_at >= ?
  await queryInterface.addIndex('notifications', ['user_id', 'status', 'last_attempt_at'], {
    name: 'idx_notifications_rate_limit',
  });

  // List query: user_id + created_at
  await queryInterface.addIndex('notifications', ['user_id', 'created_at'], {
    name: 'idx_notifications_user_created',
  });

  // Retry query: status = 'failed' AND attempt_count < max_attempts
  await queryInterface.addIndex('notifications', ['status', 'attempt_count'], {
    name: 'idx_notifications_retry',
  });

  // ── Alerts ─────────────────────────────────────────────────────────
  // Active alert evaluation: is_enabled = true AND status = 'active'
  await queryInterface.addIndex('alerts', ['is_enabled', 'status'], {
    name: 'idx_alerts_active',
  });

  // User alert listing: user_id + status + is_enabled
  // Note: idx_alerts_user_status on (user_id, status) already exists from create-alert-tables.
  // This is a wider 3-column index with a distinct name.
  await queryInterface.addIndex('alerts', ['user_id', 'status', 'is_enabled'], {
    name: 'idx_alerts_user_status_enabled',
  });

  // ── Subscriptions ──────────────────────────────────────────────────
  // Active subscription lookup: user_id + status
  await queryInterface.addIndex('subscriptions', ['user_id', 'status'], {
    name: 'idx_subscriptions_user_active',
  });

  // Gateway subscription lookup: gateway_subscription_id
  await queryInterface.addIndex('subscriptions', ['gateway_subscription_id'], {
    name: 'idx_subscriptions_gateway',
    where: { gateway_subscription_id: { [Symbol.for('ne')]: null } } as any,
  });

  // ── Subscription Events ────────────────────────────────────────────
  // Event history: user_id + created_at DESC
  await queryInterface.addIndex('subscription_events', ['user_id', 'created_at'], {
    name: 'idx_subscription_events_user_created',
  });

  // ── Payment Transactions ───────────────────────────────────────────
  // Webhook lookup: paystack_reference
  await queryInterface.addIndex('payment_transactions', ['paystack_reference'], {
    name: 'idx_payment_transactions_reference',
  });

  // Payment stats: user_id + status
  await queryInterface.addIndex('payment_transactions', ['user_id', 'status'], {
    name: 'idx_payment_transactions_user_status',
  });

  // User payment listing: user_id + created_at
  await queryInterface.addIndex('payment_transactions', ['user_id', 'created_at'], {
    name: 'idx_payment_transactions_user_created',
  });

  // ── Audit Logs ─────────────────────────────────────────────────────
  // Log filtering: action + created_at
  await queryInterface.addIndex('audit_logs', ['action', 'created_at'], {
    name: 'idx_audit_logs_action_created',
  });

  // Actor filtering: actor_id + created_at
  await queryInterface.addIndex('audit_logs', ['actor_id', 'created_at'], {
    name: 'idx_audit_logs_actor_created',
  });

  // Resource filtering: resource_type + resource_id
  await queryInterface.addIndex('audit_logs', ['resource_type', 'resource_id'], {
    name: 'idx_audit_logs_resource',
  });

  // ── Refresh Tokens ─────────────────────────────────────────────────
  // token_hash (unique) and expires_at indexes already created by
  // create-refresh-tokens migration — skipping to avoid duplicates.

  // ── Exchange Coins ─────────────────────────────────────────────────
  // Lookup: exchange_id + coin_id
  await queryInterface.addIndex('exchange_coins', ['exchange_id', 'coin_id'], {
    name: 'idx_exchange_coins_lookup',
  });
}

export async function down(queryInterface: QueryInterface): Promise<void> {
  const indexes = [
    { table: 'notifications', name: 'idx_notifications_rate_limit' },
    { table: 'notifications', name: 'idx_notifications_user_created' },
    { table: 'notifications', name: 'idx_notifications_retry' },
    { table: 'alerts', name: 'idx_alerts_active' },
    { table: 'alerts', name: 'idx_alerts_user_status_enabled' },
    { table: 'subscriptions', name: 'idx_subscriptions_user_active' },
    { table: 'subscriptions', name: 'idx_subscriptions_gateway' },
    { table: 'subscription_events', name: 'idx_subscription_events_user_created' },
    { table: 'payment_transactions', name: 'idx_payment_transactions_reference' },
    { table: 'payment_transactions', name: 'idx_payment_transactions_user_status' },
    { table: 'payment_transactions', name: 'idx_payment_transactions_user_created' },
    { table: 'audit_logs', name: 'idx_audit_logs_action_created' },
    { table: 'audit_logs', name: 'idx_audit_logs_actor_created' },
    { table: 'audit_logs', name: 'idx_audit_logs_resource' },
    { table: 'exchange_coins', name: 'idx_exchange_coins_lookup' },
  ];

  for (const { table, name } of indexes) {
    try {
      await queryInterface.removeIndex(table, name);
    } catch {
      // Index may not exist
    }
  }
}
