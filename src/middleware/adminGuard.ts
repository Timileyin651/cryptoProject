import { Request, Response, NextFunction } from 'express';
import { AuditLog, AuditAction } from '../models/AuditLog';
import { User, UserRole } from '../models/User';
import { ForbiddenError, UnauthorizedError } from '../utils/errors';
import { logger } from '../utils/logger';

// ──────────────────── Role hierarchy ──────────────────────────────────

/**
 * Role hierarchy: superadmin > admin > user
 * Each role inherits permissions from roles below it.
 */
const ROLE_HIERARCHY: Record<UserRole, number> = {
  user: 0,
  admin: 1,
  superadmin: 2,
};

function hasRole(userRole: UserRole, requiredRole: UserRole): boolean {
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

// ──────────────────── Admin middleware ─────────────────────────────────

/**
 * Middleware factory that requires a minimum role level.
 *
 * Usage:
 *   router.delete('/users/:id', authenticate, requireRole('admin'), handler);
 *   router.post('/plans', authenticate, requireRole('superadmin'), handler);
 */
export function requireRole(minRole: UserRole = 'admin') {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        next(new UnauthorizedError('Authentication required'));
        return;
      }

      // Fetch user from DB to get role (JWT doesn't carry role to avoid stale data)
      const user = await User.findByPk(userId);
      if (!user) {
        next(new UnauthorizedError('User not found'));
        return;
      }

      if (!user.is_active) {
        next(new ForbiddenError('Account is deactivated'));
        return;
      }

      if (!hasRole(user.role, minRole)) {
        next(
          new ForbiddenError(
            `This action requires ${minRole} role or higher. Your role: ${user.role}`,
          ),
        );
        return;
      }

      // Attach role info for downstream handlers
      (req as any).userRole = user.role;
      (req as any).userEmail = user.email;
      next();
    } catch (error) {
      next(error);
    }
  };
}

// ──────────────────── Audit logging ───────────────────────────────────

/**
 * Audit log entry context — passed to logAuditAction.
 */
export interface AuditContext {
  actorId: number;
  actorEmail: string;
  action: AuditAction;
  resourceType: string;
  resourceId?: number | null;
  changes?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  success?: boolean;
  errorMessage?: string | null;
}

/**
 * Log an admin action to the audit_logs table.
 * Always called after the action completes (success or failure).
 */
export async function logAuditAction(ctx: AuditContext): Promise<void> {
  try {
    await AuditLog.create({
      actor_id: ctx.actorId,
      actor_email: ctx.actorEmail,
      action: ctx.action,
      resource_type: ctx.resourceType,
      resource_id: ctx.resourceId ?? null,
      changes: ctx.changes ?? null,
      ip_address: ctx.ipAddress ?? null,
      user_agent: ctx.userAgent ?? null,
      success: ctx.success !== false,
      error_message: ctx.errorMessage ?? null,
    });
  } catch (error) {
    // Audit logging should never crash the request
    logger.error('[AuditLog] Failed to write audit log', {
      action: ctx.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/**
 * Middleware that attaches audit context helpers to the request.
 * Run AFTER authenticate and requireRole.
 */
export function attachAuditContext(req: Request, _res: Response, next: NextFunction): void {
  const auditCtx = {
    actorId: req.user?.userId ?? 0,
    actorEmail: (req as any).userEmail ?? '',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'] ?? null,
  };

  (req as any).auditContext = auditCtx;
  next();
}

/**
 * Convenience: extract audit context from request.
 */
export function getAuditContext(req: Request): {
  actorId: number;
  actorEmail: string;
  ipAddress: string | null;
  userAgent: string | null;
} {
  return (
    (req as any).auditContext ?? {
      actorId: req.user?.userId ?? 0,
      actorEmail: '',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? null,
    }
  );
}
