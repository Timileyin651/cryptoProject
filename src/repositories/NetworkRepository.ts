import { BaseRepository } from './BaseRepository';
import { Network } from '../models/Network';

export class NetworkRepository extends BaseRepository<Network> {
  constructor() {
    super(Network);
  }

  async findBySlug(slug: string): Promise<Network | null> {
    return this.findOne({ where: { slug: slug.toLowerCase() } });
  }

  async findByChainId(chainId: number): Promise<Network | null> {
    return this.findOne({ where: { chain_id: chainId } });
  }

  async findActive(): Promise<Network[]> {
    return this.findAll({ where: { is_active: true }, order: [['name', 'ASC']] });
  }
}

export const networkRepository = new NetworkRepository();
