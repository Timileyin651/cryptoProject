import { Op } from 'sequelize';
import { TradingPair } from '../models/TradingPair';
import { ExchangeMarket, MarketType, MarketStatus } from '../models/ExchangeMarket';
import { PairSymbolMapping } from '../models/PairSymbolMapping';
import { Exchange } from '../models/Exchange';
import { Coin } from '../models/Coin';
import { NotFoundError, BadRequestError } from '../utils/errors';
import { logger } from '../utils/logger';

class MarketService {
  // ──────────────── Symbol resolution ───────────────────────────────────

  /**
   * Resolve our normalised symbol (e.g. "BTC/USDT") to an exchange-specific
   * symbol (e.g. "BTCUSDT") via the pair_symbol_mappings table.
   */
  async resolveExchangeSymbol(
    exchangeId: number,
    normalizedSymbol: string,
  ): Promise<PairSymbolMapping | null> {
    return PairSymbolMapping.findOne({
      where: { exchange_id: exchangeId, normalized_symbol: normalizedSymbol },
    });
  }

  /**
   * Resolve an exchange symbol back to our normalised symbol.
   */
  async resolveNormalizedSymbol(
    exchangeId: number,
    exchangeSymbol: string,
  ): Promise<PairSymbolMapping | null> {
    return PairSymbolMapping.findOne({
      where: { exchange_id: exchangeId, exchange_symbol: exchangeSymbol },
    });
  }

  /**
   * Bulk resolve: given a normalised symbol, return all exchange symbols
   * across every exchange that lists it.
   */
  async resolveAllExchangeSymbols(
    normalizedSymbol: string,
  ): Promise<(PairSymbolMapping & { exchange: Exchange })[]> {
    return PairSymbolMapping.findAll({
      where: { normalized_symbol: normalizedSymbol },
      include: [{ model: Exchange, as: 'exchange' }],
    }) as any;
  }

  /**
   * Create or update a symbol mapping.
   */
  async upsertSymbolMapping(data: {
    tradingPairId: number;
    exchangeId: number;
    normalizedSymbol: string;
    exchangeSymbol: string;
    baseCoinId?: number;
    quoteCoinId?: number;
  }): Promise<PairSymbolMapping> {
    const existing = await PairSymbolMapping.findOne({
      where: {
        trading_pair_id: data.tradingPairId,
        exchange_id: data.exchangeId,
      },
    });

    if (existing) {
      await existing.update({
        normalized_symbol: data.normalizedSymbol,
        exchange_symbol: data.exchangeSymbol,
        base_coin_id: data.baseCoinId ?? existing.base_coin_id,
        quote_coin_id: data.quoteCoinId ?? existing.quote_coin_id,
      });
      return existing;
    }

    return PairSymbolMapping.create({
      trading_pair_id: data.tradingPairId,
      exchange_id: data.exchangeId,
      normalized_symbol: data.normalizedSymbol,
      exchange_symbol: data.exchangeSymbol,
      base_coin_id: data.baseCoinId ?? null,
      quote_coin_id: data.quoteCoinId ?? null,
    });
  }

  // ──────────────── Market CRUD ─────────────────────────────────────────

  async listMarkets(
    exchangeId?: number,
    options?: { marketType?: MarketType; status?: MarketStatus },
  ): Promise<(ExchangeMarket & { tradingPair: TradingPair; exchange: Exchange })[]> {
    const where: Record<string, unknown> = {};
    if (exchangeId) where.exchange_id = exchangeId;
    if (options?.marketType) where.market_type = options.marketType;
    if (options?.status) where.status = options.status;

    return ExchangeMarket.findAll({
      where,
      include: [
        { model: TradingPair, as: 'tradingPair' },
        { model: Exchange, as: 'exchange' },
      ],
      order: [['exchange_id', 'ASC']],
    }) as any;
  }

  async getMarketById(id: number): Promise<ExchangeMarket> {
    const market = await ExchangeMarket.findByPk(id);
    if (!market) throw new NotFoundError(`ExchangeMarket #${id} not found`);
    return market;
  }

  async getMarketForPairOnExchange(
    tradingPairId: number,
    exchangeId: number,
  ): Promise<ExchangeMarket | null> {
    return ExchangeMarket.findOne({
      where: { trading_pair_id: tradingPairId, exchange_id: exchangeId },
    });
  }

