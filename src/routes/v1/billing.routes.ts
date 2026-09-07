import { Router, raw } from 'express';
import { billingController } from '../../controllers/BillingController';
import { authenticate } from '../../middleware/authenticate';

const router = Router();

// ── Webhook endpoint (NO auth — verified by Paystack signature) ──
// Must be registered before body parsers or use raw body
router.post(
  '/webhook',
  raw({ type: 'application/json' }),
  (req, _res, next) => {
    // Attach raw body for signature verification
    (req as any).rawBody = req.body;
    next();
  },
  (req, res, next) => billingController.handleWebhook(req, res, next),
);

// ── All routes below require authentication ──
router.use(authenticate);

// ── Plans ──
router.get('/plans', (req, res, next) => billingController.listPlans(req, res, next));

// ── Checkout ──
router.post('/checkout', (req, res, next) => billingController.initializeCheckout(req, res, next));

// ── Verification ──
router.get('/verify/:reference', (req, res, next) =>
  billingController.verifyPayment(req, res, next),
);

// ── Payment history ──
router.get('/payments', (req, res, next) => billingController.listPayments(req, res, next));
router.get('/payments/stats', (req, res, next) =>
  billingController.getPaymentStats(req, res, next),
);
router.get('/payments/:id', (req, res, next) => billingController.getPayment(req, res, next));

// ── Subscription management ──
router.get('/subscription', (req, res, next) => billingController.getSubscription(req, res, next));
router.post('/subscription/cancel', (req, res, next) =>
  billingController.cancelSubscription(req, res, next),
);

export default router;
