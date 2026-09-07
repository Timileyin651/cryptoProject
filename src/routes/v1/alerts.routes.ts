import { Router } from 'express';
import { alertController } from '../../controllers/AlertController';
import { authenticate } from '../../middleware/authenticate';
import { requireFeatures } from '../../middleware/planGuard';
import { FEATURES } from '../../middleware/planGuard';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ── Alerts CRUD ──
router.get('/', (req, res, next) => alertController.listAlerts(req, res, next));
router.get('/limits', (req, res, next) => alertController.getLimits(req, res, next));
router.get('/engine/status', (req, res, next) => alertController.getEngineStatus(req, res, next));
router.get('/:id', (req, res, next) => alertController.getAlert(req, res, next));
router.post('/', (req, res, next) => alertController.createAlert(req, res, next));
router.put('/:id', (req, res, next) => alertController.updateAlert(req, res, next));
router.delete('/:id', (req, res, next) => alertController.deleteAlert(req, res, next));
router.post('/:id/pause', (req, res, next) => alertController.pauseAlert(req, res, next));
router.post('/:id/resume', (req, res, next) => alertController.resumeAlert(req, res, next));

// ── Notifications ──
router.get('/notifications', (req, res, next) => alertController.listNotifications(req, res, next));
router.get('/notifications/stats', (req, res, next) =>
  alertController.getNotificationStats(req, res, next),
);

// ── Preferences ──
router.get('/preferences', (req, res, next) => alertController.getPreferences(req, res, next));
router.put('/preferences', (req, res, next) => alertController.updatePreferences(req, res, next));

export default router;
