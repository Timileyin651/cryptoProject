import { TokenService } from '../../src/services/TokenService';

// Mock redis client for blacklist operations
jest.mock('../../src/config/redis', () => ({
  redisClient: {
    get: jest.fn(() => Promise.resolve(null)),
    set: jest.fn(() => Promise.resolve('OK')),
    del: jest.fn(() => Promise.resolve(1)),
  },
}));

describe('TokenService', () => {
  let service: TokenService;

  beforeEach(() => {
    service = new TokenService();
  });

  describe('generateAccessToken', () => {
    it('generates a valid JWT', () => {
      const token = service.generateAccessToken({ userId: 1, email: 'test@test.com' });
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3); // JWT has 3 parts
    });
  });

  describe('verifyAccessToken', () => {
    it('verifies a valid token', () => {
      const payload = { userId: 1, email: 'test@test.com' };
      const token = service.generateAccessToken(payload);
      const verified = service.verifyAccessToken(token);
      expect(verified.userId).toBe(1);
      expect(verified.email).toBe('test@test.com');
    });

    it('throws on invalid token', () => {
      expect(() => service.verifyAccessToken('invalid')).toThrow();
    });

    it('throws on expired token', () => {
      const jwt = require('jsonwebtoken');
      const token = jwt.sign({ userId: 1, email: 'test@test.com' }, process.env.JWT_SECRET!, {
        expiresIn: '0s',
      });
      // Wait a bit for the token to expire
      expect(() => service.verifyAccessToken(token)).toThrow();
    });
  });

  describe('generateRefreshToken', () => {
    it('generates a hex string', () => {
      const token = service.generateRefreshToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token.length).toBe(80); // 40 bytes = 80 hex chars
    });

    it('generates unique tokens', () => {
      const t1 = service.generateRefreshToken();
      const t2 = service.generateRefreshToken();
      expect(t1).not.toBe(t2);
    });
  });

  describe('generateRefreshTokenFamily', () => {
    it('generates a UUID', () => {
      const family = service.generateRefreshTokenFamily();
      expect(family).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });
  });

  describe('hashToken / verifyTokenHash', () => {
    it('hashes and verifies a token', async () => {
      const token = 'test-refresh-token-value';
      const hash = await service.hashToken(token);
      expect(hash).not.toBe(token);

      const isValid = await service.verifyTokenHash(token, hash);
      expect(isValid).toBe(true);
    });

    it('rejects wrong token', async () => {
      const hash = await service.hashToken('correct-token');
      const isValid = await service.verifyTokenHash('wrong-token', hash);
      expect(isValid).toBe(false);
    });
  });

  describe('generateEmailVerificationToken', () => {
    it('generates a hex string', () => {
      const token = service.generateEmailVerificationToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token.length).toBe(64); // 32 bytes = 64 hex chars
    });
  });

  describe('generatePasswordResetToken', () => {
    it('generates a hex string', () => {
      const token = service.generatePasswordResetToken();
      expect(token).toMatch(/^[0-9a-f]+$/);
      expect(token.length).toBe(64);
    });
  });

  describe('expiry helpers', () => {
    it('getRefreshTokenExpiry returns a future date', () => {
      const expiry = service.getRefreshTokenExpiry();
      expect(expiry.getTime()).toBeGreaterThan(Date.now());
    });

    it('getEmailVerificationExpiry returns a date ~24h in the future', () => {
      const expiry = service.getEmailVerificationExpiry();
      const diff = expiry.getTime() - Date.now();
      expect(diff).toBeGreaterThan(23 * 60 * 60 * 1000);
      expect(diff).toBeLessThan(25 * 60 * 60 * 1000);
    });

    it('getPasswordResetExpiry returns a date ~1h in the future', () => {
      const expiry = service.getPasswordResetExpiry();
      const diff = expiry.getTime() - Date.now();
      expect(diff).toBeGreaterThan(55 * 60 * 1000);
      expect(diff).toBeLessThan(65 * 60 * 1000);
    });
  });

  describe('getAccessTokenExpiryMs', () => {
    it('returns a positive number', () => {
      const ms = service.getAccessTokenExpiryMs();
      expect(ms).toBeGreaterThan(0);
    });

    it('parses "15m" correctly', () => {
      const ms = service.getAccessTokenExpiryMs();
      expect(ms).toBe(15 * 60 * 1000);
    });
  });
});
