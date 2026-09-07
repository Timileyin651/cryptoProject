import { Request, Response, NextFunction } from 'express';
import { scannerFilterService, FILTER_FEATURE_MAP } from '../services/ScannerFilterService';
import { ForbiddenError } from '../utils/errors';

/**
 * Middleware that enforces plan-based filter restrictions on
 * the opportunity scanner query endpoint.
 *
 * This runs BEFORE the controller handler and:
 * 1. Resolves the user's plan limits
 * 2. Checks which query params require higher-tier features
 * 3. Strips unauthorized params and attaches restrictions
 * 4. Clamps page size and result limits
 *
 * If the user is not authenticated, allows the query through
 * with free-tier limits applied to unauthenticated requests.
 *
 * Usage:
 *   router.get('/opportunities', enforceScannerLimits, handler);
 */
export async function enforceScannerLimits(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const userId = req.user?.userId;

    // If not authenticated, apply free-tier limits
    if (!userId) {
      const freeLimits = {
        maxPageSize: 25,
        maxResultsPerQuery: 100,
        allowAdvancedFilters: false,
        allowSpreadFilters: false,
        allowProfitFilters: false,
        allowNetworkFilter: false,
        allowDepositWithdrawFilters: false,
        allowStablecoinFilter: false,
        allowFiatFilter: false,
        allowLiquidityFilter: false,
      };

      // Strip advanced filters for unauthenticated users
      const restricted = checkQueryParams(req.query, freeLimits);
      if (restricted.length > 0) {
        for (const param of restricted) {
          delete (req.query as any)[param];
        }
        (req as any)._scannerRestrictions = restricted.map((p) => `${p} removed — login required`);
      }

      // Clamp page size
      if (req.query.limit) {
        const limit = parseInt(req.query.limit as string, 10);
        if (limit > freeLimits.maxPageSize) {
          req.query.limit = String(freeLimits.maxPageSize);
        }
      }

      next();
      return;
    }

    // Authenticated: enforce plan limits
    const { sanitized, restrictions } = await scannerFilterService.enforceLimits(
      userId,
      req.query as any,
    );

    // Apply sanitized values back to req.query
    // First, clear all filter params
    const filterKeys = [
      'minSpread',
      'maxSpread',
      'minProfit',
      'maxProfit',
      'minRoi',
      'maxRoi',
      'minVolume',
      'network',
      'liquidityExecutable',
      'withdrawalAvailable',
      'depositAvailable',
      'stablecoinPairs',
      'fiatPairs',
    ];

    for (const key of filterKeys) {
      if ((sanitized as any)[key] === undefined) {
        delete (req.query as any)[key];
      } else {
        (req.query as any)[key] = String((sanitized as any)[key]);
      }
    }

    // Apply clamped limit
    if (sanitized.limit !== undefined) {
      req.query.limit = String(sanitized.limit);
    }

    // Attach restrictions for the response
    if (restrictions.length > 0) {
      (req as any)._scannerRestrictions = restrictions;
    }

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Check which query params are restricted by the given limits.
 * Returns the list of param names that should be stripped.
 */
function checkQueryParams(
  query: Record<string, any>,
  limits: {
    allowAdvancedFilters: boolean;
    allowSpreadFilters: boolean;
    allowProfitFilters: boolean;
    allowNetworkFilter: boolean;
    allowDepositWithdrawFilters: boolean;
    allowStablecoinFilter: boolean;
    allowFiatFilter: boolean;
    allowLiquidityFilter: boolean;
  },
): string[] {
  const restricted: string[] = [];

  if (!limits.allowSpreadFilters) {
    if (query.minSpread !== undefined) restricted.push('minSpread');
    if (query.maxSpread !== undefined) restricted.push('maxSpread');
  }

  if (!limits.allowProfitFilters) {
    if (query.minProfit !== undefined) restricted.push('minProfit');
    if (query.maxProfit !== undefined) restricted.push('maxProfit');
    if (query.minRoi !== undefined) restricted.push('minRoi');
    if (query.maxRoi !== undefined) restricted.push('maxRoi');
  }

  if (!limits.allowAdvancedFilters && query.minVolume !== undefined) {
    restricted.push('minVolume');
  }

  if (!limits.allowNetworkFilter && query.network !== undefined) {
    restricted.push('network');
  }

  if (!limits.allowDepositWithdrawFilters) {
    if (query.withdrawalAvailable !== undefined) restricted.push('withdrawalAvailable');
    if (query.depositAvailable !== undefined) restricted.push('depositAvailable');
  }

  if (!limits.allowLiquidityFilter && query.liquidityExecutable !== undefined) {
    restricted.push('liquidityExecutable');
  }

  if (!limits.allowStablecoinFilter && query.stablecoinPairs !== undefined) {
    restricted.push('stablecoinPairs');
  }

  if (!limits.allowFiatFilter && query.fiatPairs !== undefined) {
    restricted.push('fiatPairs');
  }

  return restricted;
}

/**
 * Middleware that attaches scanner restrictions to the response.
 * Run AFTER the controller handler.
 */
export function attachScannerRestrictions(req: Request, res: Response, next: NextFunction): void {
  const restrictions = (req as any)._scannerRestrictions;
  if (restrictions && restrictions.length > 0) {
    // Monkey-patch res.json to inject restrictions
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      if (body && typeof body === 'object') {
        body._restrictions = restrictions;
      }
      return originalJson(body);
    };
  }
  next();
}
