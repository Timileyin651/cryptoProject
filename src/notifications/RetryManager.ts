import { logger } from '../utils/logger';

/**
 * Manages pending notification retries with cancellation support.
 *
 * Problem: setTimeout callbacks in NotificationService could fire after
 * the server begins shutdown, causing errors or sending notifications
 * to a partially-closed system.
 *
 * Solution: Track all pending retry timers and cancel them on shutdown.
 */
class RetryManager {
  private pendingRetries = new Map<number, ReturnType<typeof setTimeout>>();
  private shutdownRequested = false;

  /**
   * Schedule a retry. Returns false if shutdown is in progress.
   */
  schedule(notificationId: number, delayMs: number, callback: () => Promise<void>): boolean {
    if (this.shutdownRequested) {
      logger.debug(`[RetryManager] Skipping retry for #${notificationId} — shutdown in progress`);
      return false;
    }

    const timer = setTimeout(async () => {
      this.pendingRetries.delete(notificationId);
      try {
        await callback();
      } catch (error) {
        logger.error(`[RetryManager] Retry callback failed for #${notificationId}:`, error);
      }
    }, delayMs);

    this.pendingRetries.set(notificationId, timer);
    logger.debug(
      `[RetryManager] Scheduled retry for #${notificationId} in ${delayMs}ms ` +
        `(${this.pendingRetries.size} pending)`,
    );
    return true;
  }

  /**
   * Cancel a specific retry.
   */
  cancel(notificationId: number): void {
    const timer = this.pendingRetries.get(notificationId);
    if (timer) {
      clearTimeout(timer);
      this.pendingRetries.delete(notificationId);
    }
  }

  /**
   * Cancel all pending retries (for graceful shutdown).
   * Returns the number of cancelled retries.
   */
  cancelAll(): number {
    this.shutdownRequested = true;
    let cancelled = 0;
    for (const [id, timer] of this.pendingRetries.entries()) {
      clearTimeout(timer);
      cancelled++;
    }
    this.pendingRetries.clear();
    if (cancelled > 0) {
      logger.info(`[RetryManager] Cancelled ${cancelled} pending retry(s)`);
    }
    return cancelled;
  }

  /**
   * Get the number of pending retries.
   */
  get pendingCount(): number {
    return this.pendingRetries.size;
  }

  /**
   * Reset (for testing or after shutdown completes).
   */
  reset(): void {
    this.shutdownRequested = false;
    this.cancelAll();
  }
}

/** Singleton retry manager. */
export const retryManager = new RetryManager();
