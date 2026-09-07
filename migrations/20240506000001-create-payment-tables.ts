import { QueryInterface, DataTypes } from 'sequelize';

export default {
  async up(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.createTable('payment_transactions', {
      id: {
        type: DataTypes.INTEGER,
        autoIncrement: true,
        primaryKey: true,
      },
      user_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      subscription_id: {
        type: DataTypes.INTEGER,
        allowNull: true,
        references: { model: 'subscriptions', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      plan_id: {
        type: DataTypes.INTEGER,
        allowNull: false,
        references: { model: 'subscription_plans', key: 'id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      paystack_reference: {
        type: DataTypes.STRING(100),
        allowNull: false,
        unique: true,
      },
      paystack_transaction_id: {
        type: DataTypes.BIGINT,
        allowNull: true,
      },
      paystack_customer_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      paystack_subscription_code: {
        type: DataTypes.STRING(100),
        allowNull: true,
      },
      amount: {
        type: DataTypes.INTEGER,
        allowNull: false,
        comment: 'Amount in smallest currency unit (kobo/cents)',
      },
      currency: {
        type: DataTypes.STRING(3),
        allowNull: false,
        defaultValue: 'NGN',
      },
      billing_cycle: {
        type: DataTypes.ENUM('monthly', 'yearly'),
        allowNull: false,
      },
      channel: {
        type: DataTypes.ENUM('card', 'bank_transfer', 'ussd', 'qr', 'mobile_money', 'bank'),
        allowNull: true,
      },
      status: {
        type: DataTypes.ENUM('pending', 'initialized', 'processing', 'success', 'failed', 'abandoned', 'reversed'),
        allowNull: false,
        defaultValue: 'pending',
      },
      gateway_response: {
        type: DataTypes.STRING(500),
        allowNull: true,
      },
      card_type: {
        type: DataTypes.STRING(50),
        allowNull: true,
      },
      card_last4: {
        type: DataTypes.STRING(4),
        allowNull: true,
      },
      ip_address: {
        type: DataTypes.STRING(45),
        allowNull: true,
      },
      metadata: {
        type: DataTypes.JSON,
        allowNull: true,
      },
      initialized_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      confirmed_at: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      created_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
      updated_at: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW,
      },
    });

    await queryInterface.addIndex('payment_transactions', ['user_id', 'status'], { name: 'idx_paytx_user_status' });
    await queryInterface.addIndex('payment_transactions', ['paystack_reference'], { unique: true, name: 'idx_paytx_reference' });
    await queryInterface.addIndex('payment_transactions', ['paystack_transaction_id'], { name: 'idx_paytx_gateway_id' });
    await queryInterface.addIndex('payment_transactions', ['paystack_customer_code'], { name: 'idx_paytx_customer' });
    await queryInterface.addIndex('payment_transactions', ['status'], { name: 'idx_paytx_status' });
    await queryInterface.addIndex('payment_transactions', ['created_at'], { name: 'idx_paytx_created' });
  },

  async down(queryInterface: QueryInterface): Promise<void> {
    await queryInterface.dropTable('payment_transactions');
  },
};
