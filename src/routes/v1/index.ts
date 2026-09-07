import { Router } from 'express';
import healthRoutes from './health.routes';
import authRoutes from './auth.routes';
import userRoutes from './user.routes';
import fundingRoutes from './funding.routes';
import arbitrageRoutes from './arbitrage.routes';
import scannerRoutes from './scanner.routes';
import calculatorRoutes from './calculator.routes';
import analyticsRoutes from './analytics.routes';
import favoritesRoutes from './favorites.routes';
import alertsRoutes from './alerts.routes';
import billingRoutes from './billing.routes';
import adminRoutes from './admin.routes';

const router = Router();

router.use(healthRoutes);
router.use(authRoutes);
router.use(userRoutes);
router.use(fundingRoutes);
router.use(arbitrageRoutes);
router.use(scannerRoutes);
router.use(calculatorRoutes);
router.use(analyticsRoutes);
router.use('/favorites', favoritesRoutes);
router.use('/alerts', alertsRoutes);
router.use('/billing', billingRoutes);
router.use('/admin', adminRoutes);

export default router;
