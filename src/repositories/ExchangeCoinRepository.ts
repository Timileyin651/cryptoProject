import { BaseRepository } from './BaseRepository';
import { ExchangeCoin } from '../models/ExchangeCoin';
import { Coin } from '../models/Coin';
import { Network } from '../models/Network';

export class ExchangeCoinRepository extends BaseRepository<ExchangeCoin> {
  constructor() {
    super(ExchangeCoin);
  }

  async findByExchange(exchangeId: number): Promise<ExchangeCoin[]> {
    return this.findAll({
      where: { exchange_id: exchangeId },
      include: [
        { model: Coin, as: 'coin' },
        { model: Network, as: 'network' },
      ],
    });
  }

  async findByCoin(coinId: number): Promise<ExchangeCoin[]> {
    return this.findAll({ where: { coin_id: coinId } });
  }

  async findByExchangeAndCoin(
    exchangeId: number,
    coinId: number,
    networkId?: number,
  ): Promise<ExchangeCoin | null> {
    const where: Record<string, unknown> = {
      exchange_id: exchangeId,
      coin_id: coinId,
    };
    if (networkId !== undefined) {
      where.network_id = networkId;
    }
    return this.findOne({ where });
  }

  async findDepositEnabled(): Promise<ExchangeCoin[]> {
    return this.findAll({ where: { deposit_enabled: true } });
  }

  async findWithdrawalEnabled(): Promise<ExchangeCoin[]> {
    return this.findAll({ where: { withdrawal_enabled: true } });
  }
}

export const exchangeCoinRepository = new ExchangeCoinRepository();
