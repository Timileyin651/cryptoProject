import bcrypt from 'bcryptjs';
import { AuthService } from '../../src/services/AuthService';
import { ConflictError, UnauthorizedError, BadRequestError } from '../../src/utils/errors';

// Mock all repositories and services
jest.mock('../../src/repositories/UserRepository', () => ({
  userRepository: {
    findByEmail: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateLastLogin: jest.fn(),
    setEmailVerified: jest.fn(),
    updatePassword: jest.fn(),
  },
}));

jest.mock('../../src/repositories/RefreshTokenRepository', () => ({
  refreshTokenRepository: {
    findAll: jest.fn(),
    create: jest.fn(),
    revokeByTokenHash: jest.fn(),
    revokeAllForUser: jest.fn(),
    revokeFamily: jest.fn(),
    findValidByTokenHash: jest.fn(),
  },
}));

jest.mock('../../src/repositories/EmailVerificationRepository', () => ({
  emailVerificationRepository: {
    findAll: jest.fn(),
    create: jest.fn(),
    findValidByTokenHash: jest.fn(),
    markUsed: jest.fn(),
  },
}));

jest.mock('../../src/repositories/PasswordResetRepository', () => ({
  passwordResetRepository: {
    findAll: jest.fn(),
    create: jest.fn(),
    findValidByTokenHash: jest.fn(),
    invalidateAllForUser: jest.fn(),
    markUsed: jest.fn(),
  },
}));

jest.mock('../../src/services/EmailService', () => ({
  emailService: {
    sendVerificationEmail: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
  },
}));

