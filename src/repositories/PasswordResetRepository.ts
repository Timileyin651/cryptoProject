import { BaseRepository } from './BaseRepository';
import { PasswordReset } from '../models/PasswordReset';

export class PasswordResetRepository extends BaseRepository<PasswordReset> {
  constructor() {
    super(PasswordReset);
  }

  async findValidByTokenHash(tokenHash: string): Promise<PasswordReset | null> {
    return this.findOne({
      where: { token_hash: tokenHash, is_used: false },
    });
  }

  async markUsed(id: number): Promise<void> {
    await this.model.update({ is_used: true }, { where: { id } });
  }

  async invalidateAllForUser(userId: number): Promise<void> {
    await this.model.update({ is_used: true }, { where: { user_id: userId } });
  }
}

export const passwordResetRepository = new PasswordResetRepository();
