/**
 * Authenticate middleware tests — JWT verification, token formats, error handling.
 */

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(),
}));

jest.mock('../../src/services/TokenService', () => ({
  tokenService: {
    verifyAccessToken: jest.fn(),
    getAccessTokenExpiryMs: jest.fn().mockReturnValue(900000),
    isAccessTokenBlacklisted: jest.fn().mockResolvedValue(false),
  },
}));

jest.mock('../../src/models/User', () => ({
  User: {
    findByPk: jest.fn().mockImplementation(async (id: number) => {
      if (id === 1) return { id: 1, email: 'test@test.com', is_active: true };
      if (id === 2) return { id: 2, email: 'inactive@test.com', is_active: false };
      return null;
    }),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    env: 'test',
    jwt: { secret: 'test-secret-32-chars-long!!!!!!!!', accessTokenExpiry: '15m' },
    logging: { level: 'error', dir: './logs' },
  },
}));

import { authenticate } from '../../src/middleware/authenticate';
import { tokenService } from '../../src/services/TokenService';
import { UnauthorizedError } from '../../src/utils/errors';

function createMocks(tokenSource: 'header' | 'cookie' | 'none' = 'header', tokenValue?: string) {
  const req: any = {
    headers: {},
    cookies: {},
    user: undefined,
  };

  if (tokenSource === 'header' && tokenValue) {
    req.headers.authorization = `Bearer ${tokenValue}`;
  } else if (tokenSource === 'cookie' && tokenValue) {
    req.cookies.accessToken = tokenValue;
  }

  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

describe('authenticate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  it('rejects requests without any token', async () => {
    const { req, res, next } = createMocks('none');
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('authenticates valid token from Authorization header', async () => {
    (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 1,
      email: 'test@test.com',
    });
    const { req, res, next } = createMocks('header', 'valid_jwt_token');
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toEqual({ userId: 1, email: 'test@test.com' });
  });

  it('authenticates valid token from cookie', async () => {
    (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 1,
      email: 'test@test.com',
    });
    const { req, res, next } = createMocks('cookie', 'valid_jwt_token');
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user).toBeDefined();
  });

  it('rejects invalid/expired tokens', async () => {
    (tokenService.verifyAccessToken as jest.Mock).mockImplementation(() => {
      throw new Error('jwt expired');
    });
    const { req, res, next } = createMocks('header', 'expired_token');
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });

  it('rejects blacklisted tokens', async () => {
    (tokenService.verifyAccessToken as jest.Mock).mockReturnValue({
      userId: 2,
      email: 'inactive@test.com',
    });
    (tokenService.isAccessTokenBlacklisted as jest.Mock).mockResolvedValue(true);
    const { req, res, next } = createMocks('header', 'valid_token_inactive');
    await authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
  });
});
