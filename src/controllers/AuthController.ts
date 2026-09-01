import { Request, Response, NextFunction } from 'express';
import { authService } from '../services/AuthService';
import { tokenService } from '../services/TokenService';
import { config } from '../config';
import { logger } from '../utils/logger';

export class AuthController {
  async register(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, firstName, lastName } = req.body;
      const userAgent = req.headers['user-agent'];
      const result = await authService.register(email, password, firstName, lastName, userAgent);

      this.setRefreshTokenCookie(res, result.tokens.refreshToken);

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
      const token = req.query.token as string || req.body.token;
      await authService.verifyEmail(token);

      // If browser request (from link click), redirect to home
      if (req.accepts('html')) {
        res.redirect('/?verified=true');
        return;
      }

      res.status(200).json({
        status: 'success',
        message: 'Email verified successfully',
      });
    } catch (error) {
      next(error);
    }
  }

  // Web view routes for EJS pages
  renderRegister(_req: Request, res: Response): void {
    res.render('auth/register', { title: 'Register', error: null });
  }

  renderLogin(_req: Request, res: Response): void {
    res.render('auth/login', { title: 'Login', error: null });
  }

  renderForgotPassword(_req: Request, res: Response): void {
    res.render('auth/forgot-password', { title: 'Forgot Password', error: null, sent: false });
  }

  renderResetPassword(req: Request, res: Response): void {
    const token = req.query.token as string || '';
    res.render('auth/reset-password', { title: 'Reset Password', error: null, token });
  }

  // Web form submissions (thin wrappers that call the same services)
  async webRegister(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password, firstName, lastName } = req.body;
      const userAgent = req.headers['user-agent'];
      await authService.register(email, password, firstName, lastName, userAgent);
      res.redirect('/auth/login?registered=true');
    } catch (error) {
      const err = error as Error;
      res.render('auth/register', { title: 'Register', error: err.message });
    }
  }

  async webLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { email, password } = req.body;
      const userAgent = req.headers['user-agent'];
      const result = await authService.login(email, password, userAgent);

      // Set cookies for web session
      this.setRefreshTokenCookie(res, result.tokens.refreshToken);
      this.setAccessTokenCookie(res, result.tokens.accessToken);

      res.redirect('/');
    } catch (error) {
      const err = error as Error;
      res.render('auth/login', { title: 'Login', error: err.message });
    }
  }

  async webForgotPassword(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const { email } = req.body;
      await authService.forgotPassword(email);
      res.render('auth/forgot-password', { title: 'Forgot Password', error: null, sent: true });
    } catch (error) {
      const err = error as Error;
      res.render('auth/forgot-password', { title: 'Forgot Password', error: err.message, sent: false });
    }
  }

  async webResetPassword(req: Request, res: Response, _next: NextFunction): Promise<void> {
    try {
      const { token, password } = req.body;
      await authService.resetPassword(token, password);
      res.redirect('/auth/login?reset=true');
    } catch (error) {
      const err = error as Error;
      res.render('auth/reset-password', {
        title: 'Reset Password',
        error: err.message,
        token: req.body.token || '',
      });
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
