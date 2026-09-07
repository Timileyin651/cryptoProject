import { DataTypes, Sequelize } from 'sequelize';
import { BaseModel, BaseModelAttributes, BaseModelCreationAttributes } from './BaseModel';

// ──────────────────── Types ─────────────────────────────────────────────

export type AlertStatus = 'active' | 'paused' | 'triggered' | 'expired' | 'deleted';

export type AlertChannel = 'email' | 'telegram' | 'web_push';

export interface AlertConditions {
  /** Minimum gross spread (fraction, e.g. 0.005 = 0.5%). */
  minSpread?: number;
  /** Minimum net profit in quote currency. */
  minNetProfit?: number;
  /** Minimum ROI (fraction). */
  minRoi?: number;
  /** Filter by base currency (e.g. 'BTC'). */
  coin?: string;
  /** Filter by normalized symbol (e.g. 'BTC/USDT'). */
  pair?: string;
  /** Filter by buy exchange slug (e.g. 'binance'). */
  buyExchange?: string;
  /** Filter by sell exchange slug (e.g. 'okx'). */
  sellExchange?: string;
  /** Minimum volume in quote currency. */
  minVolume?: number;
  /** Minimum liquidity depth in base currency. */
  minLiquidity?: number;
  /** Only when withdrawal is available. */
  requireWithdrawalAvailable?: boolean;
  /** Only when deposit is available. */
  requireDepositAvailable?: boolean;
  /** Filter by network (e.g. 'TRC20'). */
  network?: string;
  /** Opportunity type filter. */
  opportunityType?: 'spot' | 'funding' | 'any';
  /** Minimum funding rate (fraction, e.g. 0.0001 = 0.01%). */
  minFundingRate?: number;
  /** Maximum funding rate (fraction). */
  maxFundingRate?: number;
}

// ──────────────────── Attributes ────────────────────────────────────────

export interface AlertAttributes extends BaseModelAttributes {
  user_id: number;
  name: string;
  description: string | null;
  status: AlertStatus;
  /** JSON-serialized AlertConditions. */
  conditions: AlertConditions;
  /** Which channels to notify on trigger. */
  channels: AlertChannel[];
  /** Cooldown in seconds between notifications for this alert. Default: 3600 (1h). */
  cooldown_seconds: number;
  /** Timestamp of last notification sent for this alert. */
  last_notified_at: Date | null;
  /** Number of times this alert has triggered. */
  trigger_count: number;
  /** Whether this alert is currently enabled. */
  is_enabled: boolean;
}

export type AlertCreationAttributes = BaseModelCreationAttributes &
  Omit<AlertAttributes, 'id' | 'created_at' | 'updated_at' | 'last_notified_at' | 'trigger_count'>;

// ──────────────────── Model ─────────────────────────────────────────────

export class Alert extends BaseModel<AlertAttributes, AlertCreationAttributes> {
  public user_id!: number;
  public name!: string;
  public description!: string | null;
  public status!: AlertStatus;
  public conditions!: AlertConditions;
  public channels!: AlertChannel[];
  public cooldown_seconds!: number;
  public last_notified_at!: Date | null;
  public trigger_count!: number;
  public is_enabled!: boolean;

  static initModel(sequelize: Sequelize) {
    return Alert.init(
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
          comment: 'User-given alert name',
        },
        description: {
          type: DataTypes.STRING(500),
          allowNull: true,
        },
        status: {
          type: DataTypes.ENUM('active', 'paused', 'triggered', 'expired', 'deleted'),
          allowNull: false,
          defaultValue: 'active',
        },
        conditions: {
          type: DataTypes.JSON,
          allowNull: false,
          defaultValue: {},
          comment: 'JSON AlertConditions object',
        },
        channels: {
          type: DataTypes.JSON,
          allowNull: false,
          defaultValue: ['email'],
          comment: 'Array of AlertChannel values',
        },
        cooldown_seconds: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 3600,
          comment: 'Minimum seconds between notifications for this alert',
        },
        last_notified_at: {
          type: DataTypes.DATE,
          allowNull: true,
        },
        trigger_count: {
          type: DataTypes.INTEGER,
          allowNull: false,
          defaultValue: 0,
        },
        is_enabled: {
          type: DataTypes.BOOLEAN,
          allowNull: false,
          defaultValue: true,
        },
      },
      {
        sequelize,
        tableName: 'alerts',
        modelName: 'Alert',
        indexes: [
          { fields: ['user_id', 'status'] },
          { fields: ['user_id', 'is_enabled'] },
          { fields: ['status'] },
          { fields: ['is_enabled'] },
          { fields: ['last_notified_at'] },
        ],
      },
    );
  }
}
