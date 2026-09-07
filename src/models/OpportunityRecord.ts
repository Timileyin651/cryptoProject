import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

// ──────────────────── Types ─────────────────────────────────────────────

export type OpportunityType = 'spot' | 'funding';

export type OpportunityStatus =
  'active' | 'marginal' | 'unprofitable' | 'illiquid' | 'blocked' | 'expired' | 'low_funding';

// ──────────────────── Attributes ────────────────────────────────────────

export interface OpportunityRecordAttributes extends BaseModelAttributes {
  /** Discriminator: spot cross-exchange or funding/perp basis trade. */
  opportunity_type: OpportunityType;
  /** Current status of this opportunity. */
  status: OpportunityStatus;
  /** Human-readable reason for the status. */
  status_reason: string | null;

  // ── Pair identification ──────────────────────────────────────────
  /** Normalized symbol, e.g. "BTC/USDT". */
  symbol: string;
  /** Base currency code. */
  base_currency: string;
  /** Quote currency code. */
  quote_currency: string;

  // ── Exchange legs ────────────────────────────────────────────────
  /** Exchange where the buy leg happens (spot buy or perp sell). */
  buy_exchange_id: number;
  /** Symbol on the buy exchange. */
  buy_symbol: string;
  /** Exchange where the sell leg happens. */
  sell_exchange_id: number;
  /** Symbol on the sell exchange. */
  sell_symbol: string;

  // ── Prices (from order book, NOT last traded) ───────────────────
  /** Cheapest executable buy price (best ask). */
  buy_price: string;
  /** Highest executable sell price (best bid). */
  sell_price: string;

  // ── Spread ──────────────────────────────────────────────────────
  /** Gross spread in quote currency. */
  gross_spread: string;
  /** Gross spread as fraction of buy price. */
  gross_spread_pct: string;

  // ── Trading fees ────────────────────────────────────────────────
  /** Buy-side trading fee in quote currency. */
  buy_fee: string;
  /** Sell-side trading fee in quote currency. */
  sell_fee: string;
  /** Total trading fees. */
  total_fees: string;
  /** Buy fee rate (fraction). */
  buy_fee_rate: string;
  /** Sell fee rate (fraction). */
  sell_fee_rate: string;

  // ── Network / transfer costs ────────────────────────────────────
  /** Withdrawal fee in base currency. */
  withdrawal_fee: string;
  /** Network fee in quote currency. */
  network_fee_quote: string;
  /** Estimated confirmation time in seconds. */
  confirmation_time_sec: number | null;
  /** Whether withdrawal is available on the buy exchange. */
  withdrawal_available: boolean;
  /** Whether deposit is available on the sell exchange. */
  deposit_available: boolean;
  /** Network/chain used for transfer. */
  network: string | null;
  /** Whether this is a same-exchange opportunity. */
  same_exchange: boolean;

  // ── Slippage ────────────────────────────────────────────────────
  /** Slippage on buy side (fraction). */
  buy_slippage: string;
  /** Slippage on sell side (fraction). */
  sell_slippage: string;
  /** Combined slippage (fraction). */
  total_slippage: string;
  /** VWAP for buy order. */
  buy_vwap: string;
  /** VWAP for sell order. */
  sell_vwap: string;

  // ── Liquidity ───────────────────────────────────────────────────
  /** Whether sufficient liquidity exists. */
  liquidity_executable: boolean;
  /** Available depth on buy exchange (base currency). */
  buy_depth: string;
  /** Available depth on sell exchange (base currency). */
  sell_depth: string;
  /** Fill ratio on buy side. */
  buy_fill_ratio: string;
  /** Fill ratio on sell side. */
  sell_fill_ratio: string;

  // ── Net economics ───────────────────────────────────────────────
  /** Total cost = fees + network + slippage. */
  total_cost: string;
  /** Net profit in quote currency. */
  net_profit: string;
  /** ROI as fraction of capital required. */
  roi: string;

  // ── Trade parameters ────────────────────────────────────────────
  /** Trade size in base currency. */
  trade_size_base: string;
  /** Capital required in quote currency. */
  capital_required: string;

