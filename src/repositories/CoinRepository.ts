import { BaseRepository } from './BaseRepository';
import { Coin } from '../models/Coin';

export class CoinRepository extends BaseRepository<Coin> {
  constructor() {
    super(Coin);
  }

  async findBySymbol(symbol: string): Promise<Coin | null> {
    return this.findOne({ where: { symbol: symbol.toUpperCase() } });
  }

  async findBySlug(slug: string): Promise<Coin | null> {
    return this.findOne({ where: { slug: slug.toLowerCase() } });
  }

  async findActive(): Promise<Coin[]> {
    return this.findAll({ where: { is_active: true }, order: [['symbol', 'ASC']] });
  }

  async findByCoingeckoId(coingeckoId: string): Promise<Coin | null> {
    return this.findOne({ where: { coingecko_id: coingeckoId } });
  }
}

export const coinRepository = new CoinRepository();
