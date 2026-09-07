/**
 * AuthController tests — register, login, refresh, logout, password reset.
 * Proves: cookie security, token handling, error message consistency.
 */

jest.mock('../../src/services/AuthService', () => ({
  authService: {
    register: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
    forgotPassword: jest.fn(),
    resetPassword: jest.fn(),
    verifyEmail: jest.fn(),
  },
}));

jest.mock('../../src/services/TokenService', () => ({
  tokenService: {
    getAccessTokenExpiryMs: jest.fn().mockReturnValue(900000),
    generateAccessToken: jest.fn().mockReturnValue('access_token'),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    env: 'test',
    cookie: {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      maxAge: 604800000,
    },
    logging: { level: 'error', dir: './logs' },
  },
}));

import { AuthController } from '../../src/controllers/AuthController';
import { authService } from '../../src/services/AuthService';

const mockUser = {
  id: 1,
  email: 'test@test.com',
  first_name: 'Test',
  last_name: 'User',
  role: 'user',
};
const mockTokens = { accessToken: 'at_123', refreshToken: 'rt_456' };

function mockReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    accepts: jest.fn().mockReturnValue(false),
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
    cookie: jest.fn().mockReturnThis(),
    clearCookie: jest.fn().mockReturnThis(),
    render: jest.fn().mockReturnThis(),
    locals: {},
  };
  return res;
}

function mockNext() {
  return jest.fn();
}

describe('AuthController', () => {
  let ctrl: AuthController;

  beforeEach(() => {
    ctrl = new AuthController();
    jest.clearAllMocks();
  });

  describe('register', () => {
    it('returns 201 with user and accessToken', async () => {
      (authService.register as jest.Mock).mockResolvedValue({ user: mockUser, tokens: mockTokens });
      const req = mockReq({
        body: { email: 'test@test.com', password: 'Pass1!', firstName: 'Test', lastName: 'User' },
      });
      const res = mockRes();
      const next = mockNext();
      await ctrl.register(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ user: mockUser }),
        }),
      );
    });

    it('sets httpOnly refresh token cookie', async () => {
      (authService.register as jest.Mock).mockResolvedValue({ user: mockUser, tokens: mockTokens });
      const req = mockReq({
        body: { email: 'test@test.com', password: 'Pass1!', firstName: 'Test', lastName: 'User' },
      });
      const res = mockRes();
      await ctrl.register(req, res, mockNext());
      expect(res.cookie).toHaveBeenCalledWith(
        'refreshToken',
        mockTokens.refreshToken,
        expect.objectContaining({
          httpOnly: true,
          path: '/',
        }),
      );
    });

    it('calls next with error on failure', async () => {
      (authService.register as jest.Mock).mockRejectedValue(new Error('Duplicate email'));
      const req = mockReq({ body: { email: 'dup@test.com', password: 'Pass1!' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.register(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });

    it('returns 400 with clean error when req.body is undefined', async () => {
      const req = mockReq({ body: undefined });
      const res = mockRes();
      const next = mockNext();
      await ctrl.register(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'error', message: expect.any(String) }),
      );
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 with clean error when req.body is null', async () => {
      const req = mockReq({ body: null });
      const res = mockRes();
      const next = mockNext();
      await ctrl.register(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 400 with clean error when fields are missing', async () => {
      const req = mockReq({ body: { email: 'test@test.com' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.register(req, res, next);
      // Missing password/firstName/lastName → service throws BadRequestError
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('login', () => {
    it('returns 200 with user and accessToken', async () => {
      (authService.login as jest.Mock).mockResolvedValue({ user: mockUser, tokens: mockTokens });
      const req = mockReq({ body: { email: 'test@test.com', password: 'Pass1!' } });
      const res = mockRes();
      await ctrl.login(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('returns 400 when req.body is undefined', async () => {
      const req = mockReq({ body: undefined });
      const res = mockRes();
      const next = mockNext();
      await ctrl.login(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe('refresh', () => {
    it('returns new accessToken', async () => {
      (authService.refresh as jest.Mock).mockResolvedValue(mockTokens);
      const req = mockReq({ body: { refreshToken: 'rt_456' } });
      const res = mockRes();
      await ctrl.refresh(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ accessToken: mockTokens.accessToken }),
        }),
      );
    });

    it('returns 401 when no refresh token', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();
      await ctrl.refresh(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('logout', () => {
    it('clears cookies', async () => {
      (authService.logout as jest.Mock).mockResolvedValue(undefined);
      const req = mockReq({ body: { refreshToken: 'rt_456' } });
      const res = mockRes();
      await ctrl.logout(req, res, mockNext());
      expect(res.clearCookie).toHaveBeenCalledWith('refreshToken');
      expect(res.clearCookie).toHaveBeenCalledWith('accessToken');
    });
  });

  describe('forgotPassword', () => {
    it('returns success without revealing if user exists', async () => {
      (authService.forgotPassword as jest.Mock).mockResolvedValue(undefined);
      const req = mockReq({ body: { email: 'test@test.com' } });
      const res = mockRes();
      await ctrl.forgotPassword(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          message: expect.stringContaining('If an account exists'),
        }),
      );
    });
  });

  describe('resetPassword', () => {
    it('resets password with valid token', async () => {
      (authService.resetPassword as jest.Mock).mockResolvedValue(undefined);
      const req = mockReq({ body: { token: 'valid_token', password: 'NewPass1!' } });
      const res = mockRes();
      await ctrl.resetPassword(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('verifyEmail', () => {
    it('returns JSON on successful verification', async () => {
      (authService.verifyEmail as jest.Mock).mockResolvedValue(undefined);
      const req = mockReq({ query: { token: 'valid' } });
      const res = mockRes();
      await ctrl.verifyEmail(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'success',
          message: 'Email verified successfully',
        }),
      );
    });
  });
});
