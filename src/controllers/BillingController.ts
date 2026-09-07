import { Request, Response, NextFunction } from 'express';
import { billingService } from '../services/BillingService';
import { paystackService } from '../services/PaystackService';
import { config } from '../config';
import { logger } from '../utils/logger';
import { metrics, METRICS } from '../utils/metrics';

export class BillingController {
  // ──────────────────── Plans ─────────────────────────────────────────

  // ──────────────────── API: Plan listing ─────────────────────────────

  /** GET /api/v1/billing/plans */
  async listPlans(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await billingService.listPlansWithStatus(userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Checkout initialization ───────────────────────

  /** POST /api/v1/billing/checkout */
  async initializeCheckout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { planId, billingCycle } = req.body;
      if (!planId || typeof planId !== 'number') {
        res.status(400).json({ error: 'planId (number) is required' });
        return;
      }

      // Get user email from the request (attached by auth middleware)
      const user = (req as any).user;
      const email = user?.email;
      if (!email) {
        res.status(400).json({ error: 'User email not found' });
        return;
      }

      const result = await billingService.initializeCheckout({
        userId,
        planId,
        billingCycle: billingCycle || 'monthly',
        email,
        ipAddress: req.ip,
      });

      res.status(200).json({
        data: {
          authorizationUrl: result.authorizationUrl,
          reference: result.reference,
          accessCode: result.accessCode,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Payment verification ──────────────────────────

  /** GET /api/v1/billing/verify/:reference */
  async verifyPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { reference } = req.params;
      if (!reference) {
        res.status(400).json({ error: 'Reference is required' });
        return;
      }

      const result = await billingService.verifyPayment(reference, userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Checkout result page ──────────────────────────

  // ──────────────────── Webhook (no auth — verified by signature) ────

  /** POST /api/v1/billing/webhook — Paystack webhook endpoint */
  async handleWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
    const webhookStart = Date.now();
    try {
      // Get raw body for signature verification
      const rawBody = (req as any).rawBody;
      const signature = req.headers['x-paystack-signature'] as string;

      logger.info('[Billing] Webhook received', {
        ip: req.ip,
        userAgent: req.headers['user-agent'],
        contentType: req.headers['content-type'],
        hasSignature: !!signature,
        hasRawBody: !!rawBody,
      });

      // Always require signature verification — fail closed
      if (!rawBody || !signature) {
        logger.warn('[Billing] Webhook missing raw body or signature header', {
          hasRawBody: !!rawBody,
          hasSignature: !!signature,
        });
        metrics.incCounter(METRICS.PAYMENTS_WEBHOOKS_TOTAL, 'Total payment webhooks', { event: 'rejected', reason: 'missing_signature' });
        res.status(400).json({ error: 'Missing signature' });
        return;
      }

      const payload = typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody);
      const isValid = paystackService.verifyWebhookSignature(payload, signature);
      if (!isValid) {
        logger.warn('[Billing] Invalid webhook signature — rejecting', {
          ip: req.ip,
        });
        metrics.incCounter(METRICS.PAYMENTS_WEBHOOKS_TOTAL, 'Total payment webhooks', { event: 'rejected', reason: 'invalid_signature' });
        res.status(400).json({ error: 'Invalid signature' });
        return;
      }

      const event = paystackService.parseWebhookEvent(payload);

      if (!event) {
        logger.warn('[Billing] Failed to parse webhook event', {
          ip: req.ip,
        });
        metrics.incCounter(METRICS.PAYMENTS_WEBHOOKS_TOTAL, 'Total payment webhooks', { event: 'rejected', reason: 'parse_error' });
        res.status(400).json({ error: 'Invalid event' });
        return;
      }

      logger.info('[Billing] Webhook parsed', {
        event: event.event,
        ip: req.ip,
      });
      metrics.incCounter(METRICS.PAYMENTS_WEBHOOKS_TOTAL, 'Total payment webhooks', { event: event.event, reason: 'accepted' });

      // Process webhook asynchronously
      billingService.processWebhook(event.event, event.data).catch((error) => {
        const durationMs = Date.now() - webhookStart;
        logger.error('[Billing] Webhook processing error', {
          event: event.event,
          durationMs,
          error: error instanceof Error ? error.message : String(error),
        });
        metrics.incCounter(METRICS.PAYMENTS_WEBHOOKS_TOTAL, 'Total payment webhooks', { event: event.event, reason: 'processing_error' });
      });

      // Always return 200 to Paystack immediately
      const durationMs = Date.now() - webhookStart;
      metrics.histogram(METRICS.PAYMENTS_WEBHOOK_PROCESSING_DURATION, 'Webhook handling duration', durationMs / 1000, { event: event.event });
      logger.info('[Billing] Webhook accepted', { event: event.event, durationMs });
      res.status(200).json({ received: true });
    } catch (error) {
      const durationMs = Date.now() - webhookStart;
      logger.error('[Billing] Webhook handler error', {
        durationMs,
        error: error instanceof Error ? error.message : String(error),
      });
      // Always return 200 to prevent Paystack retries
      res.status(200).json({ received: true });
    }
  }

  // ──────────────────── Payment history ───────────────────────────────

  /** GET /api/v1/billing/payments */
  async listPayments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { page, limit } = req.query;
      const result = await billingService.getPaymentHistory(userId, {
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.status(200).json({
        data: result.data,
        pagination: {
          total: result.total,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 25,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/billing/payments/:id */
  async getPayment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid payment ID' });
        return;
      }

      const payment = await billingService.getPayment(userId, id);
      res.status(200).json({ data: payment });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/billing/payments/stats */
  async getPaymentStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const stats = await billingService.getPaymentStats(userId);
      res.status(200).json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Subscription management ───────────────────────

  /** GET /api/v1/billing/subscription */
  async getSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await billingService.getCurrentSubscription(userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/billing/subscription/cancel */
  async cancelSubscription(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { reason } = req.body;
      const subscription = await billingService.cancelSubscription(userId, reason);
      res.status(200).json({ data: subscription });
    } catch (error) {
      next(error);
    }
  }
}

export const billingController = new BillingController();
