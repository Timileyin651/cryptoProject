import { redisClient } from '../config/redis';
import {
  NormalizedTicker,
  NormalizedSymbol,
  MarketDataHashFields,
  marketDataKey,
  exchangeKeySet,
  tickerToHashFields,
} from './types';
import { logger } from '../utils/logger';

/**
 * TTL for market data entries. After this long without an update,
 * the entry is considered stale and will be reaped by a cleanup sweep.
 */
const DEFAULT_TTL_SECONDS = 300; // 5 minutes

class MarketDataStore {
  // ──────────────────── Write ───────────────────────────────────────────

  /**
   * Store a ticker snapshot in Redis as a flat hash.
   * Also adds the key to the exchange's key-set for enumeration.
   */
  async setTicker(ticker: NormalizedTicker): Promise<void> {
    const key = marketDataKey(ticker.exchange, ticker.symbol);
    const fields = tickerToHashFields(ticker);

    const pipeline = redisClient.pipeline();
    pipeline.hset(key, fields as unknown as Record<string, string>);
    pipeline.expire(key, DEFAULT_TTL_SECONDS);
    pipeline.sadd(exchangeKeySet(ticker.exchange), key);
    pipeline.expire(exchangeKeySet(ticker.exchange), DEFAULT_TTL_SECONDS);

    try {
      await pipeline.exec();
    } catch (error) {
      logger.error(`[Store] Failed to write ticker for ${ticker.exchange}:${ticker.symbol}`, error);
    }
  }

  /**
   * Batch-write multiple tickers in a single pipeline.
   */
  async setTickers(tickers: NormalizedTicker[]): Promise<void> {
    if (tickers.length === 0) return;

    const pipeline = redisClient.pipeline();

    for (const ticker of tickers) {
      const key = marketDataKey(ticker.exchange, ticker.symbol);
      const fields = tickerToHashFields(ticker);
      pipeline.hset(key, fields as unknown as Record<string, string>);
      pipeline.expire(key, DEFAULT_TTL_SECONDS);
      pipeline.sadd(exchangeKeySet(ticker.exchange), key);
      pipeline.expire(exchangeKeySet(ticker.exchange), DEFAULT_TTL_SECONDS);
    }

    try {
      await pipeline.exec();
    } catch (error) {
      logger.error(`[Store] Failed to batch-write ${tickers.length} tickers`, error);
    }
  }

  // ──────────────────── Read ────────────────────────────────────────────

  /**
   * Get the latest market data for a specific symbol on a specific exchange.
   */
  async getTicker(
    exchange: string,
    symbol: NormalizedSymbol,
  ): Promise<MarketDataHashFields | null> {
    const key = marketDataKey(exchange, symbol);
    try {
      const data = await redisClient.hgetall(key);
      if (!data || Object.keys(data).length === 0) return null;
      return data as unknown as MarketDataHashFields;
    } catch (error) {
      logger.error(`[Store] Failed to read ticker for ${exchange}:${symbol}`, error);
      return null;
    }
  }

  /**
   * Get latest tickers for a symbol across all exchanges.
   * @param exchangeSlugs — list of exchange slugs to query (must be provided since Redis hashes are ephemeral)
   */
  async getTickerAllExchanges(
    symbol: NormalizedSymbol,
    exchangeSlugs: string[],
  ): Promise<MarketDataHashFields[]> {
    const results: MarketDataHashFields[] = [];

    const pipeline = redisClient.pipeline();
    const keys = exchangeSlugs.map((ex) => marketDataKey(ex, symbol));
    for (const key of keys) {
      pipeline.hgetall(key);
    }

    try {
      const responses = await pipeline.exec();
      if (!responses) return [];

      for (let i = 0; i < responses.length; i++) {
        const [err, data] = responses[i];
        if (err || !data || Object.keys(data).length === 0) continue;
        results.push(data as unknown as MarketDataHashFields);
      }
    } catch (error) {
      logger.error(`[Store] Failed to read tickers for ${symbol} across exchanges`, error);
    }

    return results;
  }

  /**
   * Get all tickers for a specific exchange.
   */
  async getAllTickersForExchange(exchange: string): Promise<MarketDataHashFields[]> {
    try {
      const keySet = await redisClient.smembers(exchangeKeySet(exchange));
      if (keySet.length === 0) return [];

      const pipeline = redisClient.pipeline();
      for (const key of keySet) {
        pipeline.hgetall(key);
      }

      const responses = await pipeline.exec();
      if (!responses) return [];

      const results: MarketDataHashFields[] = [];
      for (const [err, data] of responses) {
        if (err || !data || Object.keys(data).length === 0) continue;
        results.push(data as unknown as MarketDataHashFields);
      }
      return results;
    } catch (error) {
      logger.error(`[Store] Failed to read all tickers for ${exchange}`, error);
      return [];
    }
  }

  /**
   * Get the latest tickers for every symbol across all exchanges.
   * Returns a Map keyed by "exchange:symbol".
   * @param exchangeSlugs — list of exchange slugs to query.
   */
  async getAllTickers(exchangeSlugs: string[]): Promise<Map<string, MarketDataHashFields>> {
    const result = new Map<string, MarketDataHashFields>();

    for (const exchange of exchangeSlugs) {
      const tickers = await this.getAllTickersForExchange(exchange);
      for (const t of tickers) {
        result.set(`${t.exchange}:${t.symbol}`, t);
      }
    }

    return result;
  }

  // ──────────────────── Cleanup ─────────────────────────────────────────

  /**
   * Remove keys from exchange key-sets that no longer exist in Redis.
   * Run periodically to keep the sets clean.
   * @param exchangeSlugs — list of exchange slugs to sweep.
   */
  async reapStaleKeys(exchangeSlugs: string[]): Promise<number> {
    let reaped = 0;

    for (const exchange of exchangeSlugs) {
      const keySetKey = exchangeKeySet(exchange);
      const keys = await redisClient.smembers(keySetKey);
      if (keys.length === 0) continue;

      const pipeline = redisClient.pipeline();
      for (const key of keys) {
        pipeline.exists(key);
      }
      const responses = await pipeline.exec();
      if (!responses) continue;

      const staleKeys: string[] = [];
      for (let i = 0; i < responses.length; i++) {
        const [err, exists] = responses[i];
        if (!err && !exists) {
          staleKeys.push(keys[i]);
        }
      }

      if (staleKeys.length > 0) {
        await redisClient.srem(keySetKey, ...staleKeys);
        reaped += staleKeys.length;
      }
    }

    return reaped;
  }
}

export const marketDataStore = new MarketDataStore();
export { MarketDataStore };
