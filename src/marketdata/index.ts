export { marketDataEngine, MarketDataEngine } from './MarketDataEngine';
export type { MarketDataEngineConfig } from './MarketDataEngine';
export { marketDataStore, MarketDataStore } from './MarketDataStore';
export { WsStream } from './WsStream';
export type { WsStreamConfig } from './WsStream';
export { streamRegistry, registerBuiltInStreams } from './StreamRegistry';
export type { StreamFactory } from './StreamRegistry';
export { BinanceWsStream } from './streams/BinanceWsStream';
export { BybitWsStream } from './streams/BybitWsStream';
export { OkxWsStream } from './streams/OkxWsStream';
export type {
  NormalizedTicker,
  NormalizedTrade,
  NormalizedOrderBook,
  NormalizedSymbol,
  StreamHealth,
  MarketDataHashFields,
} from './types';
export { marketDataKey, exchangeKeySet, tickerToHashFields } from './types';

// ── Order-book & liquidity analysis ──────────────────────────────────────
export { OrderBookNormalizer } from './orderbook';
export type { OrderBookMetrics, DepthLevel, NormalizedBookWithMetrics } from './orderbook';
export { LiquidityChecker } from './orderbook';
export type { LiquidityCheckRequest, LiquidityCheckResult } from './orderbook';
export { SlippageCalculator } from './orderbook';
export type { SlippageEstimate, SlippageLevelDetail } from './orderbook';
