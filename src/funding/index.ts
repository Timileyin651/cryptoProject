// ── Core engine ───────────────────────────────────────────────────────────
export { FundingArbitrageEngine } from './FundingArbitrageEngine';

// ── Services & calculators ───────────────────────────────────────────────
export { FundingRateService } from './FundingRateService';
export { BasisSpreadCalculator } from './BasisSpreadCalculator';

// ── Types ─────────────────────────────────────────────────────────────────
export type {
  FundingRateEntry,
  FundingRateHistoryRecord,
  SpotPerpPair,
  BasisSpreadResult,
  PositionSide,
  FundingOpportunityStatus,
  FundingEngineConfig,
  FundingRateResponse,
  FundingOpportunityResponse,
} from './types';

// ── Module singleton ─────────────────────────────────────────────────────

import { FundingArbitrageEngine } from './FundingArbitrageEngine';
import { ExchangeAdapter } from '../exchanges/ExchangeAdapter';
import { logger } from '../utils/logger';

/**
 * Module-level singleton for the FundingArbitrageEngine.
 * Initialized once at startup via `initFundingModule()`.
 */
let engine: FundingArbitrageEngine | null = null;

/**
 * Initialize the funding arbitrage module.
 * Call once at application boot after exchanges are initialized.
 *
 * @param adapters - All registered exchange adapters.
 * @param config - Optional engine configuration.
 */
export async function initFundingModule(
  adapters: ExchangeAdapter[],
  config?: Parameters<typeof FundingArbitrageEngine.prototype.updateConfig>[0],
): Promise<void> {
  // Filter to adapters that support futures
  const futuresAdapters = adapters.filter((a) => a.capabilities.supportsFutures);

  if (futuresAdapters.length === 0) {
    logger.warn('[FundingModule] No exchanges with futures support — skipping initialization');
    return;
  }

  engine = new FundingArbitrageEngine(futuresAdapters, config);
  await engine.initialize();

  logger.info(
    `[FundingModule] Initialized with ${futuresAdapters.length} futures-capable adapter(s)`,
  );
}

/**
 * Start the funding engine continuous scanning.
 */
export async function startFundingModule(): Promise<void> {
  if (!engine) {
    logger.error('[FundingModule] Cannot start — module not initialized');
    return;
  }
  await engine.start();
}

/**
 * Stop the funding engine.
 */
export async function stopFundingModule(): Promise<void> {
  if (!engine) return;
  await engine.stop();
  engine = null;
}

/**
 * Get the engine instance (for use by controllers).
 */
export function getEngine(): FundingArbitrageEngine | null {
  return engine;
}

/**
 * Funding module namespace for clean access from controllers.
 */
export const fundingModule = {
  init: initFundingModule,
  start: startFundingModule,
  stop: stopFundingModule,
  getEngine,
};
