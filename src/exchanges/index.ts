import { exchangeService } from '../services/ExchangeService';
import { createAllAdapters } from './adapters';
import { logger } from '../utils/logger';

/**
 * Initialise all exchange adapters and register them with the
 * ExchangeService. Called once at application boot.
 *
 * Public market data does not require API keys — adapters work
 * out of the box. Pass per-exchange configs only when you need
 * private endpoints (account, orders, etc.).
 */
export async function initExchanges(): Promise<void> {
  const adapters = createAllAdapters();

  for (const adapter of adapters) {
    try {
      await adapter.initialize();
      exchangeService.registerAdapter(adapter);
    } catch (error) {
      logger.error(`Failed to initialise adapter ${adapter.slug}:`, error);
      // Continue — don't let one broken adapter block the rest
    }
  }

  const registered = exchangeService.getRegisteredAdapterSlugs();
  logger.info(`Exchanges module ready — ${registered.length} adapter(s): ${registered.join(', ')}`);
}

/**
 * Gracefully shut down all registered adapters.
 */
export async function shutdownExchanges(): Promise<void> {
  const slugs = exchangeService.getRegisteredAdapterSlugs();
  for (const slug of slugs) {
    const adapter = exchangeService.getAdapter(slug);
    if (adapter) {
      try {
        await adapter.shutdown();
      } catch (error) {
        logger.error(`Error shutting down adapter ${slug}:`, error);
      }
    }
  }
}

export { SUPPORTED_EXCHANGES } from './adapters';
export type { SupportedExchangeSlug } from './adapters';
