// ──────────────────── Funding Rate Data ─────────────────────────────────

/**
 * A funding rate snapshot for a specific exchange and symbol.
 * Collected and cached by FundingRateService.
 */
export interface FundingRateEntry {
  /** Exchange slug (e.g. "binance"). */
  exchange: string;
  /** Normalized swap symbol (e.g. "BTC/USDT:USDT"). */
  symbol: string;
  /** The funding rate as a fraction (e.g. 0.0001 = 0.01%). */
  fundingRate: number;
  /** When this funding rate was recorded by the exchange. */
  timestamp: number;
  /** When we fetched this snapshot. */
  fetchedAt: number;
  /** Next scheduled funding time, if known. */
  nextFundingTime?: number;
  /** Estimated interval between funding settlements in ms. */
  fundingIntervalMs?: number;
}

/**
 * Historical funding rate record for charting and analysis.
 */
export interface FundingRateHistoryRecord {
  exchange: string;
  symbol: string;
  fundingRate: number;
  timestamp: number;
}

/**
 * A matched spot + perp pair for basis calculation.
 */
export interface SpotPerpPair {
  /** Exchange slug. */
  exchange: string;
  /** Spot symbol (e.g. "BTC/USDT"). */
  spotSymbol: string;
  /** Perpetual swap symbol (e.g. "BTC/USDT:USDT"). */
  perpSymbol: string;
  /** Base currency. */
  baseCurrency: string;
  /** Quote currency. */
  quoteCurrency: string;
}

// ──────────────────── Basis Spread ──────────────────────────────────────

/**
 * Result of a basis spread calculation for one spot/perp pair on one exchange.
 */
export interface BasisSpreadResult {
  /** Unique id for this snapshot. */
  id: string;
  /** Exchange slug. */
  exchange: string;
  /** Base currency. */
  baseCurrency: string;
  /** Quote currency. */
  quoteCurrency: string;
  /** Spot symbol. */
  spotSymbol: string;
  /** Perp symbol. */
  perpSymbol: string;

  // ── Prices ───────────────────────────────────────────────────────
  /** Current spot price (last traded). */
  spotPrice: number;
  /** Current perpetual futures price (last traded). */
  perpPrice: number;

  // ── Basis ────────────────────────────────────────────────────────
  /**
   * Basis = perpPrice - spotPrice.
   * Positive = perp trades at a premium (contango).
   * Negative = perp trades at a discount (backwardation).
   */
  basis: number;
  /** Basis as a fraction of spot price. */
  basisPct: number;

  // ── Funding ──────────────────────────────────────────────────────
  /** Current funding rate (fraction). */
  currentFundingRate: number;
  /** Current funding rate as an APR (annualized). */
  fundingRateApr: number;
  /** Estimated interval between settlements in ms. */
  fundingIntervalMs: number;
  /** Next funding time if known. */
  nextFundingTime?: number;

  // ── Expected returns (all estimates) ─────────────────────────────
  /**
   * Expected funding income/cost per interval for a given holding horizon.
   * Positive = you receive funding; negative = you pay funding.
   *
   * For "long spot / short perp": you RECEIVE funding when rate > 0
   * (perp holders pay spot holders). You PAY when rate < 0.
   *
   * For "short spot / long perp": inverse of the above.
   */
  expectedFundingPerInterval: number;
  /** Number of funding intervals in the holding horizon. */
  intervalsInHorizon: number;
  /** Total expected funding income/cost over the horizon. */
  totalExpectedFunding: number;

  // ── Basis convergence estimate ───────────────────────────────────
  /**
   * Estimated basis convergence profit/loss over the horizon.
   * Basis typically converges toward zero near settlement or can
   * be captured by closing the position. This is a rough estimate.
   */
  basisConvergenceEstimate: number;

  // ── Net economics ───────────────────────────────────────────────
  /** Total estimated return = funding accrual + basis convergence. */
  totalEstimatedReturn: number;
  /** Estimated return as fraction of notional. */
  estimatedReturnPct: number;
  /** Trading fees for both legs (spot buy + perp sell, or inverse). */
  entryFees: number;
  /** Trading fees for closing both legs. */
  exitFees: number;
  /** Total fees (entry + exit). */
  totalFees: number;
  /** Net return after fees. */
  netReturnEstimate: number;
  /** Net return as fraction of notional. */
  netReturnPct: number;

