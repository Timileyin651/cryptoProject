import { Router } from 'express';
import { userController } from '../../controllers/UserController';
import { authenticate } from '../../middleware/authenticate';
import { validate } from '../../middleware/validate';
import { updateProfileValidator, changePasswordValidator } from '../../validators/user.validator';

const router = Router();

// All user routes require authentication
router.use(authenticate);

router.get('/users/me', userController.getProfile);

router.patch(
  '/users/me',
  updateProfileValidator,
  validate,
  userController.updateProfile,
);

router.patch(
  '/users/me/password',
  changePasswordValidator,
  validate,
  userController.changePassword,
);

export default router;
