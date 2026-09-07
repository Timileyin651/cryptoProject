import { BaseRepository } from './BaseRepository';
import { ExchangeMarket } from '../models/ExchangeMarket';
import { TradingPair } from '../models/TradingPair';
import { Exchange } from '../models/Exchange';

export class ExchangeMarketRepository extends BaseRepository<ExchangeMarket> {
  constructor() {
    super(ExchangeMarket);
  }

  async findByExchange(exchangeId: number): Promise<ExchangeMarket[]> {
    return this.findAll({
      where: { exchange_id: exchangeId },
      include: [{ model: TradingPair, as: 'tradingPair' }],
    });
  }

  async findByTradingPair(tradingPairId: number): Promise<ExchangeMarket[]> {
    return this.findAll({
      where: { trading_pair_id: tradingPairId },
      include: [{ model: Exchange, as: 'exchange' }],
    });
  }

  async findActive(): Promise<ExchangeMarket[]> {
    return this.findAll({ where: { status: 'active' } });
  }

  async findByPairAndExchange(
    tradingPairId: number,
    exchangeId: number,
  ): Promise<ExchangeMarket | null> {
    return this.findOne({
      where: { trading_pair_id: tradingPairId, exchange_id: exchangeId },
    });
  }
}

export const exchangeMarketRepository = new ExchangeMarketRepository();
