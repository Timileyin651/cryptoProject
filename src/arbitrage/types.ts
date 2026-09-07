import { NormalizedBookWithMetrics, DepthLevel } from '../marketdata/orderbook/OrderBookNormalizer';
import { CoinNetworkStatus } from '../exchanges/ExchangeAdapter';

// ──────────────────────────── Direction ──────────────────────────────────

/**
 * Describes which exchange to buy on and which to sell on.
 * `buyExchange` has the lower ask (cheapest to buy).
 * `sellExchange` has the higher bid (best price to sell).
 */
export interface ArbitrageDirection {
  buyExchange: string;
  sellExchange: string;
}

// ──────────────────────────── Fees ───────────────────────────────────────

export interface TradingFeeSchedule {
  exchange: string;
  symbol: string;
  /** Taker fee as a fraction (e.g. 0.001 = 0.1%). */
  takerFee: number;
  /** Maker fee as a fraction (e.g. 0.0005 = 0.05%). */
  makerFee: number;
}

export interface WithdrawalFeeInfo {
  exchange: string;
  coin: string;
  network: string | null;
  /** Withdrawal fee in base currency. */
  fee: number;
  /** Minimum withdrawal amount in base currency. */
  minWithdrawal: number | null;
  /** Maximum withdrawal amount in base currency. */
  maxWithdrawal: number | null;
  /** Whether withdrawals are currently enabled. */
  withdrawalEnabled: boolean;
}

export interface DepositFeeInfo {
  exchange: string;
  coin: string;
  network: string | null;
  /** Deposit fee in base currency (often 0). */
  fee: number;
  /** Minimum deposit amount. */
  minDeposit: number | null;
  /** Whether deposits are currently enabled. */
  depositEnabled: boolean;
}

export interface NetworkCosts {
  /** Total withdrawal cost in base currency (fee + any bridge cost). */
  withdrawalCost: number;
  /** Withdrawal fee from the buy exchange. */
  withdrawalFee: number;
  /** Estimated network fee (gas) if applicable. */
  networkFee: number;
  /** Estimated confirmation time in seconds. */
  confirmationTimeSec: number | null;
  /** Whether the withdrawal is currently possible. */
  withdrawalAvailable: boolean;
  /** Whether the deposit on the sell exchange is currently possible. */
  depositAvailable: boolean;
  /** The network/chain used for the transfer. */
  network: string | null;
  /** Whether this is a same-exchange opportunity (no transfer needed). */
  sameExchange: boolean;
}

// ──────────────────────────── Slippage ───────────────────────────────────

export interface ArbitrageSlippageEstimate {
  /** Slippage on the buy side (consuming asks). */
  buySlippage: number;
  /** Slippage on the sell side (consuming bids). */
  sellSlippage: number;
  /** Combined slippage as a fraction. */
  totalSlippage: number;
  /** VWAP for the buy order. */
  buyVwap: number;
  /** VWAP for the sell order. */
  sellVwap: number;
  /** Best ask price (top of book) on buy exchange. */
  buyBestPrice: number;
  /** Best bid price (top of book) on sell exchange. */
  sellBestPrice: number;
  /** Number of book levels consumed for the buy. */
  buyLevelsConsumed: number;
  /** Number of book levels consumed for the sell. */
  sellLevelsConsumed: number;
  /** How much of the requested size was fillable on the buy side. */
  buyFillRatio: number;
  /** How much of the requested size was fillable on the sell side. */
  sellFillRatio: number;
}

// ──────────────────────────── Liquidity ──────────────────────────────────

export interface ArbitrageLiquidityCheck {
  /** Whether sufficient liquidity exists on both exchanges. */
  executable: boolean;
  /** Available depth in base currency on the buy exchange (asks). */
  buyDepth: number;
  /** Available depth in base currency on the sell exchange (bids). */
  sellDepth: number;
  /** Fraction of requested size fillable on buy side. */
  buyFillRatio: number;
  /** Fraction of requested size fillable on sell side. */
  sellFillRatio: number;
  /** Worst fill price for the buy order. */
  buyWorstPrice: number;
  /** Worst fill price for the sell order. */
  sellWorstPrice: number;
  /** Reason why liquidity is insufficient (if applicable). */
  reason?: string;
}

// ──────────────────────────── Opportunity ────────────────────────────────

export type OpportunityStatus =
  | 'pending' // Calculating
  | 'active' // Profitable and executable
  | 'marginal' // Barely profitable — risky
  | 'unprofitable' // Spread exists but doesn't cover costs
  | 'illiquid' // Not enough depth
  | 'blocked' // Deposit or withdrawal unavailable
  | 'expired'; // Data too old

export type ArbitrageType =
  | 'direct' // Same base/quote pair, cross-exchange
  | 'triangular'; // Three-leg through intermediate currency (future)

