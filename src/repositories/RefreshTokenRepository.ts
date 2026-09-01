import { Op } from 'sequelize';
import { BaseRepository } from './BaseRepository';
import { RefreshToken } from '../models/RefreshToken';

export class RefreshTokenRepository extends BaseRepository<RefreshToken> {
  constructor() {
    super(RefreshToken);
  }

  async findValidByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    return this.findOne({
      where: { token_hash: tokenHash, is_revoked: false },
    });
  }

  async findValidFamily(family: string): Promise<RefreshToken | null> {
    return this.findOne({
      where: { family, is_revoked: false },
    });
  }

  async revokeFamily(family: string): Promise<void> {
    await this.model.update({ is_revoked: true }, { where: { family } });
  }

  async revokeAllForUser(userId: number): Promise<void> {
    await this.model.update({ is_revoked: true }, { where: { user_id: userId } });
  }

  async revokeByTokenHash(tokenHash: string): Promise<void> {
    await this.model.update({ is_revoked: true }, { where: { token_hash: tokenHash } });
  }

  async deleteExpired(): Promise<number> {
    const count = await this.model.destroy({
      where: { expires_at: { [Op.lt]: new Date() } },
    });
    return count;
  }

  async countActiveForUser(userId: number): Promise<number> {
    return this.count({
      where: { user_id: userId, is_revoked: false },
    });
  }
}

export const refreshTokenRepository = new RefreshTokenRepository();
