import { Op, literal } from 'sequelize';
import {
  Alert,
  AlertAttributes,
  AlertConditions,
  AlertChannel,
  AlertStatus,
} from '../models/Alert';
import { User } from '../models/User';
import { subscriptionService } from './SubscriptionService';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Plan tier limits ─────────────────────────────────

export interface AlertLimits {
  maxAlerts: number | null;
  maxChannels: number;
  minCooldownSeconds: number;
  allowFundingAlerts: boolean;
  allowNetworkFilters: boolean;
  allowExchangeFilters: boolean;
}

const TIER_LIMITS: Record<string, AlertLimits> = {
  free: {
    maxAlerts: 1,
    maxChannels: 1,
    minCooldownSeconds: 7200, // 2h
    allowFundingAlerts: false,
    allowNetworkFilters: false,
    allowExchangeFilters: false,
  },
  basic: {
    maxAlerts: 10,
    maxChannels: 2,
    minCooldownSeconds: 3600, // 1h
    allowFundingAlerts: false,
    allowNetworkFilters: false,
    allowExchangeFilters: true,
  },
  pro: {
    maxAlerts: 50,
    maxChannels: 3,
    minCooldownSeconds: 600, // 10min
    allowFundingAlerts: true,
    allowNetworkFilters: true,
    allowExchangeFilters: true,
  },
  enterprise: {
    maxAlerts: null,
    maxChannels: 3,
    minCooldownSeconds: 60, // 1min
    allowFundingAlerts: true,
    allowNetworkFilters: true,
    allowExchangeFilters: true,
  },
};

// ──────────────────── AlertService ──────────────────────────────────────

class AlertService {
  /** Resolve plan limits for a user. */
  async resolveLimits(userId: number): Promise<AlertLimits> {
    const plan = await subscriptionService.resolvePlan(userId);
    return TIER_LIMITS[plan.slug] ?? TIER_LIMITS.free;
  }

  // ──────────────────── CRUD ──────────────────────────────────────────

  /** List all alerts for a user. */
  async listAlerts(
    userId: number,
    options?: {
      status?: AlertStatus;
      isEnabled?: boolean;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: Alert[]; total: number }> {
    const where: Record<string, unknown> = { user_id: userId };
    if (options?.status) where.status = options.status;
    if (options?.isEnabled !== undefined) where.is_enabled = options.isEnabled;

    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 25, 100);
    const offset = (page - 1) * limit;

    const { rows, count } = await Alert.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return { data: rows, total: count };
  }

  /** Get a single alert by ID (must belong to the user). */
  async getAlert(userId: number, id: number): Promise<Alert> {
    const alert = await Alert.findOne({ where: { id, user_id: userId } });
    if (!alert) throw new NotFoundError(`Alert #${id} not found`);
    return alert;
  }

  /** Create a new alert. Enforces plan limits and validates conditions. */
  async createAlert(
    userId: number,
    data: {
      name: string;
      description?: string;
      conditions: AlertConditions;
      channels: AlertChannel[];
      cooldownSeconds?: number;
    },
  ): Promise<Alert> {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestError('Alert name is required');
    }
    if (data.name.length > 100) {
      throw new BadRequestError('Alert name must be 100 characters or less');
    }

    // Validate channels
    if (!data.channels || data.channels.length === 0) {
      throw new BadRequestError('At least one notification channel is required');
    }

    const limits = await this.resolveLimits(userId);

    // Validate channel count
    if (data.channels.length > limits.maxChannels) {
      throw new BadRequestError(`Maximum ${limits.maxChannels} channel(s) allowed on your plan`);
    }

    // Validate channels are valid
    const validChannels: AlertChannel[] = ['email', 'telegram', 'web_push'];
    for (const ch of data.channels) {
      if (!validChannels.includes(ch)) {
        throw new BadRequestError(`Invalid channel: ${ch}`);
      }
    }

    // Validate conditions against plan
    this.validateConditions(data.conditions, limits);

    // Enforce plan alert limit
    if (limits.maxAlerts !== null) {
      const count = await Alert.count({
        where: {
          user_id: userId,
          status: { [Op.ne]: 'deleted' },
        },
      });
      if (count >= limits.maxAlerts) {
        throw new ForbiddenError(
          `Alert limit reached (${count}/${limits.maxAlerts}). Upgrade your plan for more.`,
        );
      }
    }

    // Enforce minimum cooldown
    const cooldown = data.cooldownSeconds ?? 3600;
    if (cooldown < limits.minCooldownSeconds) {
      throw new BadRequestError(`Minimum cooldown is ${limits.minCooldownSeconds}s on your plan`);
    }

    // Validate cooldown range
    if (cooldown < 60 || cooldown > 86400) {
      throw new BadRequestError('Cooldown must be between 60s and 24h');
    }

