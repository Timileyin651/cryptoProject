import { BaseRepository } from './BaseRepository';
import { User } from '../models/User';

export class UserRepository extends BaseRepository<User> {
  constructor() {
    super(User);
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email: email.toLowerCase() } });
  }

  async findActiveByEmail(email: string): Promise<User | null> {
    return this.findOne({ where: { email: email.toLowerCase(), is_active: true } });
  }

  async create(data: Partial<User['_creationAttributes']>): Promise<User> {
    const userData = {
      ...data,
      email: (data.email as string).toLowerCase(),
    };
    return super.create(userData);
  }

  async updateLastLogin(id: number): Promise<void> {
    await this.model.update({ last_login_at: new Date() }, { where: { id } });
  }

  async setEmailVerified(id: number): Promise<void> {
    await this.model.update({ is_email_verified: true }, { where: { id } });
  }

  async setActive(id: number, isActive: boolean): Promise<void> {
    await this.model.update({ is_active: isActive }, { where: { id } });
  }

  async updatePassword(id: number, passwordHash: string): Promise<void> {
    await this.model.update({ password_hash: passwordHash }, { where: { id } });
  }
}

export const userRepository = new UserRepository();
