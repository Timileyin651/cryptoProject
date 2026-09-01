import bcrypt from 'bcryptjs';
import { config } from '../config';
import { userRepository } from '../repositories/UserRepository';
import { refreshTokenRepository } from '../repositories/RefreshTokenRepository';
import { emailVerificationRepository } from '../repositories/EmailVerificationRepository';
import { passwordResetRepository } from '../repositories/PasswordResetRepository';
import { tokenService, TokenPayload, AccessTokenPair } from './TokenService';
import { emailService } from './EmailService';
import {
  BadRequestError,
  ConflictError,
  UnauthorizedError,
  NotFoundError,
} from '../utils/errors';

const BCRYPT_SALT_ROUNDS = 12;

export class AuthService {
  async register(
    email: string,
    password: string,
    firstName: string,
    lastName: string,
    userAgent?: string,
  ): Promise<{ user: { id: number; email: string; firstName: string; lastName: string }; tokens: AccessTokenPair }> {
    const existing = await userRepository.findByEmail(email);
    if (existing) {
      throw new ConflictError('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);

    const user = await userRepository.create({
      email,
      password_hash: passwordHash,
      first_name: firstName,
      last_name: lastName,
      is_email_verified: false,
      is_active: true,
    });

    // Generate tokens
    const tokens = await this.generateTokenPair(user.id, user.email, userAgent);

    // Send verification email
    const verificationToken = tokenService.generateEmailVerificationToken();
    const tokenHash = await tokenService.hashToken(verificationToken);
    await emailVerificationRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: tokenService.getEmailVerificationExpiry(),
    });
    await emailService.sendVerificationEmail(user.email, user.first_name, verificationToken);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      tokens,
    };
  }

  async login(
    email: string,
    password: string,
    userAgent?: string,
  ): Promise<{ user: { id: number; email: string; firstName: string; lastName: string }; tokens: AccessTokenPair }> {
    const user = await userRepository.findByEmail(email);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('Invalid email or password');
    }

    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      throw new UnauthorizedError('Invalid email or password');
    }

    await userRepository.updateLastLogin(user.id);

    const tokens = await this.generateTokenPair(user.id, user.email, userAgent);

    return {
      user: {
        id: user.id,
        email: user.email,
        firstName: user.first_name,
        lastName: user.last_name,
      },
      tokens,
    };
  }

  async refresh(
    refreshTokenValue: string,
    userAgent?: string,
  ): Promise<AccessTokenPair> {
    // Find the refresh token by looking through all valid tokens
    const allTokens = await refreshTokenRepository.findAll({
      where: { is_revoked: false },
    });

    let matchedToken = null;
    for (const stored of allTokens) {
      const isValid = await tokenService.verifyTokenHash(refreshTokenValue, stored.token_hash);
      if (isValid) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      throw new UnauthorizedError('Invalid refresh token');
    }

    // Check if token is expired
    if (new Date() > matchedToken.expires_at) {
      await refreshTokenRepository.revokeByTokenHash(matchedToken.token_hash);
      throw new UnauthorizedError('Refresh token expired');
    }

    // Check if family is blacklisted (reuse detection)
    if (await tokenService.isRefreshTokenFamilyBlacklisted(matchedToken.family)) {
      // Token reuse detected! Revoke entire family
      await refreshTokenRepository.revokeFamily(matchedToken.family);
      throw new UnauthorizedError('Refresh token family revoked due to reuse detection');
    }

    // Get the user
    const user = await userRepository.findById(matchedToken.user_id);
    if (!user || !user.is_active) {
      throw new UnauthorizedError('User not found or inactive');
    }

    // Revoke the old refresh token (rotation)
    await refreshTokenRepository.revokeByTokenHash(matchedToken.token_hash);

    // Generate new token pair with same family
    return this.generateTokenPair(user.id, user.email, userAgent, matchedToken.family);
  }

  async logout(refreshTokenValue?: string): Promise<void> {
    if (refreshTokenValue) {
      const allTokens = await refreshTokenRepository.findAll({
        where: { is_revoked: false },
      });
      for (const stored of allTokens) {
        const isValid = await tokenService.verifyTokenHash(refreshTokenValue, stored.token_hash);
        if (isValid) {
          await refreshTokenRepository.revokeByTokenHash(stored.token_hash);
          break;
        }
      }
    }
  }

  async logoutAll(userId: number): Promise<void> {
    await refreshTokenRepository.revokeAllForUser(userId);
  }

  async forgotPassword(email: string): Promise<void> {
    const user = await userRepository.findByEmail(email);
    if (!user) {
      // Don't reveal if email exists
      return;
    }

    // Invalidate existing password reset tokens
    await passwordResetRepository.invalidateAllForUser(user.id);

    const resetToken = tokenService.generatePasswordResetToken();
    const tokenHash = await tokenService.hashToken(resetToken);

    await passwordResetRepository.create({
      user_id: user.id,
      token_hash: tokenHash,
      expires_at: tokenService.getPasswordResetExpiry(),
    });

    await emailService.sendPasswordResetEmail(user.email, user.first_name, resetToken);
  }

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const allTokens = await passwordResetRepository.findAll({
      where: { is_used: false },
    });

    let matchedToken = null;
    for (const stored of allTokens) {
      const isValid = await tokenService.verifyTokenHash(token, stored.token_hash);
      if (isValid) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      throw new BadRequestError('Invalid or expired reset token');
    }

    if (new Date() > matchedToken.expires_at) {
      await passwordResetRepository.markUsed(matchedToken.id);
      throw new BadRequestError('Invalid or expired reset token');
    }

    const passwordHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await userRepository.updatePassword(matchedToken.user_id, passwordHash);
    await passwordResetRepository.markUsed(matchedToken.id);

    // Revoke all refresh tokens for security
    await refreshTokenRepository.revokeAllForUser(matchedToken.user_id);
  }

  async verifyEmail(token: string): Promise<void> {
    const allTokens = await emailVerificationRepository.findAll({
      where: { is_used: false },
    });

    let matchedToken = null;
    for (const stored of allTokens) {
      const isValid = await tokenService.verifyTokenHash(token, stored.token_hash);
      if (isValid) {
        matchedToken = stored;
        break;
      }
    }

    if (!matchedToken) {
      throw new BadRequestError('Invalid or expired verification token');
    }

    if (new Date() > matchedToken.expires_at) {
      await emailVerificationRepository.markUsed(matchedToken.id);
      throw new BadRequestError('Invalid or expired verification token');
    }

    await userRepository.setEmailVerified(matchedToken.user_id);
    await emailVerificationRepository.markUsed(matchedToken.id);
  }

  private async generateTokenPair(
    userId: number,
    email: string,
    userAgent?: string,
    existingFamily?: string,
  ): Promise<AccessTokenPair> {
    const payload: TokenPayload = { userId, email };
    const accessToken = tokenService.generateAccessToken(payload);

    const refreshTokenValue = tokenService.generateRefreshToken();
    const tokenHash = await tokenService.hashToken(refreshTokenValue);
    const family = existingFamily || tokenService.generateRefreshTokenFamily();
    const expiresAt = tokenService.getRefreshTokenExpiry();

    await refreshTokenRepository.create({
      user_id: userId,
      token_hash: tokenHash,
      family,
      expires_at: expiresAt,
      user_agent: userAgent || null,
    });

    return {
      accessToken,
      refreshToken: refreshTokenValue,
      refreshTokenFamily: family,
      expiresAt,
    };
  }
}

export const authService = new AuthService();
