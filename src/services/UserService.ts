import bcrypt from 'bcryptjs';
import { userRepository } from '../repositories/UserRepository';
import { refreshTokenRepository } from '../repositories/RefreshTokenRepository';
import { NotFoundError, BadRequestError, ConflictError } from '../utils/errors';

const BCRYPT_SALT_ROUNDS = 12;

export interface UserProfile {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isEmailVerified: boolean;
  createdAt: Date;
}

export class UserService {
  async getProfile(userId: number): Promise<UserProfile> {
    const user = await userRepository.findByIdOrThrow(userId);
    return {
      id: user.id,
      email: user.email,
      firstName: user.first_name,
      lastName: user.last_name,
      isEmailVerified: user.is_email_verified,
      createdAt: user.created_at,
    };
  }

  async updateProfile(
    userId: number,
    data: { firstName?: string; lastName?: string; email?: string },
  ): Promise<UserProfile> {
    const user = await userRepository.findByIdOrThrow(userId);

    // Check email uniqueness if changing
    if (data.email && data.email !== user.email) {
      const existing = await userRepository.findByEmail(data.email);
      if (existing) {
        throw new ConflictError('Email already in use');
      }
    }

    const updates: Record<string, unknown> = {};
    if (data.firstName !== undefined) updates.first_name = data.firstName;
    if (data.lastName !== undefined) updates.last_name = data.lastName;
    if (data.email !== undefined) updates.email = data.email.toLowerCase();

    if (Object.keys(updates).length > 0) {
      await user.update(updates);
    }

    const updated = await userRepository.findByIdOrThrow(userId);
    return {
      id: updated.id,
      email: updated.email,
      firstName: updated.first_name,
      lastName: updated.last_name,
      isEmailVerified: updated.is_email_verified,
      createdAt: updated.created_at,
    };
  }

  async changePassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    const user = await userRepository.findByIdOrThrow(userId);

    const isCurrentValid = await bcrypt.compare(currentPassword, user.password_hash);
    if (!isCurrentValid) {
      throw new BadRequestError('Current password is incorrect');
    }

    const newHash = await bcrypt.hash(newPassword, BCRYPT_SALT_ROUNDS);
    await userRepository.updatePassword(userId, newHash);

    // Revoke all refresh tokens for security
    await refreshTokenRepository.revokeAllForUser(userId);
  }

  async deactivateAccount(userId: number): Promise<void> {
    await userRepository.setActive(userId, false);
    await refreshTokenRepository.revokeAllForUser(userId);
  }

  async activateAccount(userId: number): Promise<void> {
    await userRepository.setActive(userId, true);
  }
}

export const userService = new UserService();