  async upsertMarket(data: {
    tradingPairId: number;
    exchangeId: number;
    marketType?: MarketType;
    takerFee?: number;
    makerFee?: number;
    minOrderSize?: number | null;
    maxOrderSize?: number | null;
    minPriceTick?: number | null;
    minQtyTick?: number | null;
    status?: MarketStatus;
  }): Promise<ExchangeMarket> {
    const existing = await this.getMarketForPairOnExchange(
      data.tradingPairId,
      data.exchangeId,
    );

    if (existing) {
      const updates: Record<string, unknown> = {};
      if (data.marketType !== undefined) updates.market_type = data.marketType;
      if (data.takerFee !== undefined) updates.taker_fee = data.takerFee;
      if (data.makerFee !== undefined) updates.maker_fee = data.makerFee;
      if (data.minOrderSize !== undefined) updates.min_order_size = data.minOrderSize;
      if (data.maxOrderSize !== undefined) updates.max_order_size = data.maxOrderSize;
      if (data.minPriceTick !== undefined) updates.min_price_tick = data.minPriceTick;
      if (data.minQtyTick !== undefined) updates.min_qty_tick = data.minQtyTick;
      if (data.status !== undefined) updates.status = data.status;

      if (Object.keys(updates).length > 0) {
        await existing.update(updates);
      }
      return existing.reload();
    }

    return ExchangeMarket.create({
      trading_pair_id: data.tradingPairId,
      exchange_id: data.exchangeId,
      market_type: data.marketType ?? 'spot',
      taker_fee: data.takerFee ?? 0.001,
      maker_fee: data.makerFee ?? 0.001,
      min_order_size: data.minOrderSize ?? null,
      max_order_size: data.maxOrderSize ?? null,
      min_price_tick: data.minPriceTick ?? null,
      min_qty_tick: data.minQtyTick ?? null,
      status: data.status ?? 'active',
      supports_orderbook: false,
      supports_ticker: true,
      supports_trades: false,
    });
  }

  // ──────────────── Fee lookups ─────────────────────────────────────────

  /**
   * Get the taker fee for a specific pair on a specific exchange.
   * Returns the fee as a decimal (0.001 = 0.1%).
   */
  async getTakerFee(tradingPairId: number, exchangeId: number): Promise<number | null> {
    const market = await this.getMarketForPairOnExchange(tradingPairId, exchangeId);
    return market?.taker_fee ?? null;
  }

  /**
   * Get the maker fee for a specific pair on a specific exchange.
   */
  async getMakerFee(tradingPairId: number, exchangeId: number): Promise<number | null> {
    const market = await this.getMarketForPairOnExchange(tradingPairId, exchangeId);
    return market?.maker_fee ?? null;
  }

  /**
   * Compare fees across all exchanges for a given normalised symbol.
   * Returns markets sorted by taker fee ascending.
   */
  async compareFees(normalizedSymbol: string): Promise<
    {
      exchange: Exchange;
      market: ExchangeMarket;
      takerFee: number;
      makerFee: number;
    }[]
  > {
    const mappings = await this.resolveAllExchangeSymbols(normalizedSymbol);
    const results: {
      exchange: Exchange;
      market: ExchangeMarket;
      takerFee: number;
      makerFee: number;
    }[] = [];

    for (const mapping of mappings) {
      const tp = await TradingPair.findByPk(mapping.trading_pair_id);
      if (!tp) continue;

      const market = await this.getMarketForPairOnExchange(tp.id, mapping.exchange_id);
      if (!market || market.status !== 'active') continue;

      results.push({
        exchange: (mapping as any).exchange,
        market,
        takerFee: parseFloat(String(market.taker_fee)),
        makerFee: parseFloat(String(market.maker_fee)),
      });
    }

    results.sort((a, b) => a.takerFee - b.takerFee);
    return results;
  }

  // ──────────────── Arbitrage-friendly queries ──────────────────────────

  /**
   * Find all active markets for a given normalised symbol across exchanges.
   * Useful for the arbitrage scanner to know where a pair is tradeable.
   */
  async findActiveMarketsForSymbol(normalizedSymbol: string): Promise<
    (ExchangeMarket & { exchange: Exchange; tradingPair: TradingPair })[]
  > {
    const mappings = await this.resolveAllExchangeSymbols(normalizedSymbol);
    const results: (ExchangeMarket & { exchange: Exchange; tradingPair: TradingPair })[] = [];

    for (const mapping of mappings) {
      const tp = await TradingPair.findByPk(mapping.trading_pair_id);
      if (!tp) continue;

      const market = await this.getMarketForPairOnExchange(tp.id, mapping.exchange_id);
      if (!market || market.status !== 'active') continue;

      results.push({
        ...market.toJSON(),
        exchange: (mapping as any).exchange,
        tradingPair: tp,
      } as any);
    }

    return results;
  }
}

export const marketService = new MarketService();
export { MarketService };
