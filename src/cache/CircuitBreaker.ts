/**
 * Shared circuit breaker with exponential backoff and jitter.
 *
 * All consumers (ArbitrageEngine, FeeCalculator, NetworkChecker) share
 * one breaker per exchange via CircuitBreakerRegistry.
 *
 * States:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: failures exceeded threshold, requests are fast-failed
 * - HALF_OPEN: after cooldown, a limited number of test requests allowed
 *
 * Backoff:
 * - Initial cooldown: 30s
 * - Doubles on each open→half_open→open cycle (max 5 minutes)
 * - Jitter: ±20% to prevent thundering herd
 */

import { logger } from '../utils/logger';

export type BreakerState = 'closed' | 'open' | 'half_open';

export interface BreakerStatus {
  state: BreakerState;
  failureCount: number;
  successCount: number;
  lastFailureTime: number;
  currentCooldownMs: number;
  consumer: string;
}

export class CircuitBreaker {
  private state: BreakerState = 'closed';
  private failureCount = 0;
  private lastFailureTime = 0;
  private successCount = 0;
  private consecutiveOpenCycles = 0;
  private lastLoggedTransition = '';

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly baseCooldownMs: number = 30_000,
    private readonly halfOpenMaxAttempts: number = 3,
    private readonly maxCooldownMs: number = 300_000, // 5 min ceiling
    private readonly consumer: string = 'default',
  ) {}

  /** Check if the circuit is allowing requests. */
  allowRequest(): boolean {
    if (this.state === 'closed') return true;

    if (this.state === 'open') {
      const elapsed = Date.now() - this.lastFailureTime;
      const cooldown = this.getEffectiveCooldown();
      if (elapsed >= cooldown) {
        this.state = 'half_open';
        this.successCount = 0;
        this.logTransition('closed→half_open', `after ${elapsed}ms (cooldown ${cooldown}ms)`);
        return true;
      }
      return false;
    }

    // half_open: allow limited requests
    return this.successCount < this.halfOpenMaxAttempts;
  }

  /** Record a successful request. */
  recordSuccess(): void {
    if (this.state === 'half_open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenMaxAttempts) {
        this.state = 'closed';
        this.failureCount = 0;
        this.consecutiveOpenCycles = 0;
        this.logTransition('half_open→closed', 'service recovered');
      }
    } else {
      this.failureCount = 0;
    }
  }

  /** Record a failed request. */
  recordFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.state === 'half_open') {
      this.state = 'open';
      this.consecutiveOpenCycles++;
      this.logTransition('half_open→open', `failure during half-open probe (${this.consumer})`);
    } else if (this.failureCount >= this.failureThreshold) {
      this.state = 'open';
      this.consecutiveOpenCycles++;
      this.logTransition('closed→open', `${this.failureCount} consecutive failures`);
    }
  }

  /** Get current state for monitoring. */
  getState(): BreakerStatus {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
      currentCooldownMs: this.getEffectiveCooldown(),
      consumer: this.consumer,
    };
  }

  /** Manually reset the circuit breaker. */
  reset(): void {
    this.state = 'closed';
    this.failureCount = 0;
    this.successCount = 0;
    this.consecutiveOpenCycles = 0;
  }

  /**
   * Get the effective cooldown with exponential backoff and jitter.
   * Base: 30s, doubles per cycle, capped at 5min, ±20% jitter.
   */
  private getEffectiveCooldown(): number {
    const exponential = Math.min(
      this.baseCooldownMs * Math.pow(2, this.consecutiveOpenCycles),
      this.maxCooldownMs,
    );
    // Add ±20% jitter to prevent thundering herd
    const jitter = exponential * 0.2 * (Math.random() * 2 - 1);
    return Math.round(exponential + jitter);
  }

  /**
   * Log state transitions, but deduplicate near-simultaneous transitions
   * from the same consumer to avoid log noise.
   */
  private logTransition(transition: string, detail: string): void {
    const key = transition;
    const now = Date.now();

    // Dedupe: skip if same transition within 500ms
    if (this.lastLoggedTransition === key) return;
    this.lastLoggedTransition = key;
    setTimeout(() => {
      if (this.lastLoggedTransition === key) this.lastLoggedTransition = '';
    }, 500);

    const status = this.getState();
    logger.info(
      `[CircuitBreaker:${this.consumer}] ${transition} — ${detail} ` +
        `(failures=${status.failureCount}, cooldown=${status.currentCooldownMs}ms)`,
    );
  }
}

// ──────────────────── Shared Registry ───────────────────────────────

/**
 * Singleton registry of circuit breakers keyed by exchange slug.
 * All consumers share the same breaker per exchange.
 */
class CircuitBreakerRegistry {
  private breakers = new Map<string, CircuitBreaker>();

  /**
   * Get or create a circuit breaker for an exchange.
   * The first consumer to request a breaker sets the consumer tag;
   * subsequent consumers share the same instance.
   */
  get(exchangeSlug: string, consumer: string = 'default'): CircuitBreaker {
    let breaker = this.breakers.get(exchangeSlug);
    if (!breaker) {
      breaker = new CircuitBreaker(5, 30_000, 3, 300_000, consumer);
      this.breakers.set(exchangeSlug, breaker);
    }
    return breaker;
  }

  /**
   * Get all breaker statuses (for health endpoint / frontend).
   */
  getAllStatuses(): Record<string, BreakerStatus> {
    const result: Record<string, BreakerStatus> = {};
    for (const [slug, breaker] of this.breakers) {
      result[slug] = breaker.getState();
    }
    return result;
  }

  /**
   * Get a summary of which exchanges are healthy vs degraded.
   */
  getHealthSummary(): Record<string, 'ok' | 'degraded' | 'down'> {
    const result: Record<string, 'ok' | 'degraded' | 'down'> = {};
    for (const [slug, breaker] of this.breakers) {
      const state = breaker.getState();
      if (state.state === 'closed') {
        result[slug] = 'ok';
      } else if (state.state === 'half_open') {
        result[slug] = 'degraded';
      } else {
        result[slug] = 'down';
      }
    }
    return result;
  }

  /**
   * Reset all breakers (for manual recovery).
   */
  resetAll(): void {
    for (const breaker of this.breakers.values()) {
      breaker.reset();
    }
  }
}

/** Singleton registry — all consumers share this. */
export const circuitBreakerRegistry = new CircuitBreakerRegistry();

/**
 * Convenience function — get a shared breaker for an exchange.
 * Replaces the old per-consumer `getExchangeBreaker()`.
 */
export function getExchangeBreaker(exchangeSlug: string, consumer: string = 'default'): CircuitBreaker {
  return circuitBreakerRegistry.get(exchangeSlug, consumer);
}
