import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

// ──────────────────── Types ─────────────────────────────────────────────

export type PaymentStatus =
  'pending' | 'initialized' | 'processing' | 'success' | 'failed' | 'abandoned' | 'reversed';

export type PaymentChannel = 'card' | 'bank_transfer' | 'ussd' | 'qr' | 'mobile_money' | 'bank';

// ──────────────────── Attributes ────────────────────────────────────────

export interface PaymentTransactionAttributes extends BaseModelAttributes {
  user_id: number;
  /** Reference to our internal subscription if this payment is for a subscription. */
  subscription_id: number | null;
  /** Reference to the plan being purchased. */
  plan_id: number;

  // ── Paystack identifiers ────────────────────────────────────────────
  /** Paystack transaction reference (our reference sent to Paystack). */
  paystack_reference: string;
  /** Paystack internal transaction ID (returned after initialization). */
  paystack_transaction_id: number | null;
  /** Paystack customer code (for recurring billing). */
  paystack_customer_code: string | null;
  /** Paystack subscription code (for subscription plans). */
  paystack_subscription_code: string | null;

  // ── Payment details ─────────────────────────────────────────────────
  /** Amount in the smallest currency unit (kobo for NGN, cents for USD). */
  amount: number;
  /** Currency code (e.g. 'NGN', 'USD'). */
  currency: string;
  /** Billing cycle. */
  billing_cycle: 'monthly' | 'yearly';
  /** Payment channel used. */
  channel: PaymentChannel | null;
  /** Payment status. */
  status: PaymentStatus;
  /** Gateway response message. */
  gateway_response: string | null;
  /** Card type (Visa, Mastercard, etc.) — masked. */
  card_type: string | null;
  /** Last 4 digits of card. */
  card_last4: string | null;

  // ── Metadata ────────────────────────────────────────────────────────
  /** IP address of the customer. */
  ip_address: string | null;
  /** Paystack metadata JSON. */
  metadata: Record<string, unknown> | null;
  /** When the payment was initialized. */
  initialized_at: Date;
  /** When the payment was confirmed (webhook or verification). */
  confirmed_at: Date | null;
}

export type PaymentTransactionCreationAttributes = BaseModelCreationAttributes &
  Omit<PaymentTransactionAttributes, 'id' | 'created_at' | 'updated_at' | 'confirmed_at'>;

// ──────────────────── Model ─────────────────────────────────────────────

export class PaymentTransaction extends BaseModel<
  PaymentTransactionAttributes,
  PaymentTransactionCreationAttributes
> {
  public user_id!: number;
  public subscription_id!: number | null;
  public plan_id!: number;
  public paystack_reference!: string;
  public paystack_transaction_id!: number | null;
  public paystack_customer_code!: string | null;
  public paystack_subscription_code!: string | null;
  public amount!: number;
  public currency!: string;
  public billing_cycle!: 'monthly' | 'yearly';
  public channel!: PaymentChannel | null;
  public status!: PaymentStatus;
  public gateway_response!: string | null;
  public card_type!: string | null;
  public card_last4!: string | null;
  public ip_address!: string | null;
  public metadata!: Record<string, unknown> | null;
  public initialized_at!: Date;
  public confirmed_at!: Date | null;

  static initModel(sequelize: Sequelize) {
    return PaymentTransaction.init(
      {
        ...BaseModel.baseColumns,
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
          comment: 'Our unique reference for this transaction',
        },
        paystack_transaction_id: {
          type: DataTypes.BIGINT,
          allowNull: true,
          comment: 'Paystack internal transaction ID',
        },
        paystack_customer_code: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: 'Paystack customer code for recurring billing',
        },
        paystack_subscription_code: {
          type: DataTypes.STRING(100),
          allowNull: true,
          comment: 'Paystack subscription code',
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
          type: DataTypes.ENUM(
            'pending',
            'initialized',
            'processing',
            'success',
            'failed',
            'abandoned',
            'reversed',
          ),
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
      },
      {
        sequelize,
        tableName: 'payment_transactions',
        modelName: 'PaymentTransaction',
        indexes: [
          { fields: ['user_id', 'status'], name: 'idx_paytx_user_status' },
          { fields: ['paystack_reference'], unique: true, name: 'idx_paytx_reference' },
          { fields: ['paystack_transaction_id'], name: 'idx_paytx_gateway_id' },
          { fields: ['paystack_customer_code'], name: 'idx_paytx_customer' },
          { fields: ['status'], name: 'idx_paytx_status' },
          { fields: ['created_at'], name: 'idx_paytx_created' },
        ],
      },
    );
  }
}
