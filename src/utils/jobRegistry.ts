/**
 * Job status registry.
 *
 * Tracks the state of background jobs (scanners, alerts, billing tasks)
 * for the /health/ready endpoint and Prometheus metrics.
 */

import { logger } from './logger';

// ── Types ─────────────────────────────────────────────────────────────

export type JobStatus = 'idle' | 'running' | 'error' | 'stopped';

export interface JobInfo {
  name: string;
  status: JobStatus;
  lastRunAt: string | null;
  lastDurationMs: number | null;
  lastError: string | null;
  totalRuns: number;
  totalErrors: number;
}

export interface JobRegistration {
  name: string;
  /** Whether the job must be running for readiness. */
  critical: boolean;
}

// ── Registry ──────────────────────────────────────────────────────────

class JobRegistry {
  private jobs = new Map<string, JobInfo>();

  /**
   * Register a job.
   */
  register(registration: JobRegistration): void {
    if (this.jobs.has(registration.name)) return;
    this.jobs.set(registration.name, {
      name: registration.name,
      status: 'idle',
      lastRunAt: null,
      lastDurationMs: null,
      lastError: null,
      totalRuns: 0,
      totalErrors: 0,
    });
    logger.debug(`[JobRegistry] Registered job: ${registration.name}`);
  }

  /**
   * Mark a job as started.
   */
  start(name: string): void {
    const job = this.jobs.get(name);
    if (!job) {
      this.register({ name, critical: false });
      return this.start(name);
    }
    job.status = 'running';
    job.lastRunAt = new Date().toISOString();
    job.lastError = null;
  }

  /**
   * Mark a job as completed successfully.
   */
  complete(name: string, durationMs: number): void {
    const job = this.jobs.get(name);
    if (!job) return;
    job.status = 'idle';
    job.lastDurationMs = durationMs;
    job.totalRuns += 1;
  }

  /**
   * Mark a job as failed.
   */
  fail(name: string, error: string, durationMs: number): void {
    const job = this.jobs.get(name);
    if (!job) return;
    job.status = 'error';
    job.lastError = error;
    job.lastDurationMs = durationMs;
    job.totalRuns += 1;
    job.totalErrors += 1;
  }

  /**
   * Mark a job as stopped.
   */
  stop(name: string): void {
    const job = this.jobs.get(name);
    if (!job) return;
    job.status = 'stopped';
  }

  /**
   * Get status of all registered jobs.
   */
  getAll(): JobInfo[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get a specific job.
   */
  get(name: string): JobInfo | undefined {
    return this.jobs.get(name);
  }

  /**
   * Check if all critical jobs are healthy (not in error state).
   */
  isHealthy(): boolean {
    for (const [, job] of this.jobs) {
      if (job.status === 'error') return false;
    }
    return true;
  }

  /**
   * Check if all critical jobs are running (for readiness).
   */
  allCriticalRunning(): boolean {
    for (const [, job] of this.jobs) {
      if (job.status === 'stopped') return false;
    }
    return true;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

export const jobRegistry = new JobRegistry();
