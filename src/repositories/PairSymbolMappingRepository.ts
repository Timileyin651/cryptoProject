import { BaseRepository } from './BaseRepository';
import { PairSymbolMapping } from '../models/PairSymbolMapping';

export class PairSymbolMappingRepository extends BaseRepository<PairSymbolMapping> {
  constructor() {
    super(PairSymbolMapping);
  }

  async findByExchange(exchangeId: number): Promise<PairSymbolMapping[]> {
    return this.findAll({ where: { exchange_id: exchangeId } });
  }

  async findByNormalizedSymbol(normalizedSymbol: string): Promise<PairSymbolMapping[]> {
    return this.findAll({ where: { normalized_symbol: normalizedSymbol } });
  }

  async findByExchangeAndNormalized(
    exchangeId: number,
    normalizedSymbol: string,
  ): Promise<PairSymbolMapping | null> {
    return this.findOne({
      where: { exchange_id: exchangeId, normalized_symbol: normalizedSymbol },
    });
  }

  async findByExchangeAndExchangeSymbol(
    exchangeId: number,
    exchangeSymbol: string,
  ): Promise<PairSymbolMapping | null> {
    return this.findOne({
      where: { exchange_id: exchangeId, exchange_symbol: exchangeSymbol },
    });
  }
}

export const pairSymbolMappingRepository = new PairSymbolMappingRepository();
