import { Request, Response, NextFunction } from 'express';
import { Op } from 'sequelize';
import { User, UserRole } from '../models/User';
import { AuditLog } from '../models/AuditLog';
import { SubscriptionPlan } from '../models/SubscriptionPlan';
import { Subscription } from '../models/Subscription';
import { PaymentTransaction } from '../models/PaymentTransaction';
import { Exchange } from '../models/Exchange';
import { Coin } from '../models/Coin';
import { Network } from '../models/Network';
import { ExchangeCoin } from '../models/ExchangeCoin';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { Alert } from '../models/Alert';
import { Notification } from '../models/Notification';
import { FeatureEntitlement } from '../models/FeatureEntitlement';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logAuditAction, getAuditContext } from '../middleware/adminGuard';

// ──────────────────── AdminController ─────────────────────────────────

export class AdminController {
  // ═══════════════════════════════════════════════════════════════════
  //  USERS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/users */
  async listUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, search, role, isActive } = req.query;
      const where: Record<string, unknown> = {};
      if (search) {
        // Escape LIKE wildcards to prevent injection
        const escaped = String(search).replace(/[%_]/g, (m) => `\\${m}`);
        where.email = { [Op.like]: `%${escaped}%` };
      }
      if (role) {
        const validRoles = ['user', 'admin', 'superadmin'];
        if (validRoles.includes(role as string)) where.role = role;
      }
      if (isActive !== undefined) where.is_active = isActive === 'true';

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await User.findAndCountAll({
        where,
        attributes: { exclude: ['password_hash'] },
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /admin/users/:id */
  async getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await User.findByPk(parseInt(req.params.id, 10), {
        attributes: { exclude: ['password_hash'] },
      });
      if (!user) throw new NotFoundError('User not found');
      res.status(200).json({ data: user });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /admin/users/:id */
  async updateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const targetId = parseInt(req.params.id, 10);
      const user = await User.findByPk(targetId);
      if (!user) throw new NotFoundError('User not found');

      const ctx = getAuditContext(req);
      const actorRole = (req as any).userRole as string;
      const before = { email: user.email, role: user.role, is_active: user.is_active };

      const { role, isActive, firstName, lastName } = req.body;
      const updates: Record<string, unknown> = {};

      // ── Role validation ──────────────────────────────────────────
      if (role !== undefined) {
        const validRoles = ['user', 'admin', 'superadmin'];
        if (!validRoles.includes(role)) {
          throw new BadRequestError(`Invalid role: ${role}`);
        }
        // Only superadmin can assign superadmin
        if (role === 'superadmin' && actorRole !== 'superadmin') {
          throw new BadRequestError('Only superadmin can assign superadmin role');
        }
        // Prevent admin from elevating themselves
        if (
          targetId === req.user!.userId &&
          role !== before.role &&
          validRoles.indexOf(role) > validRoles.indexOf(before.role)
        ) {
          throw new BadRequestError('Cannot elevate your own role');
        }
        updates.role = role;
      }

      if (isActive !== undefined) updates.is_active = isActive;
      if (firstName !== undefined) updates.first_name = firstName;
      if (lastName !== undefined) updates.last_name = lastName;

      // Prevent deactivating yourself
      if (isActive === false && targetId === req.user!.userId) {
        throw new BadRequestError('Cannot deactivate your own account');
      }

      if (Object.keys(updates).length > 0) {
        await user.update(updates);
      }

      await logAuditAction({
        ...ctx,
        action: role !== undefined ? 'user.role_change' : 'user.update',
        resourceType: 'user',
        resourceId: user.id,
        changes: { before, after: updates },
      });

      res.status(200).json({ data: { ...user.toJSON(), password_hash: undefined } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/users/:id/deactivate */
  async deactivateUser(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const user = await User.findByPk(parseInt(req.params.id, 10));
      if (!user) throw new NotFoundError('User not found');
      if (user.role === 'superadmin') throw new BadRequestError('Cannot deactivate superadmin');

      const ctx = getAuditContext(req);
      await user.update({ is_active: false });
      await logAuditAction({
        ...ctx,
        action: 'user.deactivate',
        resourceType: 'user',
        resourceId: user.id,
      });
      res.status(200).json({ message: 'User deactivated' });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PLANS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/plans */
  async listPlans(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plans = await SubscriptionPlan.findAll({ order: [['sort_order', 'ASC']] });
      res.status(200).json({ data: plans });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/plans */
  async createPlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { slug, name, description, priceMonthly, priceYearly, currency } = req.body;
      if (!slug || !name) throw new BadRequestError('slug and name are required');
      // Validate slug format
      if (!/^[a-z0-9]([a-z0-9-]{0,48}[a-z0-9])$/.test(slug)) {
        throw new BadRequestError('Slug must be lowercase alphanumeric with hyphens, 2-50 chars');
      }

      const plan = await SubscriptionPlan.create({
        slug,
        name,
        description: description ?? null,
        price_monthly: priceMonthly ?? 0,
        price_yearly: priceYearly ?? 0,
        currency: currency ?? 'NGN',
        is_active: true,
        sort_order: 0,
        max_scans_per_day: null,
        max_alerts: null,
        max_portfolios: null,
        max_exchanges_connected: null,
        rate_limit_per_minute: 60,
        data_retention_days: 30,
        max_opportunities_per_query: 25,
        max_exchange_pairs: 3,
        max_analytics_days: 7,
        max_saved_preferences: 3,
        max_watchlist_items: 10,
        max_favorite_coins: 5,
        max_favorite_exchanges: 2,
        min_alert_cooldown_seconds: 7200,
        detailed_opportunities: false,
        realtime_scanning: false,
        funding_view: false,
        telegram_alerts: false,
        api_access: false,
      });

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'plan.create',
        resourceType: 'plan',
        resourceId: plan.id,
        changes: plan.toJSON() as unknown as Record<string, unknown>,
      });
      res.status(201).json({ data: plan });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /admin/plans/:id */
  async updatePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const plan = await SubscriptionPlan.findByPk(parseInt(req.params.id, 10));
      if (!plan) throw new NotFoundError('Plan not found');

      const before = plan.toJSON();
      const allowed = [
        'name',
        'description',
        'price_monthly',
        'price_yearly',
        'currency',
        'is_active',
        'sort_order',
        'max_scans_per_day',
        'max_alerts',
        'max_portfolios',
        'max_exchanges_connected',
        'rate_limit_per_minute',
        'data_retention_days',
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
      const updates: Record<string, unknown> = {};
      for (const key of allowed) {
        if (req.body[key] !== undefined) updates[key] = req.body[key];
      }
      if (Object.keys(updates).length > 0) await plan.update(updates);

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'plan.update',
        resourceType: 'plan',
        resourceId: plan.id,
        changes: { before, after: updates },
      });
      res.status(200).json({ data: plan });
    } catch (error) {
      next(error);
    }
  }

  /** GET /admin/plans/:id/entitlements */
  async listEntitlements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planId = parseInt(req.params.id, 10);
      const entitlements = await FeatureEntitlement.findAll({ where: { plan_id: planId } });
      res.status(200).json({ data: entitlements });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /admin/plans/:id/entitlements */
  async updateEntitlements(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const planId = parseInt(req.params.id, 10);
      const { entitlements } = req.body;
      if (!Array.isArray(entitlements)) throw new BadRequestError('entitlements array required');

      for (const ent of entitlements) {
        await FeatureEntitlement.upsert({
          plan_id: planId,
          feature_key: ent.featureKey,
          is_enabled: ent.isEnabled,
          limit_value: ent.limitValue ?? null,
        });
      }

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'plan.update',
        resourceType: 'plan',
        resourceId: planId,
        changes: { entitlements },
      });
      res.status(200).json({ message: 'Entitlements updated' });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SUBSCRIPTIONS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/subscriptions */
  async listSubscriptions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, status, userId } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (userId) where.user_id = parseInt(userId as string, 10);

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await Subscription.findAndCountAll({
        where,
        include: [
          { model: SubscriptionPlan, as: 'plan' },
          { model: User, as: 'user', attributes: ['id', 'email', 'first_name', 'last_name'] },
        ],
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/subscriptions/:id/override */
  async overrideSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const sub = await Subscription.findByPk(parseInt(req.params.id, 10));
      if (!sub) throw new NotFoundError('Subscription not found');

      const ctx = getAuditContext(req);
      const before = { status: sub.status, period_end: sub.current_period_end };

      const { status, extendDays } = req.body;
      const updates: Record<string, unknown> = {};
      if (status) updates.status = status;
      if (extendDays) {
        const newEnd = new Date(sub.current_period_end || new Date());
        newEnd.setDate(newEnd.getDate() + extendDays);
        updates.current_period_end = newEnd;
      }
      if (Object.keys(updates).length > 0) await sub.update(updates);

      await logAuditAction({
        ...ctx,
        action: 'subscription.override',
        resourceType: 'subscription',
        resourceId: sub.id,
        changes: { before, after: updates },
      });
      res.status(200).json({ data: sub });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  PAYMENTS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/payments */
  async listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, status, userId } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (userId) where.user_id = parseInt(userId as string, 10);

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await PaymentTransaction.findAndCountAll({
        where,
        include: [{ model: User, as: 'user', attributes: ['id', 'email'] }],
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/payments/:id/override */
  async overridePayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const tx = await PaymentTransaction.findByPk(parseInt(req.params.id, 10));
      if (!tx) throw new NotFoundError('Payment not found');

      const ctx = getAuditContext(req);
      const before = { status: tx.status };
      const { status } = req.body;
      if (status) await tx.update({ status });

      await logAuditAction({
        ...ctx,
        action: 'payment.override',
        resourceType: 'payment',
        resourceId: tx.id,
        changes: { before, after: { status } },
      });
      res.status(200).json({ data: tx });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  EXCHANGES
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/exchanges */
  async listExchanges(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchanges = await Exchange.findAll({ order: [['name', 'ASC']] });
      res.status(200).json({ data: exchanges });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/exchanges */
  async createExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, slug, supportsSpot, supportsFutures, supportsWebsocket, country } = req.body;
      if (!name || !slug) throw new BadRequestError('name and slug are required');

      const exchange = await Exchange.create({
        name,
        slug,
        is_active: true,
        supports_spot: supportsSpot ?? true,
        supports_futures: supportsFutures ?? false,
        supports_margin: false,
        supports_websocket: supportsWebsocket ?? false,
        country: country ?? null,
      });

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'exchange.create',
        resourceType: 'exchange',
        resourceId: exchange.id,
        changes: exchange.toJSON() as unknown as Record<string, unknown>,
      });
      res.status(201).json({ data: exchange });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /admin/exchanges/:id */
  async updateExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchange = await Exchange.findByPk(parseInt(req.params.id, 10));
      if (!exchange) throw new NotFoundError('Exchange not found');

      const before = exchange.toJSON();
      const { name, supportsSpot, supportsFutures, supportsWebsocket, isActive, country } =
        req.body;
      const updates: Record<string, unknown> = {};
      if (name !== undefined) updates.name = name;
      if (supportsSpot !== undefined) updates.supports_spot = supportsSpot;
      if (supportsFutures !== undefined) updates.supports_futures = supportsFutures;
      if (supportsWebsocket !== undefined) updates.supports_websocket = supportsWebsocket;
      if (isActive !== undefined) updates.is_active = isActive;
      if (country !== undefined) updates.country = country;
      if (Object.keys(updates).length > 0) await exchange.update(updates);

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'exchange.update',
        resourceType: 'exchange',
        resourceId: exchange.id,
        changes: { before, after: updates },
      });
      res.status(200).json({ data: exchange });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/exchanges/:id/deactivate */
  async deactivateExchange(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const exchange = await Exchange.findByPk(parseInt(req.params.id, 10));
      if (!exchange) throw new NotFoundError('Exchange not found');

      const ctx = getAuditContext(req);
      await exchange.update({ is_active: false });
      await logAuditAction({
        ...ctx,
        action: 'exchange.deactivate',
        resourceType: 'exchange',
        resourceId: exchange.id,
      });
      res.status(200).json({ message: 'Exchange deactivated' });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  COINS & NETWORKS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/coins */
  async listCoins(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const coins = await Coin.findAll({ order: [['symbol', 'ASC']] });
      res.status(200).json({ data: coins });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/coins */
  async createCoin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { symbol, name } = req.body;
      if (!symbol) throw new BadRequestError('symbol is required');
      const coin = await Coin.create({
        symbol,
        name: name ?? null,
        slug: symbol.toLowerCase(),
        is_active: true,
        decimals: 8,
      } as any);

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'coin.create',
        resourceType: 'coin',
        resourceId: coin.id,
        changes: coin.toJSON() as unknown as Record<string, unknown>,
      });
      res.status(201).json({ data: coin });
    } catch (error) {
      next(error);
    }
  }

  /** GET /admin/networks */
  async listNetworks(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const networks = await Network.findAll({ order: [['name', 'ASC']] });
      res.status(200).json({ data: networks });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/networks */
  async createNetwork(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { name, chainId, nativeCurrencyId } = req.body;
      if (!name) throw new BadRequestError('name is required');
      const network = await Network.create({
        name,
        slug: name.toLowerCase(),
        chain_id: chainId ?? null,
        native_currency_id: nativeCurrencyId ?? null,
        is_active: true,
      } as any);

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'network.create',
        resourceType: 'network',
        resourceId: network.id,
        changes: network.toJSON() as unknown as Record<string, unknown>,
      });
      res.status(201).json({ data: network });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  OPPORTUNITIES
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/opportunities */
  async listOpportunities(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, status, type } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (type) where.opportunity_type = type;

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await OpportunityRecord.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /admin/opportunities/:id */
  async deleteOpportunity(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const opp = await OpportunityRecord.findByPk(parseInt(req.params.id, 10));
      if (!opp) throw new NotFoundError('Opportunity not found');
      await opp.destroy();

      const ctx = getAuditContext(req);
      await logAuditAction({
        ...ctx,
        action: 'opportunity.delete',
        resourceType: 'opportunity',
        resourceId: parseInt(req.params.id, 10),
      });
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  ALERTS & NOTIFICATIONS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/alerts */
  async listAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, status, userId } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (userId) where.user_id = parseInt(userId as string, 10);

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await Alert.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/alerts/:id/force-disable */
  async forceDisableAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const alert = await Alert.findByPk(parseInt(req.params.id, 10));
      if (!alert) throw new NotFoundError('Alert not found');

      const ctx = getAuditContext(req);
      await alert.update({ is_enabled: false, status: 'paused' });
      await logAuditAction({
        ...ctx,
        action: 'alert.force_disable',
        resourceType: 'alert',
        resourceId: alert.id,
      });
      res.status(200).json({ message: 'Alert force-disabled' });
    } catch (error) {
      next(error);
    }
  }

  /** GET /admin/notifications */
  async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 25, status, channel } = req.query;
      const where: Record<string, unknown> = {};
      if (status) where.status = status;
      if (channel) where.channel = channel;

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 25, 100);
      const { rows, count } = await Notification.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** POST /admin/notifications/retry-failed */
  async retryFailedNotifications(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const failed = await Notification.findAll({ where: { status: 'failed' }, limit: 100 });
      let retried = 0;
      for (const n of failed) {
        await n.update({ status: 'retrying', attempt_count: n.attempt_count + 1 });
        retried++;
      }

      const ctx = getAuditContext(_req);
      await logAuditAction({
        ...ctx,
        action: 'notification.retry_all',
        resourceType: 'notification',
        changes: { retried },
      });
      res.status(200).json({ message: `${retried} notifications queued for retry` });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  SETTINGS (placeholder — extends as needed)
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/settings */
  async getSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      // Placeholder — in production, read from a settings table or config
      res.status(200).json({ data: { scannerInterval: 5000, maxBookAge: 10000, tradeSize: 1.0 } });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /admin/settings */
  async updateSettings(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const ctx = getAuditContext(_req);
      await logAuditAction({
        ...ctx,
        action: 'settings.update',
        resourceType: 'settings',
        changes: _req.body as Record<string, unknown>,
      });
      res.status(200).json({ message: 'Settings updated' });
    } catch (error) {
      next(error);
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  //  AUDIT LOGS
  // ═══════════════════════════════════════════════════════════════════

  /** GET /admin/logs */
  async listAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { page = 1, limit = 50, action, actorId, resourceType, since } = req.query;
      const where: Record<string, unknown> = {};
      if (action) where.action = action;
      if (actorId) where.actor_id = parseInt(actorId as string, 10);
      if (resourceType) where.resource_type = resourceType;
      if (since) where.created_at = { [Op.gte]: new Date(since as string) };

      const p = parseInt(page as string, 10) || 1;
      const l = Math.min(parseInt(limit as string, 10) || 50, 200);
      const { rows, count } = await AuditLog.findAndCountAll({
        where,
        order: [['created_at', 'DESC']],
        limit: l,
        offset: (p - 1) * l,
      });
      res.status(200).json({ data: rows, pagination: { total: count, page: p, limit: l } });
    } catch (error) {
      next(error);
    }
  }

  /** GET /admin/logs/stats */
  async getAuditStats(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const totalLogs = await AuditLog.count();
      const failedActions = await AuditLog.count({ where: { success: false } });
      const recentActions = await AuditLog.findAll({ order: [['created_at', 'DESC']], limit: 10 });
      res.status(200).json({ data: { totalLogs, failedActions, recentActions } });
    } catch (error) {
      next(error);
    }
  }
}

export const adminController = new AdminController();