  // ── Funding-specific (null for spot) ────────────────────────────
  /** Perp symbol (funding only). */
  perp_symbol: string | null;
  /** Spot price for funding arb. */
  spot_price: string | null;
  /** Perp price for funding arb. */
  perp_price: string | null;
  /** Basis = perp - spot. */
  basis: string | null;
  /** Basis as fraction of spot. */
  basis_pct: string | null;
  /** Current funding rate (fraction). */
  current_funding_rate: string | null;
  /** Funding rate APR. */
  funding_rate_apr: string | null;
  /** Funding interval in ms. */
  funding_interval_ms: number | null;
  /** Position side for funding arb. */
  position_side: string | null;
  /** Leverage assumption. */
  leverage: string | null;
  /** Expected funding per interval. */
  expected_funding_per_interval: string | null;
  /** Intervals in holding horizon. */
  intervals_in_horizon: number | null;
  /** Total expected funding over horizon. */
  total_expected_funding: string | null;
  /** Basis convergence estimate. */
  basis_convergence_estimate: string | null;
  /** Total estimated return. */
  total_estimated_return: string | null;
  /** Estimated return as fraction of notional. */
  estimated_return_pct: string | null;
  /** Net return after fees. */
  net_return_estimate: string | null;
  /** Net return as fraction of notional. */
  net_return_pct: string | null;
  /** Whether all values are estimates. */
  is_estimate: boolean;

  // ── Metadata ────────────────────────────────────────────────────
  /** When this calculation was performed. */
  calculated_at: Date;
  /** How fresh the data is (age in ms). */
  data_age_ms: number;
  /** Engine scan ID for grouping related opportunities. */
  scan_id: string | null;

  // ── Exchange name denormalized for fast queries ──────────────────
  buy_exchange_slug: string;
  sell_exchange_slug: string;
}

export type OpportunityRecordCreationAttributes = BaseModelCreationAttributes &
  Omit<OpportunityRecordAttributes, 'id' | 'created_at' | 'updated_at'>;

// ──────────────────── Model ─────────────────────────────────────────────

export class OpportunityRecord extends BaseModel<
  OpportunityRecordAttributes,
  OpportunityRecordCreationAttributes
