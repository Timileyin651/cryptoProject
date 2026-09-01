import { Router } from 'express';
import { healthController } from '../../controllers/HealthController';

const router = Router();

router.get('/health', healthController.simple);
router.get('/health/detailed', healthController.detailed);

export default router;