/**
 * The full result of an arbitrage calculation for one pair
 * across one pair of exchanges.
 */
export interface ArbitrageOpportunity {
  /** Unique identifier for this opportunity snapshot. */
  id: string;

  // ── Pair & direction ────────────────────────────────────────────────
  /** Normalized symbol, e.g. "BTC/USDT". */
  symbol: string;
  /** Base currency. */
  baseCurrency: string;
  /** Quote currency. */
  quoteCurrency: string;
  /** Type of arbitrage. */
  arbitrageType: ArbitrageType;
  /** Direction of the trade. */
  direction: ArbitrageDirection;

  // ── Prices (from order book, NOT last traded) ───────────────────────
  /** Cheapest executable buy price (best ask on buy exchange). */
  buyPrice: number;
  /** Highest executable sell price (best bid on sell exchange). */
  sellPrice: number;

  // ── Spread ──────────────────────────────────────────────────────────
  /** Gross spread in quote currency (sellPrice - buyPrice). */
  grossSpread: number;
  /** Gross spread as a fraction of buy price. */
  grossSpreadPct: number;

  // ── Fees ────────────────────────────────────────────────────────────
  /** Buy-side trading fee in quote currency. */
  buyFee: number;
  /** Sell-side trading fee in quote currency. */
  sellFee: number;
  /** Total trading fees. */
  totalTradingFees: number;

  // ── Network / transfer costs ────────────────────────────────────────
  /** Network and transfer costs. */
  networkCosts: NetworkCosts;

  // ── Slippage ────────────────────────────────────────────────────────
  /** Slippage estimates. */
  slippage: ArbitrageSlippageEstimate;

  // ── Liquidity ───────────────────────────────────────────────────────
  /** Liquidity check results. */
  liquidity: ArbitrageLiquidityCheck;

  // ── Net economics ───────────────────────────────────────────────────
  /** Total cost = trading fees + network costs + estimated slippage cost. */
  totalCost: number;
  /** Net profit in quote currency (grossSpread - totalCost). */
  netProfit: number;
  /** Net profit as a fraction of the capital required. */
  roi: number;

  // ── Trade parameters ────────────────────────────────────────────────
  /** The trade size in base currency evaluated. */
  tradeSizeBase: number;
  /** Capital required in quote currency. */
  capitalRequired: number;

  // ── Metadata ────────────────────────────────────────────────────────
  /** When this calculation was performed. */
  calculatedAt: number;
  /** How fresh the order book data is (age in ms of newest book). */
  bookAgeMs: number;
  /** Status of the opportunity. */
  status: OpportunityStatus;
  /** Human-readable status reason. */
  statusReason?: string;
}

// ──────────────────────────── Engine config ──────────────────────────────

export interface ArbitrageEngineConfig {
  /** Exchange slugs to scan. Defaults to all registered adapters. */
  exchanges?: string[];
  /** Symbols to scan. If empty, discovers all common pairs. */
  symbols?: string[];
  /** Default trade size in base currency for evaluation. Default: 1.0. */
  tradeSize?: number;
  /** Minimum gross spread % to even consider. Default: 0.001 (0.1%). */
  minGrossSpreadPct?: number;
  /** Minimum net ROI to flag as 'active'. Default: 0.0005 (0.05%). */
  minNetRoi?: number;
  /** Maximum age of order book data in ms before considering stale. Default: 10000. */
  maxBookAgeMs?: number;
  /** Maximum slippage fraction allowed. Default: 0.01 (1%). */
  maxSlippage?: number;
  /** How often to recalculate in ms. Default: 5000. */
  scanIntervalMs?: number;
}

// ──────────────────────────── Comparable pair ────────────────────────────

/**
 * A pair of exchange order books for the same symbol, ready for comparison.
 */
export interface ComparablePair {
  symbol: string;
  buyExchange: string;
  buyBook: NormalizedBookWithMetrics;
  sellExchange: string;
  sellBook: NormalizedBookWithMetrics;
  /** Age of the buy book in ms (from now). */
  buyBookAgeMs: number;
  /** Age of the sell book in ms (from now). */
  sellBookAgeMs: number;
}

/**
 * Fees gathered from the adapter for a given symbol on an exchange.
 */
export interface ExchangeFees {
  exchange: string;
  symbol: string;
  takerFee: number;
  makerFee: number;
  /** Whether we know the fee schedule. */
  known: boolean;
}

/**
 * Network info gathered from the adapter for a coin.
 */
export interface ExchangeNetworkInfo {
  coin: string;
  network: string | null;
  depositEnabled: boolean;
  withdrawalEnabled: boolean;
  withdrawalFee: number;
  minWithdrawal: number | null;
  maxWithdrawal: number | null;
  confirmationBlocks: number | null;
}