import { userRepository } from '../../src/repositories/UserRepository';
import { refreshTokenRepository } from '../../src/repositories/RefreshTokenRepository';
import { emailVerificationRepository } from '../../src/repositories/EmailVerificationRepository';
import { passwordResetRepository } from '../../src/repositories/PasswordResetRepository';
import { emailService } from '../../src/services/EmailService';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    jest.clearAllMocks();
  });

  describe('register', () => {
    const validInput = {
      email: 'new@test.com',
      password: 'Password123!',
      firstName: 'New',
      lastName: 'User',
    };

    it('creates a new user with hashed password', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      const mockUser = { id: 1, email: 'new@test.com', first_name: 'New', last_name: 'User' };
      (userRepository.create as jest.Mock).mockResolvedValue(mockUser);

      const result = await service.register(
        validInput.email,
        validInput.password,
        validInput.firstName,
        validInput.lastName,
      );

      expect(result.user.email).toBe('new@test.com');
      expect(result.user.firstName).toBe('New');
      expect(result.tokens.accessToken).toBeDefined();
      expect(result.tokens.refreshToken).toBeDefined();
      expect(userRepository.create).toHaveBeenCalled();
    });

    it('throws ConflictError for duplicate email', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'existing@test.com',
      });

      await expect(
        service.register('existing@test.com', 'Password1!', 'Test', 'User'),
      ).rejects.toThrow(ConflictError);
    });

    it('sends verification email after registration', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (userRepository.create as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'new@test.com',
        first_name: 'New',
        last_name: 'User',
      });

      await service.register('new@test.com', 'Password1!', 'New', 'User');

      expect(emailService.sendVerificationEmail).toHaveBeenCalledWith(
        'new@test.com',
        'New',
        expect.any(String),
      );
    });

    it('hashes the password with bcrypt', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);
      (userRepository.create as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'new@test.com',
        first_name: 'New',
        last_name: 'User',
      });

      await service.register('new@test.com', 'Password1!', 'New', 'User');

      const createCall = (userRepository.create as jest.Mock).mock.calls[0][0];
      expect(createCall.password_hash).not.toBe('Password1!');
      const isValid = await bcrypt.compare('Password1!', createCall.password_hash);
      expect(isValid).toBe(true);
    });
  });

  describe('login', () => {
    it('returns tokens for valid credentials', async () => {
      const hash = await bcrypt.hash('Password1!', 12);
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        first_name: 'Test',
        last_name: 'User',
        password_hash: hash,
        is_active: true,
      });

      const result = await service.login('test@test.com', 'Password1!');

      expect(result.user.email).toBe('test@test.com');
      expect(result.tokens.accessToken).toBeDefined();
      expect(userRepository.updateLastLogin).toHaveBeenCalledWith(1);
    });

    it('throws UnauthorizedError for wrong password', async () => {
      const hash = await bcrypt.hash('Password1!', 12);
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        password_hash: hash,
        is_active: true,
      });

      await expect(service.login('test@test.com', 'WrongPassword')).rejects.toThrow(
        UnauthorizedError,
      );
    });

    it('throws UnauthorizedError for inactive user', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        is_active: false,
      });

      await expect(service.login('test@test.com', 'Password1!')).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for non-existent email', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      await expect(service.login('nobody@test.com', 'Password1!')).rejects.toThrow(
        UnauthorizedError,
      );
    });
  });

  describe('refresh', () => {
    it('returns new tokens for valid refresh token', async () => {
      const tokenHash = 'hashed-token';
      (refreshTokenRepository.findValidByTokenHash as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: 1,
        token_hash: tokenHash,
        family: 'family-1',
        expires_at: new Date(Date.now() + 3600000),
      });
      (userRepository.findById as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        is_active: true,
      });

      // Mock tokenService.hashToken to return our known hash
      const { tokenService } = jest.requireActual('../../src/services/TokenService');
      jest.spyOn(tokenService, 'hashToken').mockResolvedValue(tokenHash);

      const result = await service.refresh('some-token');

      expect(result.accessToken).toBeDefined();
      expect(result.refreshToken).toBeDefined();
      expect(refreshTokenRepository.revokeByTokenHash).toHaveBeenCalled();
    });

    it('throws UnauthorizedError for invalid token', async () => {
      (refreshTokenRepository.findValidByTokenHash as jest.Mock).mockResolvedValue(null);

      await expect(service.refresh('invalid-token')).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('logout', () => {
    it('revokes the refresh token', async () => {
      await service.logout('some-token');
      expect(refreshTokenRepository.revokeByTokenHash).toHaveBeenCalled();
    });

    it('does nothing when no token provided', async () => {
      await service.logout(undefined);
      expect(refreshTokenRepository.revokeByTokenHash).not.toHaveBeenCalled();
    });
  });

  describe('forgotPassword', () => {
    it('sends reset email if user exists', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue({
        id: 1,
        email: 'test@test.com',
        first_name: 'Test',
      });

      await service.forgotPassword('test@test.com');

      expect(passwordResetRepository.invalidateAllForUser).toHaveBeenCalledWith(1);
      expect(passwordResetRepository.create).toHaveBeenCalled();
      expect(emailService.sendPasswordResetEmail).toHaveBeenCalled();
    });

    it('does not reveal if email does not exist', async () => {
      (userRepository.findByEmail as jest.Mock).mockResolvedValue(null);

      // Should not throw
      await expect(service.forgotPassword('nobody@test.com')).resolves.toBeUndefined();
      expect(emailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('resets password with valid token', async () => {
      (passwordResetRepository.findValidByTokenHash as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: 1,
        expires_at: new Date(Date.now() + 3600000),
      });

      const { tokenService } = jest.requireActual('../../src/services/TokenService');
      jest.spyOn(tokenService, 'hashToken').mockResolvedValue('hash');

      await service.resetPassword('reset-token', 'NewPassword1!');

      expect(userRepository.updatePassword).toHaveBeenCalled();
      expect(passwordResetRepository.markUsed).toHaveBeenCalledWith(1);
      expect(refreshTokenRepository.revokeAllForUser).toHaveBeenCalledWith(1);
    });

    it('throws BadRequestError for invalid token', async () => {
      (passwordResetRepository.findValidByTokenHash as jest.Mock).mockResolvedValue(null);

      await expect(service.resetPassword('invalid', 'NewPass1!')).rejects.toThrow(BadRequestError);
    });
  });

  describe('verifyEmail', () => {
    it('verifies email with valid token', async () => {
      (emailVerificationRepository.findValidByTokenHash as jest.Mock).mockResolvedValue({
        id: 1,
        user_id: 1,
        expires_at: new Date(Date.now() + 3600000),
      });

      await service.verifyEmail('verify-token');

      expect(userRepository.setEmailVerified).toHaveBeenCalledWith(1);
      expect(emailVerificationRepository.markUsed).toHaveBeenCalledWith(1);
    });

    it('throws BadRequestError for invalid token', async () => {
      (emailVerificationRepository.findValidByTokenHash as jest.Mock).mockResolvedValue(null);

      await expect(service.verifyEmail('invalid')).rejects.toThrow(BadRequestError);
    });
  });
});
