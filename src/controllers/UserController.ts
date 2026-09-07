import { Request, Response, NextFunction } from 'express';
import { userService } from '../services/UserService';

export class UserController {
  async getProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const profile = await userService.getProfile(req.user!.userId);
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  }

  async updateProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { firstName, lastName, email } = req.body;
      const profile = await userService.updateProfile(req.user!.userId, {
        firstName,
        lastName,
        email,
      });
      res.status(200).json({ status: 'success', data: profile });
    } catch (error) {
      next(error);
    }
  }

  async changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { currentPassword, newPassword } = req.body;
      await userService.changePassword(req.user!.userId, currentPassword, newPassword);
      res.status(200).json({
        status: 'success',
        message: 'Password changed successfully. Please log in again.',
      });
    } catch (error) {
      next(error);
    }
  }
}

export const userController = new UserController();
