/**
 * Log redaction utility.
 *
 * Scrubs passwords, JWT secrets, Paystack keys, exchange credentials,
 * and other sensitive values from objects before they are written to logs.
 *
 * Rules:
 * - Keys matching known sensitive patterns are replaced with "[REDACTED]"
 * - Values matching known secret formats (Bearer tokens, base64 keys) are masked
 * - Deep traversal of nested objects and arrays
 * - Never logs passwords, JWT secrets, Paystack secrets, or exchange credentials
 */

// ── Sensitive key patterns ────────────────────────────────────────────

const SENSITIVE_KEY_PATTERNS = [
  /password/i,
  /passwd/i,
  /secret/i,
  /token/i,
  /api[_-]?key/i,
  /apikey/i,
  /private[_-]?key/i,
  /access[_-]?key/i,
  /credential/i,
  /auth/i,
  /bearer/i,
  /jwt/i,
  /paystack/i,
  /webhook[_-]?secret/i,
  /hmac/i,
  /signature/i,
  /credit[_-]?card/i,
  /card[_-]?number/i,
  /cvv/i,
  /ssn/i,
];

// Exact key names that are always redacted
const SENSITIVE_EXACT_KEYS = new Set([
  'password',
  'password_hash',
  'passwordHash',
  'db_password',
  'dbPassword',
  'redis_password',
  'redisPassword',
  'jwt_secret',
  'jwtSecret',
  'jwt_refresh_secret',
  'jwtRefreshSecret',
  'refresh_secret',
  'refreshSecret',
  'paystack_secret_key',
  'paystackSecretKey',
  'paystack_webhook_secret',
  'paystackWebhookSecret',
  'secret_key',
  'secretKey',
  'api_key',
  'apiKey',
  'access_key',
  'accessToken',
  'authorization',
  'x_paystack_signature',
  'x-paystack-signature',
  'rawBody',
  'raw_body',
  'card_number',
  'cardNumber',
  'cvv',
  'cvc',
]);

// ── Value patterns that indicate secrets ───────────────────────────────

const SENSITIVE_VALUE_PATTERNS = [
  /^Bearer\s+/i,
  /^sk_live_/,
  /^sk_test_/,
  /^pk_live_/,
  /^pk_test_/,
  /^whsec_/,
  /^eyJ[A-Za-z0-9_-]{10,}\.eyJ/, // JWT tokens
];

// ── Core redaction logic ──────────────────────────────────────────────

function isSensitiveKey(key: string): boolean {
  if (SENSITIVE_EXACT_KEYS.has(key)) return true;
  return SENSITIVE_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

function isSensitiveValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length < 8) return false; // short values are unlikely secrets
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

function maskValue(value: unknown): string {
  if (typeof value !== 'string') return '[REDACTED]';
  if (value.length <= 4) return '****';
  return `${value.slice(0, 2)}****${value.slice(-2)}`;
}

/**
 * Deep-clone and redact sensitive fields from an object.
 * Returns a new object — the original is never mutated.
 */
export function redactSensitive<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj !== 'object') {
    if (isSensitiveValue(obj)) return maskValue(obj) as T;
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => redactSensitive(item)) as T;
  }

  const redacted: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    if (isSensitiveKey(key)) {
      redacted[key] = '[REDACTED]';
    } else if (typeof value === 'object' && value !== null) {
      redacted[key] = redactSensitive(value);
    } else if (isSensitiveValue(value)) {
      redacted[key] = maskValue(value);
    } else {
      redacted[key] = value;
    }
  }

  return redacted as T;
}

/**
 * Create a winston transport format that redacts sensitive data.
 * Use as: winston.format(redactFormat())(info)
 */
import winston from 'winston';
import { TransformableInfo, Format } from 'logform';

/**
 * Create a winston format that redacts sensitive data.
 */
export function redactFormat(): Format {
  return winston.format((info: TransformableInfo) => {
    const msg = info.message;
    // Redact the message if it's a string containing sensitive patterns
    if (typeof msg === 'string') {
      for (const pattern of SENSITIVE_VALUE_PATTERNS) {
        if (pattern.test(msg)) {
          info.message = msg.replace(pattern, '[REDACTED]');
        }
      }
    }

    // Redact all meta fields
    const { message, level, timestamp, ...meta } = info;
    const redactedMeta = redactSensitive(meta);

    return {
      message,
      level,
      timestamp,
      ...redactedMeta,
    };
  })();
}
