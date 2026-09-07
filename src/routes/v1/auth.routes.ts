import { Router } from 'express';
import { authController } from '../../controllers/AuthController';
import { validate } from '../../middleware/validate';
import { authRateLimiter, passwordResetRateLimiter } from '../../middleware/authRateLimiter';
import {
  registerValidator,
  loginValidator,
  refreshValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
} from '../../validators/auth.validator';

const router = Router();

// API endpoints
router.post(
  '/auth/register',
  authRateLimiter,
  registerValidator,
  validate,
  authController.register,
);

router.post('/auth/login', authRateLimiter, loginValidator, validate, authController.login);

router.post('/auth/refresh', refreshValidator, validate, authController.refresh);

router.post('/auth/logout', authController.logout);

router.post(
  '/auth/forgot-password',
  passwordResetRateLimiter,
  forgotPasswordValidator,
  validate,
  authController.forgotPassword,
);

router.post(
  '/auth/reset-password',
  passwordResetRateLimiter,
  resetPasswordValidator,
  validate,
  authController.resetPassword,
);

router.get('/auth/verify-email', authController.verifyEmail);

export default router;