  // ── Position details ─────────────────────────────────────────────
  /** Suggested position direction. */
  positionSide: PositionSide;
  /** Leverage assumption (default 1x). */
  leverage: number;
  /** Trade size in base currency for evaluation. */
  tradeSizeBase: number;
  /** Notional value in quote currency. */
  notionalValue: number;

  // ── Metadata ─────────────────────────────────────────────────────
  /** When this calculation was performed. */
  calculatedAt: number;
  /** Status of the opportunity. */
  status: FundingOpportunityStatus;
  /** Human-readable status reason. */
  statusReason?: string;
  /** Whether all values are estimates (always true for funding rates). */
  isEstimate: boolean;
}

// ──────────────────── Enums / Literals ──────────────────────────────────

/**
 * Position side for a cash-and-carry / basis trade.
 *
 * - "long_spot_short_perp": Buy spot, short perp. Profits when perp
 *   trades at a premium (positive funding rate).
 * - "short_spot_long_perp": Short spot (or sell spot if already holding),
 *   long perp. Profits when perp trades at a discount (negative funding rate).
 */
export type PositionSide = 'long_spot_short_perp' | 'short_spot_long_perp';

/**
 * Status of a funding arbitrage opportunity.
 */
export type FundingOpportunityStatus =
  | 'pending' // Being calculated
  | 'active' // Positive net return estimate, executable
  | 'marginal' // Very thin margin, high risk
  | 'unprofitable' // Net return negative after fees
  | 'no_data' // Missing funding rate or price data
  | 'expired' // Data too stale
  | 'low_funding'; // Funding rate too low to justify the trade

// ──────────────────── Engine Config ─────────────────────────────────────

/**
 * Configuration for the FundingArbitrageEngine.
 */
export interface FundingEngineConfig {
  /** Exchange slugs to scan. Defaults to all registered adapters. */
  exchanges?: string[];
  /**
   * Spot symbols to scan. If empty, discovers common pairs
   * that have matching perp markets.
   */
  spotSymbols?: string[];
  /** Default trade size in base currency for evaluation. Default: 1.0. */
  tradeSize?: number;
  /**
   * Holding horizon in hours. Used to estimate total funding accrual
   * and basis convergence. Default: 24.
   */
  holdingHorizonHours?: number;
  /** Minimum funding rate (absolute) to consider. Default: 0.00005 (0.005%). */
  minFundingRate?: number;
  /** Maximum age of price data in ms before considering stale. Default: 30000. */
  maxDataAgeMs?: number;
  /** How often to rescan in ms. Default: 30000 (30s — funding rates change slowly). */
  scanIntervalMs?: number;
  /** Leverage assumption. Default: 1. */
  leverage?: number;
  /** Maximum number of historical records to keep per pair. Default: 1000. */
  maxHistoryPerPair?: number;
}

// ──────────────────── API Response Types ────────────────────────────────

/**
 * GET /api/v1/funding/rates response item.
 */
export interface FundingRateResponse {
  exchange: string;
  symbol: string;
  baseCurrency: string;
  quoteCurrency: string;
  fundingRate: number;
  fundingRateApr: number;
  fundingIntervalMs: number;
  nextFundingTime?: number;
  timestamp: number;
  fetchedAt: number;
  isEstimate: boolean;
}

/**
 * GET /api/v1/funding/opportunities response item.
 */
export interface FundingOpportunityResponse {
  id: string;
  exchange: string;
  baseCurrency: string;
  quoteCurrency: string;
  spotSymbol: string;
  perpSymbol: string;
  spotPrice: number;
  perpPrice: number;
  basis: number;
  basisPct: number;
  currentFundingRate: number;
  fundingRateApr: number;
  positionSide: PositionSide;
  leverage: number;
  tradeSizeBase: number;
  notionalValue: number;
  expectedFundingPerInterval: number;
  intervalsInHorizon: number;
  totalExpectedFunding: number;
  basisConvergenceEstimate: number;
  totalEstimatedReturn: number;
  estimatedReturnPct: number;
  totalFees: number;
  netReturnEstimate: number;
  netReturnPct: number;
  status: FundingOpportunityStatus;
  statusReason?: string;
  calculatedAt: number;
  isEstimate: boolean;
  disclaimer: string;
}
