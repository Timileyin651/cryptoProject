import { AppError } from '../utils/errors';

/**
 * Base error for all exchange-related failures.
 * Wraps the original CCXT error when available.
 */
export class ExchangeError extends AppError {
  public readonly exchangeSlug: string;
  public readonly originalError?: Error;

  constructor(message: string, exchangeSlug: string, originalError?: Error) {
    super(message, 502);
    this.name = 'ExchangeError';
    this.exchangeSlug = exchangeSlug;
    this.originalError = originalError;
  }
}

/** Rate limit exceeded on the exchange side. */
export class ExchangeRateLimitError extends ExchangeError {
  public readonly retryAfterMs: number | null;

  constructor(exchangeSlug: string, retryAfterMs?: number) {
    super(`Rate limit exceeded on ${exchangeSlug}`, exchangeSlug);
    this.name = 'ExchangeRateLimitError';
    this.retryAfterMs = retryAfterMs ?? null;
    Object.defineProperty(this, 'statusCode', { value: 429, writable: false });
  }
}

/** The requested symbol or market does not exist on the exchange. */
export class ExchangeSymbolNotFoundError extends ExchangeError {
  constructor(exchangeSlug: string, symbol: string) {
    super(`Symbol '${symbol}' not found on ${exchangeSlug}`, exchangeSlug);
    this.name = 'ExchangeSymbolNotFoundError';
    Object.defineProperty(this, 'statusCode', { value: 404, writable: false });
  }
}

/** Network / connectivity failure reaching the exchange. */
export class ExchangeNetworkError extends ExchangeError {
  constructor(exchangeSlug: string, originalError?: Error) {
    super(`Network error communicating with ${exchangeSlug}`, exchangeSlug, originalError);
    this.name = 'ExchangeNetworkError';
  }
}

/** Authentication failure (for private endpoints). */
export class ExchangeAuthError extends ExchangeError {
  constructor(exchangeSlug: string, message?: string) {
    super(message ?? `Authentication failed for ${exchangeSlug}`, exchangeSlug);
    this.name = 'ExchangeAuthError';
    Object.defineProperty(this, 'statusCode', { value: 401, writable: false });
  }
}

/** Exchange returned an unexpected or malformed response. */
export class ExchangeDataError extends ExchangeError {
  constructor(exchangeSlug: string, detail?: string) {
    super(`Unexpected data from ${exchangeSlug}${detail ? `: ${detail}` : ''}`, exchangeSlug);
    this.name = 'ExchangeDataError';
  }
}
