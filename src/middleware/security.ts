import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { Router } from 'express';
import { logger } from '../utils/logger';

/**
 * Build a human-readable label for the origin value in logs.
 * Distinguishes: absent header vs literal "null" vs actual URL.
 */
function originLabel(origin: string | undefined): string {
  if (origin === undefined) return '(no Origin header)';
  if (origin === 'null') return '(literal null — likely file:// or sandboxed iframe)';
  return origin;
}

export const securityMiddleware = (router: Router): void => {
  router.use(helmet());

  router.use(
    cors({
      origin: (origin, callback) => {
        // Case 1: No Origin header at all.
        // This is a same-origin browser request, curl, mobile app, or server-to-server.
        // The browser doesn't send Origin for same-origin fetches — this is normal and safe.
        if (origin === undefined || origin === null) {
          return callback(null, true);
        }

        // Case 2: Literal string "null" as the Origin header value.
        // This happens when the page is loaded via file:// protocol, from a
        // sandboxed iframe without allow-same-origin, or certain redirect chains.
        // NOT safe to allow in production — it's a well-known CORS bypass vector.
        if (origin === 'null') {
          if (config.env === 'development') {
            // In dev, allow it but warn loudly — the user probably opened file:// by accident.
            // The Vite proxy should make this unnecessary (requests would be same-origin).
            logger.warn(
              `[CORS] Allowing literal null origin in development — ` +
              `page is likely loaded via file:// protocol. ` +
              `Use the Vite dev server URL (http://localhost:5173) instead.`,
              { origin: originLabel(origin), env: config.env },
            );
            return callback(null, true);
          }
          // Production: reject — this is a potential bypass attempt
          logger.warn(
            `[CORS] Rejected literal null origin in production`,
            { origin: originLabel(origin), env: config.env },
          );
          callback(new Error(`CORS origin rejected: null`));
          return;
        }

        // Case 3: Actual origin URL — check against the allowlist
        if (config.cors.allowedOrigins.includes(origin)) {
          return callback(null, true);
        }

        // Unknown origin — reject and log with full detail
        logger.warn(
          `[CORS] Rejected origin: ${originLabel(origin)} — not in allowed list`,
          { origin, allowedOrigins: config.cors.allowedOrigins },
        );
        callback(new Error(`CORS origin rejected: ${origin}`));
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
      maxAge: 86400,
    }),
  );

  // Explicitly handle preflight OPTIONS requests
  router.options('*', cors({
    origin: (origin, callback) => {
      if (origin === undefined || origin === null) return callback(null, true);
      if (origin === 'null') {
        if (config.env === 'development') return callback(null, true);
        callback(new Error('CORS origin rejected: null'));
        return;
      }
      if (config.cors.allowedOrigins.includes(origin)) return callback(null, true);
      logger.warn(`[CORS] Rejected preflight origin: ${originLabel(origin)}`, { origin });
      callback(new Error(`CORS origin rejected: ${origin}`));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    maxAge: 86400,
  }));

  router.use(
    rateLimit({
      windowMs: config.rateLimit.windowMs,
      max: config.rateLimit.max,
      standardHeaders: true,
      legacyHeaders: false,
      message: { status: 'error', message: 'Too many requests, please try again later' },
    }),
  );
};
