import { BaseRepository } from './BaseRepository';
import { EmailVerification } from '../models/EmailVerification';

export class EmailVerificationRepository extends BaseRepository<EmailVerification> {
  constructor() {
    super(EmailVerification);
  }

  async findValidByTokenHash(tokenHash: string): Promise<EmailVerification | null> {
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

export const emailVerificationRepository = new EmailVerificationRepository();
