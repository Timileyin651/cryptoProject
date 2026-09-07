import { Op } from 'sequelize';
import { PaymentTransaction, PaymentStatus } from '../models/PaymentTransaction';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Subscription, SubscriptionStatus } from '../models/Subscription';
import { User } from '../models/User';
import { SubscriptionEvent } from '../models/SubscriptionEvent';
import { paystackService, PaystackVerifyResponse } from './PaystackService';
import { subscriptionService } from './SubscriptionService';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── BillingService ───────────────────────────────────

class BillingService {
  // ──────────────────── Plan listing ──────────────────────────────────

  /** List all active plans with current user's subscription status. */
  async listPlansWithStatus(userId: number): Promise<{
    plans: SubscriptionPlan[];
    currentPlan: SubscriptionPlan | null;
    currentSubscription: Subscription | null;
  }> {
    const plans = await SubscriptionPlan.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC']],
    });

    const active = await subscriptionService.getActiveSubscription(userId);

    return {
      plans,
      currentPlan: active?.plan ?? null,
      currentSubscription: active?.subscription ?? null,
    };
  }

  // ──────────────────── Checkout initialization ───────────────────────

  /**
   * Initialize a checkout session.
   * Creates a PaymentTransaction record and returns the Paystack
   * authorization URL for redirect.
   */
  async initializeCheckout(params: {
    userId: number;
    planId: number;
    billingCycle: 'monthly' | 'yearly';
    email: string;
    ipAddress?: string;
  }): Promise<{
    authorizationUrl: string;
    reference: string;
    accessCode: string;
  }> {
    // Validate plan
    const plan = await SubscriptionPlan.findByPk(params.planId);
    if (!plan) throw new NotFoundError('Plan not found');
    if (!plan.is_active) throw new BadRequestError('Plan is not available');

    // Free plan doesn't need payment
    if (plan.slug === 'free') {
      throw new BadRequestError('Free plan does not require payment');
    }

    // Calculate amount
    const amount =
      params.billingCycle === 'yearly' ? Number(plan.price_yearly) : Number(plan.price_monthly);

    const amountSmallest = paystackService.toSmallestUnit(amount);

    // Generate unique reference (idempotency key)
    const reference = paystackService.generateReference(params.userId);

    // Create payment transaction record
    const transaction = await PaymentTransaction.create({
      user_id: params.userId,
      plan_id: params.planId,
      paystack_reference: reference,
      amount: amountSmallest,
      currency: plan.currency || 'NGN',
      billing_cycle: params.billingCycle,
      status: 'pending',
      initialized_at: new Date(),
      ip_address: params.ipAddress ?? null,
      metadata: {
        planSlug: plan.slug,
        planName: plan.name,
        billingCycle: params.billingCycle,
      },
    });

    // Initialize Paystack transaction
    const response = await paystackService.initializeTransaction({
      email: params.email,
      amount: amountSmallest,
      reference,
      currency: plan.currency || 'NGN',
      metadata: {
        transactionId: transaction.id,
        userId: params.userId,
        planId: params.planId,
        planSlug: plan.slug,
        billingCycle: params.billingCycle,
      },
      callbackUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/billing/checkout-result?reference=${reference}`,
    });

    if (!response.status) {
      await transaction.update({ status: 'failed', gateway_response: response.message });
      throw new BadRequestError(`Payment initialization failed: ${response.message}`);
    }

    // Update transaction with Paystack data
    await transaction.update({
      status: 'initialized',
      paystack_transaction_id: response.data.reference as unknown as number,
      gateway_response: 'Transaction initialized',
    });

    return {
      authorizationUrl: response.data.authorization_url,
      reference: response.data.reference,
      accessCode: response.data.access_code,
    };
  }

  // ──────────────────── Payment verification ──────────────────────────

  /**
   * Verify a payment by reference.
   * Only server-side verification unlocks premium — never trust the browser.
   */
  async verifyPayment(
    reference: string,
    userId: number,
  ): Promise<{
    success: boolean;
    message: string;
    subscription?: Subscription;
  }> {
    // Find the transaction
    const transaction = await PaymentTransaction.findOne({
      where: { paystack_reference: reference, user_id: userId },
    });

    if (!transaction) {
      throw new NotFoundError('Transaction not found');
    }

    // If already confirmed, return success (idempotent)
    if (transaction.status === 'success') {
      const subscription = transaction.subscription_id
        ? await Subscription.findByPk(transaction.subscription_id)
        : null;
      return {
        success: true,
        message: 'Payment already confirmed',
        subscription: subscription ?? undefined,
      };
    }

    // Verify with Paystack (authoritative source)
    const response = await paystackService.verifyTransaction(reference);

    if (!response.status) {
      await transaction.update({
        status: 'failed',
        gateway_response: response.message,
      });
      return { success: false, message: response.message };
    }

    const paystackData = response.data;

    // Update transaction with verification data
    await transaction.update({
      status: paystackData.status === 'success' ? 'success' : 'failed',
      paystack_transaction_id: paystackData.id as unknown as number,
      paystack_customer_code: paystackData.customer.customer_code,
      channel: paystackData.channel as any,
      gateway_response: paystackData.gateway_response,
      card_type: paystackData.authorization?.card_type ?? null,
      card_last4: paystackData.authorization?.last4 ?? null,
      confirmed_at: paystackData.status === 'success' ? new Date() : null,
    });

    // If payment failed, return failure
    if (paystackData.status !== 'success') {
      return { success: false, message: paystackData.gateway_response };
    }

    // ── Payment successful — activate subscription ──
    const subscription = await this.activateSubscription(transaction);

    return {
      success: true,
      message: 'Payment confirmed',
      subscription,
    };
  }

  // ──────────────────── Webhook processing ────────────────────────────

  /**
   * Process a Paystack webhook event.
   * This is the primary mechanism for confirming payments.
   * Only server-side webhook confirmation should unlock premium.
   */
  async processWebhook(event: string, data: Record<string, unknown>): Promise<void> {
    logger.info('[Billing] Processing webhook', { event });

    switch (event) {
      case 'charge.success':
        await this.handleChargeSuccess(data);
        break;
      case 'charge.failed':
        await this.handleChargeFailed(data);
        break;
      case 'subscription.create':
        await this.handleSubscriptionCreate(data);
        break;
      case 'subscription.disable':
        await this.handleSubscriptionDisable(data);
        break;
      case 'invoice.payment_failed':
        await this.handlePaymentFailed(data);
        break;
      default:
        logger.info('[Billing] Unhandled webhook event', { event });
    }
  }

  private async handleChargeSuccess(data: Record<string, unknown>): Promise<void> {
    const reference = data.reference as string;
    if (!reference) return;

    const transaction = await PaymentTransaction.findOne({
      where: { paystack_reference: reference },
    });

    if (!transaction) {
      logger.warn('[Billing] Webhook for unknown transaction', { reference });
      return;
    }

    // Idempotent — skip if already confirmed
    if (transaction.status === 'success') {
      logger.info('[Billing] Webhook duplicate — already confirmed', { reference });
      return;
    }

    // Extract customer and authorization data
    const customerData = data.customer as Record<string, unknown> | undefined;
    const authData = data.authorization as Record<string, unknown> | undefined;

    await transaction.update({
      status: 'success',
      paystack_transaction_id: data.id as unknown as number,
      paystack_customer_code: (customerData?.customer_code as string) ?? null,
      channel: data.channel as any,
      gateway_response: (data.gateway_response as string) ?? 'Webhook confirmed',
      card_type: (authData?.card_type as string) ?? null,
      card_last4: (authData?.last4 as string) ?? null,
      confirmed_at: new Date(),
    });

    // Activate subscription
    await this.activateSubscription(transaction);
  }

  private async handleChargeFailed(data: Record<string, unknown>): Promise<void> {
    const reference = data.reference as string;
    if (!reference) return;

    const transaction = await PaymentTransaction.findOne({
      where: { paystack_reference: reference },
    });

    if (transaction) {
      await transaction.update({
        status: 'failed',
        gateway_response: (data.gateway_response as string) ?? 'Payment failed',
      });
    }
  }

  private async handleSubscriptionCreate(data: Record<string, unknown>): Promise<void> {
    const subscriptionCode = data.subscription_code as string;
    const customerCode = (data.customer as Record<string, unknown>)?.customer_code as string;

    if (subscriptionCode) {
      // Update the transaction with subscription code
      await PaymentTransaction.update(
        { paystack_subscription_code: subscriptionCode },
        { where: { paystack_customer_code: customerCode, status: 'success' } },
      );
    }
  }

  private async handleSubscriptionDisable(data: Record<string, unknown>): Promise<void> {
    const subscriptionCode = data.subscription_code as string;
    if (!subscriptionCode) return;

    // Find and cancel the subscription
    const subscription = await Subscription.findOne({
      where: { gateway_subscription_id: subscriptionCode },
    });

    if (subscription && subscription.status === 'active') {
      await subscription.update({
        status: 'cancelled',
        cancelled_at: new Date(),
        cancel_reason: 'Subscription disabled via Paystack',
      });

      await subscriptionService.logEvent(
        subscription.user_id,
        subscription.id,
        'subscription_cancelled',
        { reason: 'webhook_subscription_disable' },
      );
    }
  }

  private async handlePaymentFailed(data: Record<string, unknown>): Promise<void> {
    const reference = data.reference as string;
    if (!reference) return;

    const transaction = await PaymentTransaction.findOne({
      where: { paystack_reference: reference },
    });

    if (transaction) {
      await transaction.update({
        status: 'failed',
        gateway_response: 'Invoice payment failed',
      });

      // Mark subscription as past_due if it exists
      if (transaction.subscription_id) {
        const subscription = await Subscription.findByPk(transaction.subscription_id);
        if (subscription && subscription.status === 'active') {
          await subscription.update({ status: 'past_due' });
        }
      }
    }
  }

  // ──────────────────── Subscription activation ───────────────────────

  /**
   * Activate or renew a subscription after successful payment.
   * This is the ONLY path that should grant premium access.
   */
  private async activateSubscription(transaction: PaymentTransaction): Promise<Subscription> {
    const plan = await SubscriptionPlan.findByPk(transaction.plan_id);
    if (!plan) throw new NotFoundError('Plan not found');

    const now = new Date();
    const periodEnd = new Date(now);
    if (transaction.billing_cycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    // Check for existing active subscription on the same plan
    const existing = await Subscription.findOne({
      where: {
        user_id: transaction.user_id,
        plan_id: transaction.plan_id,
        status: { [Op.in]: ['active', 'past_due'] as SubscriptionStatus[] },
      },
    });

    let subscription: Subscription;

    if (existing) {
      // Extend existing subscription
      const newEnd =
        existing.current_period_end && existing.current_period_end > now
          ? new Date(existing.current_period_end)
          : now;
      if (transaction.billing_cycle === 'monthly') {
        newEnd.setMonth(newEnd.getMonth() + 1);
      } else {
        newEnd.setFullYear(newEnd.getFullYear() + 1);
      }

      await existing.update({
        status: 'active',
        current_period_start: now,
        current_period_end: newEnd,
        renewal_ready: false,
      });

      subscription = existing;

      await subscriptionService.logEvent(transaction.user_id, existing.id, 'subscription_renewed', {
        plan_slug: plan.slug,
        billing_cycle: transaction.billing_cycle,
        paystack_reference: transaction.paystack_reference,
      });
    } else {
      // Create new subscription
      subscription = await Subscription.create({
        user_id: transaction.user_id,
        plan_id: transaction.plan_id,
        status: 'active',
        billing_cycle: transaction.billing_cycle,
        started_at: now,
        current_period_start: now,
        current_period_end: periodEnd,
        renewal_ready: false,
        gateway_subscription_id: transaction.paystack_subscription_code,
      });

      await subscriptionService.logEvent(
        transaction.user_id,
        subscription.id,
        'subscription_created',
        {
          plan_slug: plan.slug,
          billing_cycle: transaction.billing_cycle,
          paystack_reference: transaction.paystack_reference,
        },
      );
    }

    // Link transaction to subscription
    await transaction.update({ subscription_id: subscription.id });

    logger.info('[Billing] Subscription activated', {
      userId: transaction.user_id,
      planSlug: plan.slug,
      subscriptionId: subscription.id,
    });

    return subscription;
  }

  // ──────────────────── Payment history ───────────────────────────────

  /** Get payment history for a user. */
  async getPaymentHistory(
    userId: number,
    options?: { page?: number; limit?: number },
  ): Promise<{ data: PaymentTransaction[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 25, 100);
    const offset = (page - 1) * limit;

    const { rows, count } = await PaymentTransaction.findAndCountAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return { data: rows, total: count };
  }

  /** Get a single payment by ID (must belong to user). */
  async getPayment(userId: number, paymentId: number): Promise<PaymentTransaction> {
    const payment = await PaymentTransaction.findOne({
      where: { id: paymentId, user_id: userId },
    });
    if (!payment) throw new NotFoundError('Payment not found');
    return payment;
  }

  /** Get payment stats for a user. */
  async getPaymentStats(userId: number): Promise<{
    totalPayments: number;
    successfulPayments: number;
    totalSpent: number;
    lastPayment: PaymentTransaction | null;
  }> {
    const [totalPayments, successfulPayments, lastPayment] = await Promise.all([
      PaymentTransaction.count({ where: { user_id: userId } }),
      PaymentTransaction.count({ where: { user_id: userId, status: 'success' } }),
      PaymentTransaction.findOne({
        where: { user_id: userId, status: 'success' },
        order: [['confirmed_at', 'DESC']],
      }),
    ]);

    // Sum successful payments
    const result = await PaymentTransaction.sum('amount', {
      where: { user_id: userId, status: 'success' },
    });
    const totalSpent = result || 0;

    return { totalPayments, successfulPayments, totalSpent, lastPayment };
  }

  // ──────────────────── Subscription management ───────────────────────

  /** Cancel a user's subscription. */
  async cancelSubscription(userId: number, reason?: string): Promise<Subscription> {
    return subscriptionService.cancelSubscription(userId, reason);
  }

  /** Get the current subscription for a user. */
  async getCurrentSubscription(userId: number): Promise<{
    subscription: Subscription | null;
    plan: SubscriptionPlan | null;
  }> {
    const active = await subscriptionService.getActiveSubscription(userId);
    return {
      subscription: active?.subscription ?? null,
      plan: active?.plan ?? null,
    };
  }
}

export const billingService = new BillingService();
export { BillingService };
