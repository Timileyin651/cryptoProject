import { Router } from 'express';
import { healthController } from '../../controllers/HealthController';

const router = Router();

// ── Kubernetes probes ─────────────────────────────────────────────────
router.get('/health/live', (req, res, next) => healthController.liveness(req, res, next));
router.get('/health/ready', (req, res, next) => healthController.readiness(req, res, next));

// ── Detailed diagnostics ──────────────────────────────────────────────
router.get('/health/detailed', (req, res, next) => healthController.detailed(req, res, next));

// ── Prometheus metrics ────────────────────────────────────────────────
router.get('/metrics', (req, res, next) => healthController.prometheusMetrics(req, res, next));

// ── Simple health (legacy compatibility) ──────────────────────────────
router.get('/health', (req, res, next) => healthController.simple(req, res, next));

export default router;
