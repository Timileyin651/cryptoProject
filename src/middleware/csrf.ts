import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

// In-memory store for CSRF tokens (per session, short-lived).
// In production, use Redis or a signed cookie approach.
const csrfTokens = new Map<string, { token: string; expiresAt: number }>();

const CSRF_TOKEN_TTL = 30 * 60 * 1000; // 30 minutes

/**
 * Generate a CSRF token for the current session.
 * The token is tied to the user's IP + User-Agent fingerprint.
 */
export function generateCsrfToken(req: Request): string {
  const fingerprint = `${req.ip}:${req.headers['user-agent'] || ''}`;
  const token = crypto.randomBytes(32).toString('hex');
  csrfTokens.set(fingerprint, { token, expiresAt: Date.now() + CSRF_TOKEN_TTL });
  return token;
}

/**
 * Middleware that generates a CSRF token and attaches it to res.locals
 * so API clients can retrieve it via a preceding GET request.
 */
export function csrfGenerate(req: Request, res: Response, next: NextFunction): void {
  const token = generateCsrfToken(req);
  res.locals.csrfToken = token;
  next();
}

/**
 * Middleware that validates the CSRF token on state-changing requests.
 * Expects the token in X-CSRF-Token header or _csrf body field.
 */
export function csrfValidate(req: Request, res: Response, next: NextFunction): void {
  // Only validate on state-changing methods
  const method = req.method.toUpperCase();
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    next();
    return;
  }

  const fingerprint = `${req.ip}:${req.headers['user-agent'] || ''}`;
  const stored = csrfTokens.get(fingerprint);

  if (!stored) {
    res.status(403).json({ error: 'CSRF token missing — refresh the page' });
    return;
  }

  if (Date.now() > stored.expiresAt) {
    csrfTokens.delete(fingerprint);
    res.status(403).json({ error: 'CSRF token expired — refresh the page' });
    return;
  }

  // Check token from header or body
  const submittedToken =
    (req.headers['x-csrf-token'] as string | undefined) || (req.body?._csrf as string | undefined);

  if (!submittedToken || submittedToken !== stored.token) {
    res.status(403).json({ error: 'Invalid CSRF token' });
    return;
  }

  // Token is valid — consume it (one-time use)
  csrfTokens.delete(fingerprint);
  next();
}

/**
 * Cleanup expired tokens periodically.
 */
if (process.env.NODE_ENV !== 'test') {
  setInterval(() => {
    const now = Date.now();
    for (const [key, value] of csrfTokens.entries()) {
      if (now > value.expiresAt) {
        csrfTokens.delete(key);
      }
    }
  }, 60 * 1000);
}
