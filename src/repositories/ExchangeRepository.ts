import { BaseRepository } from './BaseRepository';
import { Exchange } from '../models/Exchange';

export class ExchangeRepository extends BaseRepository<Exchange> {
  constructor() {
    super(Exchange);
  }

  async findBySlug(slug: string): Promise<Exchange | null> {
    return this.findOne({ where: { slug } });
  }

  async findActive(): Promise<Exchange[]> {
    return this.findAll({ where: { is_active: true } });
  }
}

export const exchangeRepository = new ExchangeRepository();
