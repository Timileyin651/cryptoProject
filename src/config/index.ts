import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// ── Startup validation: secrets MUST be set ─────────────────────────
const requiredEnvVars = ['JWT_SECRET', 'JWT_REFRESH_SECRET'] as const;
for (const key of requiredEnvVars) {
  const val = process.env[key];
  if (!val || val.length < 16) {
    throw new Error(
      `[FATAL] ${key} must be set and at least 16 characters. ` +
        `Generate one with: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`,
    );
  }
}

// ── Sanitize API_PREFIX ────────────────────────────────────────────────
// On Windows (Git Bash / MSYS), paths like /api/v1 may be auto-converted
// to C:/Users/.../api/v1 by the shell before Node sees them.  dotenv also
// does NOT override env vars that already exist.  Detect the mangled form
// and fall back to the safe default so routes always mount correctly.
function sanitizeApiPrefix(raw: string | undefined): string {
  const fallback = '/api/v1';
  if (!raw) return fallback;
  // A valid API prefix must start with '/' and contain no Windows drive letters
  if (/^\/[a-zA-Z0-9/_-]/.test(raw) && !/^[A-Z]:\\/i.test(raw)) {
    return raw;
  }
  // eslint-disable-next-line no-console
  console.warn(
    `[Config] API_PREFIX value '${raw}' looks invalid (MSYS path mangling?). ` +
    `Falling back to '${fallback}'.`,
  );
  return fallback;
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),
  apiPrefix: sanitizeApiPrefix(process.env.API_PREFIX),

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306', 10),
    name: process.env.DB_NAME || 'crypto_arbitrage',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    dialect: (process.env.DB_DIALECT || 'mysql') as 'mysql',
    pool: {
      min: parseInt(process.env.DB_POOL_MIN || '2', 10),
      max: parseInt(process.env.DB_POOL_MAX || '10', 10),
      acquire: parseInt(process.env.DB_POOL_ACQUIRE || '30000', 10),
      idle: parseInt(process.env.DB_POOL_IDLE || '10000', 10),
    },
  },

  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    dir: process.env.LOG_DIR || './logs',
  },

  cors: {
    // Comma-separated list of allowed origins.
    // In dev: http://localhost:5173,http://localhost:3000
    // In prod: https://yourdomain.com
    allowedOrigins: (process.env.CORS_ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:3000')
    
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  websocket: {
    corsOrigin: process.env.WS_CORS_ORIGIN || 'http://localhost:5173',
  },

  jwt: {
    secret: process.env.JWT_SECRET!,
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshSecret: process.env.JWT_REFRESH_SECRET!,
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  },

  cookie: {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: (process.env.COOKIE_SAME_SITE || 'lax') as 'lax' | 'strict' | 'none',
    maxAge: parseInt(process.env.COOKIE_MAX_AGE || '604800000', 10), // 7 days
  },

  email: {
    from: process.env.EMAIL_FROM || 'noreply@example.com',
    verificationUrlBase:
      process.env.EMAIL_VERIFICATION_URL || 'http://localhost:3000/api/v1/auth/verify-email',
    resetPasswordUrlBase:
      process.env.RESET_PASSWORD_URL || 'http://localhost:3000/auth/reset-password',
  },

  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
    webhookSecret: process.env.PAYSTACK_WEBHOOK_SECRET || '',
    baseUrl: process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co',
    // Default currency and callback URL
    defaultCurrency: process.env.PAYSTACK_CURRENCY || 'NGN',
    callbackUrl:
      process.env.PAYSTACK_CALLBACK_URL || 'http://localhost:3000/billing/checkout-result',
  },
} as const;

export type Config = typeof config;
