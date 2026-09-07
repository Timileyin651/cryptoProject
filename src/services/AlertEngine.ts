import { EventEmitter } from 'events';
import { Alert } from '../models/Alert';
import { OpportunityRecord } from '../models/OpportunityRecord';
import { alertService } from './AlertService';
import { alertEvaluator, AlertMatch } from './AlertEvaluator';
import { notificationService } from './NotificationService';
import { logger } from '../utils/logger';

// ──────────────────── Config ───────────────────────────────────────────

export interface AlertEngineConfig {
  /** How often to evaluate alerts in ms. Default: 30000 (30s). */
  evaluationIntervalMs: number;
  /** Maximum age of opportunities to evaluate in ms. Default: 300000 (5min). */
  maxOpportunityAgeMs: number;
  /** Maximum number of opportunities to fetch per evaluation. Default: 500. */
  maxOpportunities: number;
}

const DEFAULT_CONFIG: AlertEngineConfig = {
  evaluationIntervalMs: 30_000,
  maxOpportunityAgeMs: 300_000,
  maxOpportunities: 500,
};

// ──────────────────── AlertEngine ──────────────────────────────────────

export class AlertEngine extends EventEmitter {
  private config: AlertEngineConfig;
  private evaluationTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;
  private lastEvaluationAt: Date | null = null;
  private lastEvaluationMatchCount = 0;
  private totalNotificationsSent = 0;

  constructor(config?: Partial<AlertEngineConfig>) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  // ──────────────────── Lifecycle ─────────────────────────────────────

  /** Start the alert engine. */
  start(): void {
    if (this.isRunning) {
      logger.warn('[AlertEngine] Already running');
      return;
    }

    logger.info(`[AlertEngine] Starting — evaluating every ${this.config.evaluationIntervalMs}ms`);
    this.isRunning = true;

    // Run immediately, then on interval
    this.evaluate().catch((err) => {
      logger.error('[AlertEngine] Initial evaluation failed', { error: err.message });
    });

    this.evaluationTimer = setInterval(() => {
      this.evaluate().catch((err) => {
        logger.error('[AlertEngine] Evaluation failed', { error: err.message });
      });
    }, this.config.evaluationIntervalMs);
  }

  /** Stop the alert engine. */
  stop(): void {
    if (this.evaluationTimer) {
      clearInterval(this.evaluationTimer);
      this.evaluationTimer = null;
    }
    this.isRunning = false;
    logger.info('[AlertEngine] Stopped');
  }

  /** Check if the engine is running. */
  getIsRunning(): boolean {
    return this.isRunning;
  }

  /** Get engine status. */
  getStatus(): {
    isRunning: boolean;
    lastEvaluationAt: Date | null;
    lastEvaluationMatchCount: number;
    totalNotificationsSent: number;
  } {
    return {
      isRunning: this.isRunning,
      lastEvaluationAt: this.lastEvaluationAt,
      lastEvaluationMatchCount: this.lastEvaluationMatchCount,
      totalNotificationsSent: this.totalNotificationsSent,
    };
  }

  // ──────────────────── Evaluation ────────────────────────────────────

  /** Run one evaluation cycle. */
  async evaluate(): Promise<AlertMatch[]> {
    const startTime = Date.now();

    // 1. Get all active alerts
    const alerts = await alertService.getActiveAlerts();
    if (alerts.length === 0) {
      this.lastEvaluationAt = new Date();
      this.lastEvaluationMatchCount = 0;
      return [];
    }

    // 2. Get recent opportunities
    const cutoff = new Date(Date.now() - this.config.maxOpportunityAgeMs);
    const opportunities = await OpportunityRecord.findAll({
      where: {
        calculated_at: { [require('sequelize').Op.gte]: cutoff },
        status: { [require('sequelize').Op.in]: ['active', 'marginal'] },
      },
      order: [['calculated_at', 'DESC']],
      limit: this.config.maxOpportunities,
    });

    if (opportunities.length === 0) {
      this.lastEvaluationAt = new Date();
      this.lastEvaluationMatchCount = 0;
      return [];
    }

    // 3. Evaluate each alert against opportunities
    const allMatches: AlertMatch[] = [];

    // Group alerts by user to batch preferences lookups
    const alertsByUser = new Map<number, Alert[]>();
    for (const alert of alerts) {
      const userAlerts = alertsByUser.get(alert.user_id) ?? [];
      userAlerts.push(alert);
      alertsByUser.set(alert.user_id, userAlerts);
    }

    for (const alert of alerts) {
      // Skip alerts in cooldown
      if (alertService.isInCooldown(alert)) {
        continue;
      }

      // Evaluate this alert against all opportunities
      const matches = alertEvaluator.evaluateBatch(alert, opportunities);

      // For each match, dispatch notification (handles dedup internally)
      for (const match of matches) {
        try {
          const notifications = await notificationService.dispatch(match);
          if (notifications.length > 0) {
            allMatches.push(match);
            this.totalNotificationsSent += notifications.length;
          }
        } catch (error) {
          logger.error('[AlertEngine] Failed to dispatch notification', {
            alertId: alert.id,
            error: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }

    const duration = Date.now() - startTime;
    this.lastEvaluationAt = new Date();
    this.lastEvaluationMatchCount = allMatches.length;

    if (allMatches.length > 0) {
      logger.info(
        `[AlertEngine] Evaluation complete — ${allMatches.length} match(es) in ${duration}ms`,
      );
    }

    // Emit events for downstream consumers
    this.emit('evaluationComplete', {
      timestamp: new Date(),
      alertsEvaluated: alerts.length,
      opportunitiesScanned: opportunities.length,
      matchesFound: allMatches.length,
      duration,
    });

    if (allMatches.length > 0) {
      this.emit('matches', allMatches);
    }

    return allMatches;
  }

  // ──────────────────── Config ────────────────────────────────────────

  /** Update config at runtime. */
  updateConfig(config: Partial<AlertEngineConfig>): void {
    this.config = { ...this.config, ...config };
    logger.info('[AlertEngine] Config updated', config);

    // Restart timer if interval changed and engine is running
    if (config.evaluationIntervalMs && this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

// ──────────────────── Singleton ────────────────────────────────────────

let engineInstance: AlertEngine | null = null;

export function getAlertEngine(config?: Partial<AlertEngineConfig>): AlertEngine {
  if (!engineInstance) {
    engineInstance = new AlertEngine(config);
  }
  return engineInstance;
}

export function resetAlertEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
    engineInstance = null;
  }
}
