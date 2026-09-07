// ── Core engine ───────────────────────────────────────────────────────────
export { ArbitrageEngine } from './ArbitrageEngine';

// ── Calculators & checkers ───────────────────────────────────────────────
export { FeeCalculator } from './FeeCalculator';
export { NetworkChecker } from './NetworkChecker';
export { CrossExchangeLiquidityChecker } from './LiquidityChecker';
export { OpportunityCalculator } from './OpportunityCalculator';
export { OpportunityRanker } from './OpportunityRanker';

// ── Types ─────────────────────────────────────────────────────────────────
export type {
  ArbitrageEngineConfig,
  ArbitrageOpportunity,
  ArbitrageDirection,
  ArbitrageLiquidityCheck,
  ArbitrageSlippageEstimate,
  ArbitrageType,
  ComparablePair,
  DepositFeeInfo,
  ExchangeFees,
  ExchangeNetworkInfo,
  NetworkCosts,
  OpportunityStatus,
  TradingFeeSchedule,
  WithdrawalFeeInfo,
} from './types';

export type { RankerConfig, SortKey, SortDirection } from './OpportunityRanker';
