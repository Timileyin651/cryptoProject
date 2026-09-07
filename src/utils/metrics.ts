/**
 * Prometheus-compatible metrics registry.
 *
 * Exposes counters, gauges, and histograms that can be scraped
 * at the /metrics endpoint. No external dependencies — pure string
 * formatting matching the Prometheus exposition format.
 */

// ── Metric types ──────────────────────────────────────────────────────

export interface CounterMetric {
  type: 'counter';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export interface GaugeMetric {
  type: 'gauge';
  help: string;
  value: number;
  labels?: Record<string, string>;
}

export interface HistogramBucket {
  le: number;
  count: number;
}

export interface HistogramMetric {
  type: 'histogram';
  help: string;
  buckets: HistogramBucket[];
  sum: number;
  count: number;
  labels?: Record<string, string>;
}

type Metric = CounterMetric | GaugeMetric | HistogramMetric;

// ── Registry ──────────────────────────────────────────────────────────

class MetricsRegistry {
  private metrics = new Map<string, Metric>();

  /**
   * Register or update a counter.
   */
  counter(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    const existing = this.metrics.get(key) as CounterMetric | undefined;
    if (existing) {
      existing.value += value;
    } else {
      this.metrics.set(key, { type: 'counter', help, value, labels });
    }
  }

  /**
   * Increment a counter by 1.
   */
  incCounter(name: string, help: string, labels?: Record<string, string>): void {
    this.counter(name, help, 1, labels);
  }

  /**
   * Set a gauge to a specific value.
   */
  gauge(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    this.metrics.set(key, { type: 'gauge', help, value, labels });
  }

  /**
   * Record a value in a histogram.
   */
  histogram(name: string, help: string, value: number, labels?: Record<string, string>): void {
    const key = this.key(name, labels);
    const existing = this.metrics.get(key) as HistogramMetric | undefined;

    if (existing) {
      existing.sum += value;
      existing.count += 1;
      for (const bucket of existing.buckets) {
        if (value <= bucket.le) {
          bucket.count += 1;
        }
      }
    } else {
      const defaultBuckets = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, Infinity];
      this.metrics.set(key, {
        type: 'histogram',
        help,
        buckets: defaultBuckets.map((le) => ({ le, count: value <= le ? 1 : 0 })),
        sum: value,
        count: 1,
        labels,
      });
    }
  }

  /**
   * Render all metrics in Prometheus exposition format.
   */
  render(): string {
    const lines: string[] = [];
    const grouped = new Map<string, Metric[]>();

    // Group metrics by name
    for (const [, metric] of this.metrics) {
      const name = this.getName(metric);
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push(metric);
    }

    for (const [name, metrics] of grouped) {
      const first = metrics[0];
      lines.push(`# HELP ${name} ${first.help}`);
      lines.push(`# TYPE ${name} ${first.type}`);

      for (const metric of metrics) {
        const labels = metric.labels ? this.formatLabels(metric.labels) : '';

        if (metric.type === 'counter' || metric.type === 'gauge') {
          lines.push(`${name}${labels} ${metric.value}`);
        } else if (metric.type === 'histogram') {
          for (const bucket of metric.buckets) {
            const le = bucket.le === Infinity ? '+Inf' : String(bucket.le);
            lines.push(`${name}_bucket{le="${le}"${labels ? ',' + labels.slice(1, -1) : ''}} ${bucket.count}`);
          }
          lines.push(`${name}_sum${labels} ${metric.sum}`);
          lines.push(`${name}_count${labels} ${metric.count}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Clear all metrics (for testing).
   */
  clear(): void {
    this.metrics.clear();
  }

  private key(name: string, labels?: Record<string, string>): string {
    if (!labels) return name;
    const sorted = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `${name}{${sorted}}`;
  }

  private getName(metric: Metric): string {
    // Extract name from the key (everything before {)
    for (const [key, m] of this.metrics) {
      if (m === metric) {
        const idx = key.indexOf('{');
        return idx === -1 ? key : key.slice(0, idx);
      }
    }
    return 'unknown';
  }

  private formatLabels(labels: Record<string, string>): string {
    const entries = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}="${v}"`)
      .join(',');
    return `{${entries}}`;
  }
}

// ── Singleton ─────────────────────────────────────────────────────────

export const metrics = new MetricsRegistry();

// ── Pre-defined metric names ──────────────────────────────────────────

export const METRICS = {
  // HTTP
  HTTP_REQUESTS_TOTAL: 'http_requests_total',
  HTTP_REQUEST_DURATION: 'http_request_duration_seconds',
  HTTP_REQUESTS_IN_PROGRESS: 'http_requests_in_progress',

  // Database
  DB_QUERY_DURATION: 'db_query_duration_seconds',
  DB_CONNECTIONS_ACTIVE: 'db_connections_active',
  DB_ERRORS_TOTAL: 'db_errors_total',

  // Redis
  REDIS_COMMANDS_TOTAL: 'redis_commands_total',
  REDIS_COMMAND_DURATION: 'redis_command_duration_seconds',
  REDIS_ERRORS_TOTAL: 'redis_errors_total',
  REDIS_CONNECTIONS: 'redis_connections',

  // Exchanges
  EXCHANGE_API_REQUESTS_TOTAL: 'exchange_api_requests_total',
  EXCHANGE_API_REQUEST_DURATION: 'exchange_api_request_duration_seconds',
  EXCHANGE_CONNECTION_HEALTH: 'exchange_connection_health',
  EXCHANGE_CIRCUIT_BREAKER_STATE: 'exchange_circuit_breaker_state',

  // Scanner
  SCANNER_SCAN_DURATION: 'scanner_scan_duration_seconds',
  SCANNER_OPPORTUNITIES_FOUND: 'scanner_opportunities_found',
  SCANNER_PAIRS_SCANNED: 'scanner_pairs_scanned',
  SCANNER_ERRORS_TOTAL: 'scanner_errors_total',

  // Jobs
  JOBS_RUN_TOTAL: 'jobs_run_total',
  JOBS_RUN_DURATION: 'jobs_run_duration_seconds',
  JOBS_ACTIVE: 'jobs_active',

  // Payments
  PAYMENTS_WEBHOOKS_TOTAL: 'payments_webhooks_total',
  PAYMENTS_WEBHOOK_PROCESSING_DURATION: 'payments_webhook_processing_duration_seconds',
  PAYMENTS_TRANSACTIONS_TOTAL: 'payments_transactions_total',

  // System
  PROCESS_UPTIME: 'process_uptime_seconds',
  PROCESS_MEMORY_RSS: 'process_memory_rss_bytes',
  PROCESS_MEMORY_HEAP_USED: 'process_memory_heap_used_bytes',
} as const;
