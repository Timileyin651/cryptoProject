import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService';
import { tokenService } from '../services/TokenService';
import { config } from '../config';

export class AuthController {
  constructor() {
    // Bind all handlers so Express can call them without losing `this`
    this.register = this.register.bind(this);
    this.login = this.login.bind(this);
    this.refresh = this.refresh.bind(this);
    this.logout = this.logout.bind(this);
    this.forgotPassword = this.forgotPassword.bind(this);
    this.resetPassword = this.resetPassword.bind(this);
    this.verifyEmail = this.verifyEmail.bind(this);
  }

  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ status: 'error', message: 'Request body is required' });
        return;
      }
      const { email, password, firstName, lastName } = req.body;
      const userAgent = req.headers['user-agent'];
      const result = await authService.register(email, password, firstName, lastName, userAgent);

      this.setRefreshTokenCookie(res, result.tokens.refreshToken);

      // Do NOT return accessToken in JSON response for API registration
      // (web registration redirects, API should use refresh flow)
      res.status(201).json({
        status: 'success',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async login(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.body || typeof req.body !== 'object') {
        res.status(400).json({ status: 'error', message: 'Request body is required' });
        return;
      }
      const { email, password } = req.body;
      const userAgent = req.headers['user-agent'];
      const result = await authService.login(email, password, userAgent);

      this.setRefreshTokenCookie(res, result.tokens.refreshToken);

      res.status(200).json({
        status: 'success',
        data: {
          user: result.user,
          accessToken: result.tokens.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
      if (!refreshToken) {
        res.status(401).json({ status: 'error', message: 'Refresh token required' });
        return;
      }

      const userAgent = req.headers['user-agent'];
      const tokens = await authService.refresh(refreshToken, userAgent);

      this.setRefreshTokenCookie(res, tokens.refreshToken);

      res.status(200).json({
        status: 'success',
        data: {
          accessToken: tokens.accessToken,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  async logout(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const refreshToken = req.body.refreshToken || req.cookies?.refreshToken;
      await authService.logout(refreshToken);

      res.clearCookie('refreshToken');
      res.clearCookie('accessToken');

      res.status(200).json({ status: 'success', message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }

  async forgotPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);

      res.status(200).json({
        status: 'success',
        message: 'If an account exists with that email, a reset link has been sent',
      });
    } catch (error) {
      next(error);
    }
  }

  async resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;
      await authService.resetPassword(token, password);

      res.status(200).json({
        status: 'success',
        message: 'Password reset successful. Please log in with your new password.',
      });
    } catch (error) {
      next(error);
    }
  }

  async verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const token = (req.query.token as string) || req.body.token;
      await authService.verifyEmail(token);

      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  private setRefreshTokenCookie(res: Response, token: string): void {
    res.cookie('refreshToken', token, {
      httpOnly: config.cookie.httpOnly,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      maxAge: config.cookie.maxAge,
      path: '/',
    });
  }

  private setAccessTokenCookie(res: Response, token: string): void {
    const maxAge = tokenService.getAccessTokenExpiryMs();
    res.cookie('accessToken', token, {
      httpOnly: config.cookie.httpOnly,
      secure: config.cookie.secure,
      sameSite: config.cookie.sameSite,
      maxAge,
      path: '/',
    });
  }
}

export const authController = new AuthController();