> {
  public opportunity_type!: OpportunityType;
  public status!: OpportunityStatus;
  public status_reason!: string | null;
  public symbol!: string;
  public base_currency!: string;
  public quote_currency!: string;
  public buy_exchange_id!: number;
  public buy_symbol!: string;
  public sell_exchange_id!: number;
  public sell_symbol!: string;
  public buy_price!: string;
  public sell_price!: string;
  public gross_spread!: string;
  public gross_spread_pct!: string;
  public buy_fee!: string;
  public sell_fee!: string;
  public total_fees!: string;
  public buy_fee_rate!: string;
  public sell_fee_rate!: string;
  public withdrawal_fee!: string;
  public network_fee_quote!: string;
  public confirmation_time_sec!: number | null;
  public withdrawal_available!: boolean;
  public deposit_available!: boolean;
  public network!: string | null;
  public same_exchange!: boolean;
  public buy_slippage!: string;
  public sell_slippage!: string;
  public total_slippage!: string;
  public buy_vwap!: string;
  public sell_vwap!: string;
  public liquidity_executable!: boolean;
  public buy_depth!: string;
  public sell_depth!: string;
  public buy_fill_ratio!: string;
  public sell_fill_ratio!: string;
  public total_cost!: string;
  public net_profit!: string;
  public roi!: string;
  public trade_size_base!: string;
  public capital_required!: string;
  public perp_symbol!: string | null;
  public spot_price!: string | null;
  public perp_price!: string | null;
  public basis!: string | null;
  public basis_pct!: string | null;
  public current_funding_rate!: string | null;
  public funding_rate_apr!: string | null;
  public funding_interval_ms!: number | null;
  public position_side!: string | null;
  public leverage!: string | null;
  public expected_funding_per_interval!: string | null;
  public intervals_in_horizon!: number | null;
  public total_expected_funding!: string | null;
  public basis_convergence_estimate!: string | null;
  public total_estimated_return!: string | null;
  public estimated_return_pct!: string | null;
  public net_return_estimate!: string | null;
  public net_return_pct!: string | null;
  public is_estimate!: boolean;
  public calculated_at!: Date;
  public data_age_ms!: number;
  public scan_id!: string | null;
  public buy_exchange_slug!: string;
  public sell_exchange_slug!: string;

  static initModel(sequelize: Sequelize) {
    return OpportunityRecord.init(
      {
        ...BaseModel.baseColumns,

        opportunity_type: {
          type: DataTypes.ENUM('spot', 'funding'),
          allowNull: false,
        },
        status: {
          type: DataTypes.ENUM(
            'active',
            'marginal',
            'unprofitable',
            'illiquid',
            'blocked',
            'expired',
            'low_funding',
          ),
          allowNull: false,
          defaultValue: 'active',
        },
        status_reason: {
          type: DataTypes.TEXT,
          allowNull: true,
        },

        // ── Pair ──
        symbol: { type: DataTypes.STRING(20), allowNull: false },
        base_currency: { type: DataTypes.STRING(10), allowNull: false },
        quote_currency: { type: DataTypes.STRING(10), allowNull: false },

        // ── Exchange legs ──
        buy_exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'exchanges', key: 'id' },
        },
        buy_symbol: { type: DataTypes.STRING(30), allowNull: false },
        sell_exchange_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'exchanges', key: 'id' },
        },
        sell_symbol: { type: DataTypes.STRING(30), allowNull: false },

        // ── Prices ──
        buy_price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        sell_price: { type: DataTypes.DECIMAL(36, 18), allowNull: false },

        // ── Spread ──
        gross_spread: { type: DataTypes.DECIMAL(36, 18), allowNull: false },
        gross_spread_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: false },

        // ── Fees ──
        buy_fee: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        sell_fee: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        total_fees: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        buy_fee_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        sell_fee_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },

        // ── Network ──
        withdrawal_fee: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        network_fee_quote: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        confirmation_time_sec: { type: DataTypes.INTEGER, allowNull: true },
        withdrawal_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        deposit_available: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        network: { type: DataTypes.STRING(30), allowNull: true },
        same_exchange: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

        // ── Slippage ──
        buy_slippage: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        sell_slippage: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        total_slippage: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },
        buy_vwap: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        sell_vwap: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },

        // ── Liquidity ──
        liquidity_executable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
        buy_depth: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        sell_depth: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        buy_fill_ratio: { type: DataTypes.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },
        sell_fill_ratio: { type: DataTypes.DECIMAL(8, 6), allowNull: false, defaultValue: 1 },

        // ── Net economics ──
        total_cost: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        net_profit: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },
        roi: { type: DataTypes.DECIMAL(12, 8), allowNull: false, defaultValue: 0 },

        // ── Trade params ──
        trade_size_base: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 1 },
        capital_required: { type: DataTypes.DECIMAL(36, 18), allowNull: false, defaultValue: 0 },

        // ── Funding-specific ──
        perp_symbol: { type: DataTypes.STRING(30), allowNull: true },
        spot_price: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        perp_price: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        basis: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        basis_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        current_funding_rate: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        funding_rate_apr: { type: DataTypes.DECIMAL(12, 6), allowNull: true },
        funding_interval_ms: { type: DataTypes.INTEGER, allowNull: true },
        position_side: { type: DataTypes.STRING(30), allowNull: true },
        leverage: { type: DataTypes.DECIMAL(6, 2), allowNull: true, defaultValue: 1 },
        expected_funding_per_interval: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        intervals_in_horizon: { type: DataTypes.INTEGER, allowNull: true },
        total_expected_funding: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        basis_convergence_estimate: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        total_estimated_return: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        estimated_return_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        net_return_estimate: { type: DataTypes.DECIMAL(36, 18), allowNull: true },
        net_return_pct: { type: DataTypes.DECIMAL(12, 8), allowNull: true },
        is_estimate: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },

        // ── Metadata ──
        calculated_at: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
        data_age_ms: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
        scan_id: { type: DataTypes.STRING(36), allowNull: true },

        // ── Denormalized slugs ──
        buy_exchange_slug: { type: DataTypes.STRING(50), allowNull: false },
        sell_exchange_slug: { type: DataTypes.STRING(50), allowNull: false },
      },
      {
        sequelize,
        tableName: 'opportunity_records',
        modelName: 'OpportunityRecord',
        indexes: [
          { fields: ['opportunity_type'] },
          { fields: ['status'] },
          { fields: ['symbol'] },
          { fields: ['base_currency'] },
          { fields: ['buy_exchange_id'] },
          { fields: ['sell_exchange_id'] },
          { fields: ['net_profit'] },
          { fields: ['roi'] },
          { fields: ['calculated_at'] },
          { fields: ['scan_id'] },
          { fields: ['opportunity_type', 'status'] },
          { fields: ['opportunity_type', 'net_profit'] },
          { fields: ['base_currency', 'opportunity_type'] },
        ],
      },
    );
  }
}
