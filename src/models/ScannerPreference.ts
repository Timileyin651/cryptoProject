import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

export interface ScannerPreferenceAttributes extends BaseModelAttributes {
  /** Owner user ID. */
  user_id: number;
  /** Human-readable name for this saved preference. */
  name: string;
  /** Whether this is the user's default preference. */
  is_default: boolean;
  /** Sort order for display. */
  sort_order: number;

  // ── Filter state (JSON blob) ─────────────────────────────────────
  /** All filter parameters stored as JSON. */
  filters: ScannerFilterState;

  // ── Metadata ─────────────────────────────────────────────────────
  /** How many times this preference has been applied. */
  usage_count: number;
  /** When it was last applied. */
  last_used_at: Date | null;
}

/**
 * The full set of scanner filter parameters that can be saved.
 * All fields are optional — only set values are active.
 */
export interface ScannerFilterState {
  // ── Basic filters ──────────────────────────────────────────────
  search?: string;
  opportunityType?: 'spot' | 'funding';
  status?: string;
  baseCurrency?: string;
  quoteCurrency?: string;
  symbol?: string;
  exchange?: string;

  // ── Advanced filters (plan-gated) ──────────────────────────────
  minSpread?: number;
  maxSpread?: number;
  minProfit?: number;
  maxProfit?: number;
  minRoi?: number;
  maxRoi?: number;
  minVolume?: number;

  // ── Network & status filters (plan-gated) ──────────────────────
  network?: string;
  liquidityExecutable?: boolean;
  withdrawalAvailable?: boolean;
  depositAvailable?: boolean;

  // ── Pair type filters (plan-gated) ─────────────────────────────
  stablecoinPairs?: boolean;
  fiatPairs?: boolean;

  // ── Sorting ────────────────────────────────────────────────────
  sortBy?: string;
  sortDirection?: 'ASC' | 'DESC';
}

export type ScannerPreferenceCreationAttributes = BaseModelCreationAttributes &
  Omit<ScannerPreferenceAttributes, 'id' | 'created_at' | 'updated_at'>;

// ──────────────────── Well-known stablecoins ────────────────────────────

export const STABLECOIN_QUOTES = new Set([
  'USDT',
  'USDC',
  'BUSD',
  'DAI',
  'TUSD',
  'USDP',
  'FRAX',
  'USDD',
  'PYUSD',
  'EURC',
  'AEUR',
  'USDJ',
  'GUSD',
  'SUSD',
  'USDN',
]);

/**
 * Common fiat currency codes that appear as quote currencies
 * on exchanges that support fiat pairs.
 */
export const FIAT_QUOTES = new Set([
  'USD',
  'EUR',
  'GBP',
  'JPY',
  'AUD',
  'CAD',
  'CHF',
  'KRW',
  'TRY',
  'BRL',
  'NGN',
  'ZAR',
  'INR',
  'MXN',
  'ARS',
]);

// ──────────────────── Model ─────────────────────────────────────────────

export class ScannerPreference extends BaseModel<
  ScannerPreferenceAttributes,
  ScannerPreferenceCreationAttributes
> {
  public user_id!: number;
  public name!: string;
  public is_default!: boolean;
  public sort_order!: number;
  public filters!: ScannerFilterState;
  public usage_count!: number;
  public last_used_at!: Date | null;

  static initModel(sequelize: Sequelize) {
    return ScannerPreference.init(
      {
        ...BaseModel.baseColumns,
        user_id: {
          type: DataTypes.INTEGER,
          allowNull: false,
          references: { model: 'users', key: 'id' },
          onUpdate: 'CASCADE',
          onDelete: 'CASCADE',
        },
        name: {
          type: DataTypes.STRING(100),
          allowNull: false,
        },
        is_default: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: false,
        },
        sort_order: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        filters: {
          type: DataTypes.JSON,
          allowNull: false,
          defaultValue: {},
        },
        usage_count: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        last_used_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
      },
      {
        sequelize,
        tableName: 'scanner_preferences',
        modelName: 'ScannerPreference',
        indexes: [
          { fields: ['user_id'] },
          { fields: ['user_id', 'is_default'] },
          { fields: ['user_id', 'name'], unique: true },
        ],
      },
    );
  }
}
