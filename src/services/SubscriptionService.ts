import { Op } from 'sequelize';
import { sequelize } from '../config/database';
import { User } from '../models/User';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Subscription, SubscriptionStatus } from '../models/Subscription';
import { FeatureEntitlement } from '../models/FeatureEntitlement';
import { SubscriptionEvent } from '../models/SubscriptionEvent';
import { NotFoundError, ForbiddenError } from '../utils/errors';

// ── Cached feature access result ──
export interface FeatureAccess {
  allowed: boolean;
  limit: number | null; // null = unlimited
  used: number;
  remaining: number | null;
}

class SubscriptionService {
  // ──────────────────────────── Plan queries ────────────────────────────

  /** Return all active plans ordered by sort_order. */
  async listPlans(): Promise<SubscriptionPlan[]> {
    return SubscriptionPlan.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC']],
    });
  }

  /** Get a plan by slug (e.g. 'free', 'basic', 'pro', 'enterprise'). */
  async getPlanBySlug(slug: string): Promise<SubscriptionPlan> {
    const plan = await SubscriptionPlan.findOne({ where: { slug } });
    if (!plan) throw new NotFoundError(`Plan '${slug}' not found`);
    return plan;
  }

  /** Get a single plan by id. */
  async getPlanById(id: number): Promise<SubscriptionPlan> {
    const plan = await SubscriptionPlan.findByPk(id);
    if (!plan) throw new NotFoundError(`Plan #${id} not found`);
    return plan;
  }

  // ──────────────────────── Subscription lifecycle ──────────────────────

  /**
   * Resolve the *active* subscription for a user, returning the
   * subscription together with its plan. Returns null when no active
   * subscription exists (user is on the implicit Free tier).
   */
  async getActiveSubscription(
    userId: number,
  ): Promise<{ subscription: Subscription; plan: SubscriptionPlan } | null> {
    const subscription = await Subscription.findOne({
      where: {
        user_id: userId,
        status: { [Op.in]: ['active', 'past_due'] as SubscriptionStatus[] },
      },
      include: [{ model: SubscriptionPlan, as: 'plan' }],
      order: [['created_at', 'DESC']],
    });

    if (!subscription) return null;

    const plan = (subscription as any).plan as SubscriptionPlan;
    return { subscription, plan };
  }

  /**
   * Resolve the effective plan for a user.
   * Falls back to the 'free' plan when no active subscription exists.
   */
  async resolvePlan(userId: number): Promise<SubscriptionPlan> {
    const active = await this.getActiveSubscription(userId);
    if (active) return active.plan;
    return this.getPlanBySlug('free');
  }

  // ────────────────────── Feature gating ────────────────────────────────

  /**
   * Check whether a user has a specific feature enabled on their
   * current plan and return the usage context.
   */
  async checkFeature(
    userId: number,
    featureKey: string,
    currentUsage?: number,
  ): Promise<FeatureAccess> {
    const plan = await this.resolvePlan(userId);

    const entitlement = await FeatureEntitlement.findOne({
      where: { plan_id: plan.id, feature_key: featureKey },
    });

    if (!entitlement || !entitlement.is_enabled) {
      return { allowed: false, limit: null, used: currentUsage ?? 0, remaining: null };
    }

    const limit = entitlement.limit_value;
    const used = currentUsage ?? 0;

    if (limit === null) {
      return { allowed: true, limit: null, used, remaining: null };
    }

    return {
      allowed: used < limit,
      limit,
      used,
      remaining: Math.max(0, limit - used),
    };
  }

  /**
   * Convenience guard – throws ForbiddenError when feature is not available.
   */
  async requireFeature(
    userId: number,
    featureKey: string,
    currentUsage?: number,
  ): Promise<FeatureAccess> {
    const access = await this.checkFeature(userId, featureKey, currentUsage);
    if (!access.allowed) {
      throw new ForbiddenError(`Feature '${featureKey}' is not available on your current plan.`);
    }
    return access;
  }

  // ──────────────────── Subscription mutations ──────────────────────────

  /** Create a new subscription for a user. */
  async createSubscription(
    userId: number,
    planSlug: string,
    billingCycle: 'monthly' | 'yearly' = 'monthly',
  ): Promise<Subscription> {
    const plan = await this.getPlanBySlug(planSlug);

    const now = new Date();
    const periodEnd = new Date(now);
    if (billingCycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    const subscription = await Subscription.create({
      user_id: userId,
      plan_id: plan.id,
      status: 'active',
      billing_cycle: billingCycle,
      started_at: now,
      current_period_start: now,
      current_period_end: periodEnd,
      renewal_ready: false,
    });

    await this.logEvent(userId, subscription.id, 'subscription_created', {
      plan_id: plan.id,
      plan_slug: plan.slug,
      billing_cycle: billingCycle,
    });

    return subscription;
  }

  /** Cancel a user's active subscription. */
  async cancelSubscription(userId: number, reason?: string): Promise<Subscription> {
    const active = await this.getActiveSubscription(userId);
    if (!active) throw new NotFoundError('No active subscription to cancel');

    const { subscription } = active;

    await subscription.update({
      status: 'cancelled',
      cancelled_at: new Date(),
      cancel_reason: reason ?? null,
      renewal_ready: false,
    });

    await this.logEvent(userId, subscription.id, 'subscription_cancelled', {
      reason,
    });

    return subscription;
  }

  /**
   * Mark a subscription as renewed (e.g. when a webhook confirms payment).
   * Resets the period window and sets renewal_ready back to false.
   */
  async renewSubscription(subscriptionId: number): Promise<Subscription> {
    const subscription = await Subscription.findByPk(subscriptionId);
    if (!subscription) throw new NotFoundError('Subscription not found');

    const now = new Date();
    const periodEnd = new Date(now);
    if (subscription.billing_cycle === 'monthly') {
      periodEnd.setMonth(periodEnd.getMonth() + 1);
    } else {
      periodEnd.setFullYear(periodEnd.getFullYear() + 1);
    }

    await subscription.update({
      status: 'active',
      current_period_start: now,
      current_period_end: periodEnd,
      renewal_ready: false,
    });

    await this.logEvent(subscription.user_id, subscription.id, 'subscription_renewed', {
      new_period_end: periodEnd,
    });

    return subscription;
  }

  /** Expire overdue subscriptions (called by a cron job). */
  async expireOverdueSubscriptions(): Promise<number> {
    const [updated] = await Subscription.update(
      { status: 'expired' },
      {
        where: {
          status: { [Op.in]: ['active', 'past_due'] as SubscriptionStatus[] },
          current_period_end: { [Op.lt]: new Date() },
          renewal_ready: false,
        },
      },
    );

    return updated;
  }

  // ────────────────────── Usage helpers ──────────────────────────────────

  /**
   * Read a plan-level usage limit. Returns null for unlimited.
   */
  async getPlanLimit(userId: number, limitKey: string): Promise<number | null> {
    const plan = await this.resolvePlan(userId);
    const val = (plan as any)[limitKey];
    return typeof val === 'number' ? val : null;
  }

  // ──────────────────── Event logging ───────────────────────────────────

  async logEvent(
    userId: number,
    subscriptionId: number | null,
    eventType: string,
    payload?: Record<string, unknown>,
  ): Promise<SubscriptionEvent> {
    return SubscriptionEvent.create({
      user_id: userId,
      subscription_id: subscriptionId,
      event_type: eventType,
      payload: payload ?? null,
    });
  }

  /**
   * Retrieve event history for a user, most recent first.
   */
  async getUserEvents(userId: number, limit = 50): Promise<SubscriptionEvent[]> {
    return SubscriptionEvent.findAll({
      where: { user_id: userId },
      order: [['created_at', 'DESC']],
      limit,
    });
  }
}

export const subscriptionService = new SubscriptionService();
export { SubscriptionService };
