import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { config } from '../config';
import { redisClient } from '../config/redis';
import { UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

export interface TokenPayload {
  userId: number;
  email: string;
}

export interface AccessTokenPair {
  accessToken: string;
  refreshToken: string;
  refreshTokenFamily: string;
  expiresAt: Date;
}

const REFRESH_TOKEN_SALT_ROUNDS = 10;

export class TokenService {
  generateAccessToken(payload: TokenPayload): string {
    return jwt.sign(payload, config.jwt.secret, {
      expiresIn: config.jwt.accessExpiresIn,
    } as jwt.SignOptions);
  }

  generateRefreshToken(): string {
    return crypto.randomBytes(40).toString('hex');
  }

  generateRefreshTokenFamily(): string {
    return uuidv4();
  }

  async hashToken(token: string): Promise<string> {
    return bcrypt.hash(token, REFRESH_TOKEN_SALT_ROUNDS);
  }

  async verifyTokenHash(token: string, hash: string): Promise<boolean> {
    return bcrypt.compare(token, hash);
  }

  verifyAccessToken(token: string): TokenPayload {
    try {
      return jwt.verify(token, config.jwt.secret) as TokenPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired access token');
    }
  }

  generateEmailVerificationToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generatePasswordResetToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  getRefreshTokenExpiry(): Date {
    const ms = this.parseDuration(config.jwt.refreshExpiresIn as string);
    return new Date(Date.now() + ms);
  }

  getEmailVerificationExpiry(): Date {
    return new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours
  }

  getPasswordResetExpiry(): Date {
    return new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  }

  // Redis helpers for token blacklist
  async blacklistAccessToken(token: string, ttlSeconds: number): Promise<void> {
    const key = `bl:access:${token}`;
    await redisClient.set(key, '1', 'EX', ttlSeconds);
  }

  async isAccessTokenBlacklisted(token: string): Promise<boolean> {
    const key = `bl:access:${token}`;
    const result = await redisClient.get(key);
    return result !== null;
  }

  async blacklistRefreshTokenFamily(family: string): Promise<void> {
    const key = `bl:family:${family}`;
    await redisClient.set(key, '1', 'EX', 7 * 24 * 60 * 60); // 7 days
  }

  async isRefreshTokenFamilyBlacklisted(family: string): Promise<boolean> {
    const key = `bl:family:${family}`;
    const result = await redisClient.get(key);
    return result !== null;
  }

  getAccessTokenExpiryMs(): number {
    return this.parseDuration(config.jwt.accessExpiresIn as string);
  }

  private parseDuration(duration: string): number {
    const match = duration.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      return 7 * 24 * 60 * 60 * 1000; // default 7 days
    }
    const value = parseInt(match[1], 10);
    const unit = match[2];
    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: return 7 * 24 * 60 * 60 * 1000;
    }
  }
}

export const tokenService = new TokenService();
