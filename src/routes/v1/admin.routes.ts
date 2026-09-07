import { Router } from 'express';
import { adminController } from '../../controllers/AdminController';
import { authenticate } from '../../middleware/authenticate';
import { requireRole, attachAuditContext } from '../../middleware/adminGuard';
import { csrfValidate } from '../../middleware/csrf';

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(requireRole('admin'));
router.use(attachAuditContext);

// CSRF protection on state-changing routes
router.use(csrfValidate);

// ── Users ──
router.get('/users', (req, res, next) => adminController.listUsers(req, res, next));
router.get('/users/:id', (req, res, next) => adminController.getUser(req, res, next));
router.put('/users/:id', (req, res, next) => adminController.updateUser(req, res, next));
router.post('/users/:id/deactivate', (req, res, next) =>
  adminController.deactivateUser(req, res, next),
);

// ── Plans ──
router.get('/plans', (req, res, next) => adminController.listPlans(req, res, next));
router.post('/plans', requireRole('superadmin'), (req, res, next) =>
  adminController.createPlan(req, res, next),
);
router.put('/plans/:id', requireRole('superadmin'), (req, res, next) =>
  adminController.updatePlan(req, res, next),
);
router.get('/plans/:id/entitlements', (req, res, next) =>
  adminController.listEntitlements(req, res, next),
);
router.put('/plans/:id/entitlements', requireRole('superadmin'), (req, res, next) =>
  adminController.updateEntitlements(req, res, next),
);

// ── Subscriptions ──
router.get('/subscriptions', (req, res, next) => adminController.listSubscriptions(req, res, next));
router.post('/subscriptions/:id/override', requireRole('superadmin'), (req, res, next) =>
  adminController.overrideSubscription(req, res, next),
);

// ── Payments ──
router.get('/payments', (req, res, next) => adminController.listPayments(req, res, next));
router.post('/payments/:id/override', requireRole('superadmin'), (req, res, next) =>
  adminController.overridePayment(req, res, next),
);

// ── Exchanges ──
router.get('/exchanges', (req, res, next) => adminController.listExchanges(req, res, next));
router.post('/exchanges', (req, res, next) => adminController.createExchange(req, res, next));
router.put('/exchanges/:id', (req, res, next) => adminController.updateExchange(req, res, next));
router.post('/exchanges/:id/deactivate', (req, res, next) =>
  adminController.deactivateExchange(req, res, next),
);

// ── Coins & Networks ──
router.get('/coins', (req, res, next) => adminController.listCoins(req, res, next));
router.post('/coins', (req, res, next) => adminController.createCoin(req, res, next));
router.get('/networks', (req, res, next) => adminController.listNetworks(req, res, next));
router.post('/networks', (req, res, next) => adminController.createNetwork(req, res, next));

// ── Opportunities ──
router.get('/opportunities', (req, res, next) => adminController.listOpportunities(req, res, next));
router.delete('/opportunities/:id', (req, res, next) =>
  adminController.deleteOpportunity(req, res, next),
);

// ── Alerts ──
router.get('/alerts', (req, res, next) => adminController.listAlerts(req, res, next));
router.post('/alerts/:id/force-disable', (req, res, next) =>
  adminController.forceDisableAlert(req, res, next),
);

// ── Notifications ──
router.get('/notifications', (req, res, next) => adminController.listNotifications(req, res, next));
router.post('/notifications/retry-failed', (req, res, next) =>
  adminController.retryFailedNotifications(req, res, next),
);

// ── Settings ──
router.get('/settings', (req, res, next) => adminController.getSettings(req, res, next));
router.put('/settings', requireRole('superadmin'), (req, res, next) =>
  adminController.updateSettings(req, res, next),
);

// ── Audit Logs ──
router.get('/logs', (req, res, next) => adminController.listAuditLogs(req, res, next));
router.get('/logs/stats', (req, res, next) => adminController.getAuditStats(req, res, next));

export default router;