    return Alert.create({
      user_id: userId,
      name: data.name.trim(),
      description: data.description ?? null,
      status: 'active',
      conditions: data.conditions,
      channels: data.channels,
      cooldown_seconds: cooldown,
      is_enabled: true,
    });
  }

  /** Update an existing alert. */
  async updateAlert(
    userId: number,
    id: number,
    data: {
      name?: string;
      description?: string;
      conditions?: AlertConditions;
      channels?: AlertChannel[];
      cooldownSeconds?: number;
      isEnabled?: boolean;
      status?: AlertStatus;
    },
  ): Promise<Alert> {
    const alert = await this.getAlert(userId, id);

    const limits = await this.resolveLimits(userId);

    // Validate channels if provided
    if (data.channels !== undefined) {
      if (data.channels.length === 0) {
        throw new BadRequestError('At least one notification channel is required');
      }
      if (data.channels.length > limits.maxChannels) {
        throw new BadRequestError(`Maximum ${limits.maxChannels} channel(s) allowed on your plan`);
      }
    }

    // Validate conditions if provided
    if (data.conditions !== undefined) {
      this.validateConditions(data.conditions, limits);
    }

    // Enforce minimum cooldown
    if (data.cooldownSeconds !== undefined) {
      if (data.cooldownSeconds < limits.minCooldownSeconds) {
        throw new BadRequestError(`Minimum cooldown is ${limits.minCooldownSeconds}s on your plan`);
      }
      if (data.cooldownSeconds < 60 || data.cooldownSeconds > 86400) {
        throw new BadRequestError('Cooldown must be between 60s and 24h');
      }
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.description !== undefined) updates.description = data.description;
    if (data.conditions !== undefined) updates.conditions = data.conditions;
    if (data.channels !== undefined) updates.channels = data.channels;
    if (data.cooldownSeconds !== undefined) updates.cooldown_seconds = data.cooldownSeconds;
    if (data.isEnabled !== undefined) updates.is_enabled = data.isEnabled;
    if (data.status !== undefined) updates.status = data.status;

    if (Object.keys(updates).length > 0) {
      await alert.update(updates);
    }

    return alert.reload();
  }

  /** Delete an alert (soft-delete by setting status to 'deleted'). */
  async deleteAlert(userId: number, id: number): Promise<void> {
    const alert = await this.getAlert(userId, id);
    await alert.update({ status: 'deleted', is_enabled: false });
  }

  /** Pause an alert. */
  async pauseAlert(userId: number, id: number): Promise<Alert> {
    const alert = await this.getAlert(userId, id);
    await alert.update({ is_enabled: false });
    return alert.reload();
  }

  /** Resume a paused alert. */
  async resumeAlert(userId: number, id: number): Promise<Alert> {
    const alert = await this.getAlert(userId, id);
    await alert.update({ is_enabled: true, status: 'active' });
    return alert.reload();
  }

  // ──────────────────── Evaluation helpers ─────────────────────────────

  /** Get all active alerts that need evaluation. */
  async getActiveAlerts(): Promise<Alert[]> {
    return Alert.findAll({
      where: {
        is_enabled: true,
        status: 'active',
      },
      order: [['user_id', 'ASC']],
    });
  }

  /** Check if an alert is in cooldown. */
  isInCooldown(alert: Alert): boolean {
    if (!alert.last_notified_at) return false;
    const elapsed = (Date.now() - alert.last_notified_at.getTime()) / 1000;
    return elapsed < alert.cooldown_seconds;
  }

  /** Record a notification trigger for an alert. */
  async recordTrigger(alertId: number): Promise<void> {
    await Alert.update(
      {
        last_notified_at: new Date(),
        trigger_count: literal('trigger_count + 1'),
      },
      { where: { id: alertId } },
    );
  }

  // ──────────────────── Limits endpoint ───────────────────────────────

  async getLimits(userId: number): Promise<{
    limits: AlertLimits;
    usage: { activeAlerts: number; totalAlerts: number };
  }> {
    const limits = await this.resolveLimits(userId);

    const [activeAlerts, totalAlerts] = await Promise.all([
      Alert.count({
        where: { user_id: userId, is_enabled: true, status: { [Op.ne]: 'deleted' } },
      }),
      Alert.count({
        where: { user_id: userId, status: { [Op.ne]: 'deleted' } },
      }),
    ]);

    return { limits, usage: { activeAlerts, totalAlerts } };
  }

  // ──────────────────── Condition validation ──────────────────────────

  private validateConditions(conditions: AlertConditions, limits: AlertLimits): void {
    // Check funding-specific conditions
    if (!limits.allowFundingAlerts) {
      if (conditions.minFundingRate !== undefined || conditions.maxFundingRate !== undefined) {
        throw new BadRequestError('Funding rate filters require Pro plan or higher');
      }
      if (conditions.opportunityType === 'funding') {
        throw new BadRequestError('Funding opportunity alerts require Pro plan or higher');
      }
    }

    // Check network filter
    if (!limits.allowNetworkFilters && conditions.network !== undefined) {
      throw new BadRequestError('Network filter requires Pro plan or higher');
    }

    // Check exchange filters
    if (!limits.allowExchangeFilters) {
      if (conditions.buyExchange !== undefined || conditions.sellExchange !== undefined) {
        throw new BadRequestError('Exchange filters require Basic plan or higher');
      }
    }

    // Validate numeric ranges
    if (
      conditions.minSpread !== undefined &&
      (conditions.minSpread < 0 || conditions.minSpread > 1)
    ) {
      throw new BadRequestError('minSpread must be between 0 and 1');
    }
    if (conditions.minRoi !== undefined && (conditions.minRoi < -1 || conditions.minRoi > 10)) {
      throw new BadRequestError('minRoi must be between -1 and 10');
    }
    if (
      conditions.minFundingRate !== undefined &&
      (conditions.minFundingRate < -1 || conditions.minFundingRate > 1)
    ) {
      throw new BadRequestError('minFundingRate must be between -1 and 1');
    }
    if (
      conditions.maxFundingRate !== undefined &&
      (conditions.maxFundingRate < -1 || conditions.maxFundingRate > 1)
    ) {
      throw new BadRequestError('maxFundingRate must be between -1 and 1');
    }
  }
}

export const alertService = new AlertService();
export { AlertService };
