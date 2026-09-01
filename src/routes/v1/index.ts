import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(userRoutes);

export default router;
