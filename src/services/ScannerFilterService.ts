import { Op } from 'sequelize';
import {
  ScannerPreference,
  ScannerFilterState,
  STABLECOIN_QUOTES,
  FIAT_QUOTES,
} from '../models/ScannerPreference';
import { OpportunityQueryOptions } from './OpportunityService';
import { subscriptionService } from './SubscriptionService';
import { NotFoundError, BadRequestError, ForbiddenError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Plan tier definitions ─────────────────────────────

/**
 * Defines what each plan tier is allowed to filter on.
 * Keys match the feature entitlement feature_key column.
 *
 * Enforcement strategy:
 * - Each filter param maps to a required feature key.
 * - If the feature is not enabled, the param is silently stripped.
 * - If the feature has a numeric limit, the param value is clamped.
 */
export interface PlanFilterLimits {
  /** Maximum page size allowed. null = unlimited. */
  maxPageSize: number | null;
  /** Maximum number of saved preferences. null = unlimited. */
  maxSavedPreferences: number | null;
  /** Whether advanced numeric filters are allowed. */
  allowAdvancedFilters: boolean;
  /** Whether min/max spread filters are allowed. */
  allowSpreadFilters: boolean;
  /** Whether min/max profit/ROI filters are allowed. */
  allowProfitFilters: boolean;
  /** Whether network filter is allowed. */
  allowNetworkFilter: boolean;
  /** Whether deposit/withdrawal status filters are allowed. */
  allowDepositWithdrawFilters: boolean;
  /** Whether stablecoin pair filter is allowed. */
  allowStablecoinFilter: boolean;
  /** Whether fiat pair filter is allowed. */
  allowFiatFilter: boolean;
  /** Whether liquidity filter is allowed. */
  allowLiquidityFilter: boolean;
  /** Maximum number of results per query. null = unlimited. */
  maxResultsPerQuery: number | null;
}

const TIER_LIMITS: Record<string, PlanFilterLimits> = {
  free: {
    maxPageSize: 25,
    maxSavedPreferences: 3,
    allowAdvancedFilters: false,
    allowSpreadFilters: false,
    allowProfitFilters: false,
    allowNetworkFilter: false,
    allowDepositWithdrawFilters: false,
    allowStablecoinFilter: false,
    allowFiatFilter: false,
    allowLiquidityFilter: false,
    maxResultsPerQuery: 100,
  },
  basic: {
    maxPageSize: 50,
    maxSavedPreferences: 10,
    allowAdvancedFilters: true,
    allowSpreadFilters: true,
    allowProfitFilters: true,
    allowNetworkFilter: false,
    allowDepositWithdrawFilters: false,
    allowStablecoinFilter: false,
    allowFiatFilter: false,
    allowLiquidityFilter: true,
    maxResultsPerQuery: 500,
  },
  pro: {
    maxPageSize: 100,
    maxSavedPreferences: 50,
    allowAdvancedFilters: true,
    allowSpreadFilters: true,
    allowProfitFilters: true,
    allowNetworkFilter: true,
    allowDepositWithdrawFilters: true,
    allowStablecoinFilter: true,
    allowFiatFilter: true,
    allowLiquidityFilter: true,
    maxResultsPerQuery: 1000,
  },
  enterprise: {
    maxPageSize: 100,
    maxSavedPreferences: null, // unlimited
    allowAdvancedFilters: true,
    allowSpreadFilters: true,
    allowProfitFilters: true,
    allowNetworkFilter: true,
    allowDepositWithdrawFilters: true,
    allowStablecoinFilter: true,
    allowFiatFilter: true,
    allowLiquidityFilter: true,
    maxResultsPerQuery: null, // unlimited
  },
};

// ──────────────────── Filter feature key mapping ────────────────────────

/**
 * Maps each query param to the feature key required to use it.
 * Used by the enforcement middleware.
 */
export const FILTER_FEATURE_MAP: Record<string, string> = {
  minSpread: 'scanner.spread_filter',
  maxSpread: 'scanner.spread_filter',
  minProfit: 'scanner.profit_filter',
  maxProfit: 'scanner.profit_filter',
  minRoi: 'scanner.profit_filter',
  maxRoi: 'scanner.profit_filter',
  minVolume: 'scanner.advanced_filters',
  network: 'scanner.network_filter',
  liquidityExecutable: 'scanner.liquidity_filter',
  withdrawalAvailable: 'scanner.deposit_withdraw_filter',
  depositAvailable: 'scanner.deposit_withdraw_filter',
  stablecoinPairs: 'scanner.stablecoin_filter',
  fiatPairs: 'scanner.fiat_filter',
};

// ──────────────────── ScannerFilterService ──────────────────────────────

class ScannerFilterService {
  /**
   * Resolve the plan filter limits for a user.
   * Falls back to 'free' tier if no subscription.
   */
  async resolveLimits(userId: number): Promise<PlanFilterLimits> {
    const plan = await subscriptionService.resolvePlan(userId);
    return TIER_LIMITS[plan.slug] ?? TIER_LIMITS.free;
  }

  /**
   * Enforce plan limits on query options. Strips or clamps
   * params the user's plan doesn't allow.
   *
   * Returns the sanitized options and a list of restrictions applied.
   */
  async enforceLimits(
    userId: number,
    options: OpportunityQueryOptions,
  ): Promise<{
    sanitized: OpportunityQueryOptions;
    restrictions: string[];
  }> {
    const limits = await this.resolveLimits(userId);
    const restrictions: string[] = [];
    const sanitized = { ...options };

    // ── Page size ──
    if (limits.maxPageSize !== null && sanitized.limit !== undefined) {
      if (sanitized.limit > limits.maxPageSize) {
        restrictions.push(`Page size clamped from ${sanitized.limit} to ${limits.maxPageSize}`);
        sanitized.limit = limits.maxPageSize;
      }
    }

    // ── Max results ──
    if (limits.maxResultsPerQuery !== null && sanitized.limit !== undefined) {
      if (sanitized.limit > limits.maxResultsPerQuery) {
        restrictions.push(`Results limited to ${limits.maxResultsPerQuery}`);
        sanitized.limit = limits.maxResultsPerQuery;
      }
    }

    // ── Spread filters ──
    if (!limits.allowSpreadFilters) {
      if (sanitized.minSpread !== undefined) {
        restrictions.push('minSpread removed — upgrade to Basic+');
        delete sanitized.minSpread;
      }
      if (sanitized.maxSpread !== undefined) {
        restrictions.push('maxSpread removed — upgrade to Basic+');
        delete sanitized.maxSpread;
      }
    }

    // ── Profit/ROI filters ──
    if (!limits.allowProfitFilters) {
      for (const key of ['minProfit', 'maxProfit', 'minRoi', 'maxRoi'] as const) {
        if (sanitized[key] !== undefined) {
          restrictions.push(`${key} removed — upgrade to Basic+`);
          delete sanitized[key];
        }
      }
    }

    // ── Volume filter ──
    if (!limits.allowAdvancedFilters && sanitized.minVolume !== undefined) {
      restrictions.push('minVolume removed — upgrade to Basic+');
      delete sanitized.minVolume;
    }

    // ── Network filter ──
    if (!limits.allowNetworkFilter && sanitized.network !== undefined) {
      restrictions.push('network filter removed — upgrade to Pro+');
      delete sanitized.network;
    }

    // ── Deposit/withdrawal filters ──
    if (!limits.allowDepositWithdrawFilters) {
      if (sanitized.withdrawalAvailable !== undefined) {
        restrictions.push('withdrawalAvailable removed — upgrade to Pro+');
        delete sanitized.withdrawalAvailable;
      }
      if (sanitized.depositAvailable !== undefined) {
        restrictions.push('depositAvailable removed — upgrade to Pro+');
        delete sanitized.depositAvailable;
      }
    }

    // ── Liquidity filter ──
    if (!limits.allowLiquidityFilter && sanitized.liquidityExecutable !== undefined) {
      restrictions.push('liquidityExecutable removed — upgrade to Basic+');
      delete sanitized.liquidityExecutable;
    }

    return { sanitized, restrictions };
  }

  /**
   * Validate a filter state against plan limits.
   * Returns the list of invalid/restricted fields.
   */
  async validateFilters(
    userId: number,
    filters: ScannerFilterState,
  ): Promise<{ valid: boolean; errors: string[] }> {
    const limits = await this.resolveLimits(userId);
    const errors: string[] = [];

    if (!limits.allowSpreadFilters) {
      if (filters.minSpread !== undefined || filters.maxSpread !== undefined) {
        errors.push('Spread filters require Basic plan or higher');
      }
    }

    if (!limits.allowProfitFilters) {
      if (
        filters.minProfit !== undefined ||
        filters.maxProfit !== undefined ||
        filters.minRoi !== undefined ||
        filters.maxRoi !== undefined
      ) {
        errors.push('Profit/ROI filters require Basic plan or higher');
      }
    }

    if (!limits.allowNetworkFilter && filters.network !== undefined) {
      errors.push('Network filter requires Pro plan or higher');
    }

    if (!limits.allowDepositWithdrawFilters) {
      if (filters.withdrawalAvailable !== undefined || filters.depositAvailable !== undefined) {
        errors.push('Deposit/withdrawal filters require Pro plan or higher');
      }
    }

    if (!limits.allowStablecoinFilter && filters.stablecoinPairs) {
      errors.push('Stablecoin filter requires Pro plan or higher');
    }

    if (!limits.allowFiatFilter && filters.fiatPairs) {
      errors.push('Fiat pair filter requires Pro plan or higher');
    }

    return { valid: errors.length === 0, errors };
  }

  /**
   * Convert a ScannerFilterState into OpportunityQueryOptions.
   * Handles stablecoin/fiat pair filtering by expanding to quote_currency filters.
   */
  filtersToQueryOptions(filters: ScannerFilterState): OpportunityQueryOptions {
    const options: OpportunityQueryOptions = {};

    // Basic filters
    if (filters.search) options.search = filters.search;
    if (filters.opportunityType) options.opportunityType = filters.opportunityType;
    if (filters.status) options.status = filters.status;
    if (filters.baseCurrency) options.baseCurrency = filters.baseCurrency;
    if (filters.symbol) options.symbol = filters.symbol;
    if (filters.exchange) options.exchange = filters.exchange;

    // Advanced filters
    if (filters.minSpread !== undefined) options.minSpread = filters.minSpread;
    if (filters.maxSpread !== undefined) options.maxSpread = filters.maxSpread;
    if (filters.minProfit !== undefined) options.minProfit = filters.minProfit;
    if (filters.maxProfit !== undefined) options.maxProfit = filters.maxProfit;
    if (filters.minRoi !== undefined) options.minRoi = filters.minRoi;
    if (filters.maxRoi !== undefined) options.maxRoi = filters.maxRoi;
    if (filters.minVolume !== undefined) options.minVolume = filters.minVolume;

    // Network & status
    if (filters.network) options.network = filters.network;
    if (filters.liquidityExecutable !== undefined)
      options.liquidityExecutable = filters.liquidityExecutable;
    if (filters.withdrawalAvailable !== undefined)
      options.withdrawalAvailable = filters.withdrawalAvailable;
    if (filters.depositAvailable !== undefined) options.depositAvailable = filters.depositAvailable;

    // Stablecoin filter: set quoteCurrency to common stablecoins
    if (filters.stablecoinPairs && !filters.quoteCurrency) {
      // We can't OR multiple quote currencies in a single string,
      // so we'll handle this at the SQL level via a custom filter
      (options as any)._stablecoinFilter = true;
    }

    // Fiat filter
    if (filters.fiatPairs && !filters.quoteCurrency) {
      (options as any)._fiatFilter = true;
    }

    // Sorting
    if (filters.sortBy) options.sortBy = filters.sortBy;
    if (filters.sortDirection) options.sortDirection = filters.sortDirection;

    return options;
  }

  /**
   * Check if a quote currency is a stablecoin.
   */
  isStablecoin(quote: string): boolean {
    return STABLECOIN_QUOTES.has(quote.toUpperCase());
  }

  /**
   * Check if a quote currency is fiat.
   */
  isFiat(quote: string): boolean {
    return FIAT_QUOTES.has(quote.toUpperCase());
  }

  // ──────────────────── Saved Preferences CRUD ────────────────────────

  /**
   * List all saved preferences for a user.
   */
  async listPreferences(userId: number): Promise<ScannerPreference[]> {
    return ScannerPreference.findAll({
      where: { user_id: userId },
      order: [
        ['sort_order', 'ASC'],
        ['created_at', 'ASC'],
      ],
    });
  }

  /**
   * Get a single preference by ID (must belong to the user).
   */
  async getPreference(userId: number, preferenceId: number): Promise<ScannerPreference> {
    const pref = await ScannerPreference.findOne({
      where: { id: preferenceId, user_id: userId },
    });
    if (!pref) throw new NotFoundError(`Scanner preference #${preferenceId} not found`);
    return pref;
  }

  /**
   * Create a new saved preference. Validates against plan limits.
   */
  async createPreference(
    userId: number,
    data: { name: string; filters: ScannerFilterState; isDefault?: boolean },
  ): Promise<ScannerPreference> {
    // Validate name
    if (!data.name || data.name.trim().length === 0) {
      throw new BadRequestError('Preference name is required');
    }
    if (data.name.length > 100) {
      throw new BadRequestError('Preference name must be 100 characters or less');
    }

    // Check plan limits
    const limits = await this.resolveLimits(userId);
    if (limits.maxSavedPreferences !== null) {
      const count = await ScannerPreference.count({ where: { user_id: userId } });
      if (count >= limits.maxSavedPreferences) {
        throw new ForbiddenError(
          `Saved preference limit reached (${count}/${limits.maxSavedPreferences}). Upgrade your plan for more.`,
        );
      }
    }

    // Validate filters against plan
    const validation = await this.validateFilters(userId, data.filters);
    if (!validation.valid) {
      throw new BadRequestError(
        `Filters contain plan-restricted fields: ${validation.errors.join('; ')}`,
      );
    }

    // Handle default flag
    if (data.isDefault) {
      // Unset any existing default
      await ScannerPreference.update(
        { is_default: false },
        { where: { user_id: userId, is_default: true } },
      );
    }

    // Check name uniqueness
    const existing = await ScannerPreference.findOne({
      where: { user_id: userId, name: data.name.trim() },
    });
    if (existing) {
      throw new BadRequestError(`A preference named '${data.name}' already exists`);
    }

    return ScannerPreference.create({
      user_id: userId,
      name: data.name.trim(),
      is_default: data.isDefault ?? false,
      sort_order: 0,
      filters: data.filters,
      usage_count: 0,
      last_used_at: null,
    } as any);
  }

  /**
   * Update an existing preference.
   */
  async updatePreference(
    userId: number,
    preferenceId: number,
    data: { name?: string; filters?: ScannerFilterState; isDefault?: boolean },
  ): Promise<ScannerPreference> {
    const pref = await this.getPreference(userId, preferenceId);

    // Validate new filters if provided
    if (data.filters) {
      const validation = await this.validateFilters(userId, data.filters);
      if (!validation.valid) {
        throw new BadRequestError(
          `Filters contain plan-restricted fields: ${validation.errors.join('; ')}`,
        );
      }
    }

    // Handle default flag
    if (data.isDefault) {
      await ScannerPreference.update(
        { is_default: false },
        { where: { user_id: userId, is_default: true } },
      );
    }

    // Check name uniqueness if changing
    if (data.name && data.name !== pref.name) {
      const existing = await ScannerPreference.findOne({
        where: { user_id: userId, name: data.name.trim() },
      });
      if (existing) {
        throw new BadRequestError(`A preference named '${data.name}' already exists`);
      }
    }

    const updates: Record<string, unknown> = {};
    if (data.name !== undefined) updates.name = data.name.trim();
    if (data.filters !== undefined) updates.filters = data.filters;
    if (data.isDefault !== undefined) updates.is_default = data.isDefault;

    if (Object.keys(updates).length > 0) {
      await pref.update(updates);
    }

    return pref.reload();
  }

  /**
   * Delete a preference.
   */
  async deletePreference(userId: number, preferenceId: number): Promise<void> {
    const pref = await this.getPreference(userId, preferenceId);
    await pref.destroy();
  }

  /**
   * Apply a saved preference: increment usage count, update last_used_at,
   * and return the query options.
   */
  async applyPreference(
    userId: number,
    preferenceId: number,
  ): Promise<{ options: OpportunityQueryOptions; preference: ScannerPreference }> {
    const pref = await this.getPreference(userId, preferenceId);

    // Update usage stats
    await pref.update({
      usage_count: pref.usage_count + 1,
      last_used_at: new Date(),
    });

    const options = this.filtersToQueryOptions(pref.filters);
    return { options, preference: pref };
  }

  /**
   * Get the user's default preference, if any.
   */
  async getDefaultPreference(userId: number): Promise<ScannerPreference | null> {
    return ScannerPreference.findOne({
      where: { user_id: userId, is_default: true },
    });
  }

  /**
   * Reorder preferences.
   */
  async reorderPreferences(userId: number, orderedIds: number[]): Promise<void> {
    for (let i = 0; i < orderedIds.length; i++) {
      await ScannerPreference.update(
        { sort_order: i },
        { where: { id: orderedIds[i], user_id: userId } },
      );
    }
  }
}

export const scannerFilterService = new ScannerFilterService();
export { ScannerFilterService };
