/**
 * Admin RBAC tests — prove that:
 * 1. Unauthenticated users cannot access admin endpoints
 * 2. Regular users cannot access admin endpoints
 * 3. Admins can access admin endpoints but not superadmin-only endpoints
 * 4. Superadmins can access everything
 * 5. Audit logs are written for sensitive actions
 */

import type { UserRole } from '../../src/models/User';

// Mock User model
let mockUserRole: UserRole = 'user';
let mockUserActive = true;

jest.mock('../../src/models/User', () => ({
  User: {
    findByPk: jest.fn().mockImplementation(async (id: number) => {
      if (id === 0) return null; // non-existent user
      return {
        id,
        email: `user${id}@test.com`,
        role: mockUserRole,
        is_active: mockUserActive,
      };
    }),
  },
}));

// Mock AuditLog
const mockAuditLogs: any[] = [];
jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: {
    create: jest.fn().mockImplementation(async (data: any) => {
      const log = { id: mockAuditLogs.length + 1, ...data };
      mockAuditLogs.push(log);
      return log;
    }),
    count: jest.fn().mockResolvedValue(0),
    findAll: jest.fn().mockResolvedValue([]),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
  },
}));

// Mock other models used by AdminController
jest.mock('../../src/models/SubscriptionPlan', () => ({
  SubscriptionPlan: {
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, toJSON: () => ({}) }),
  },
}));

jest.mock('../../src/models/Subscription', () => ({
  Subscription: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/PaymentTransaction', () => ({
  PaymentTransaction: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/Exchange', () => ({
  Exchange: {
    findAll: jest.fn().mockResolvedValue([]),
    findByPk: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockResolvedValue({ id: 1, toJSON: () => ({}) }),
  },
}));

jest.mock('../../src/models/Coin', () => ({
  Coin: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, toJSON: () => ({}) }),
  },
}));

jest.mock('../../src/models/Network', () => ({
  Network: {
    findAll: jest.fn().mockResolvedValue([]),
    create: jest.fn().mockResolvedValue({ id: 1, toJSON: () => ({}) }),
  },
}));

jest.mock('../../src/models/OpportunityRecord', () => ({
  OpportunityRecord: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/Alert', () => ({
  Alert: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findByPk: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/Notification', () => ({
  Notification: {
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    findAll: jest.fn().mockResolvedValue([]),
  },
}));

jest.mock('../../src/models/FeatureEntitlement', () => ({
  FeatureEntitlement: {
    findAll: jest.fn().mockResolvedValue([]),
    upsert: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../src/models/ExchangeCoin', () => ({}));
jest.mock('../../src/models/ExchangeMarket', () => ({}));
jest.mock('../../src/models/TradingPair', () => ({}));
jest.mock('../../src/models/PairSymbolMapping', () => ({}));

jest.mock('../../src/config', () => ({
  config: { env: 'test', logging: { level: 'error', dir: './logs' } },
}));

// ── Import after mocks ────────────────────────────────────────────────

import { requireRole, logAuditAction, getAuditContext } from '../../src/middleware/adminGuard';
import { ForbiddenError, UnauthorizedError } from '../../src/utils/errors';

// ── Helper ────────────────────────────────────────────────────────────

function createMocks(userId?: number) {
  const req: any = {
    user: userId !== undefined ? { userId } : undefined,
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test-agent' },
    body: {},
    params: {},
    query: {},
  };
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
  const next = jest.fn();
  return { req, res, next };
}

// ──────────────────────────────────────────────────────────────────────

describe('AdminGuard — RBAC enforcement', () => {
  beforeEach(() => {
    mockUserRole = 'user';
    mockUserActive = true;
    mockAuditLogs.length = 0;
  });

  // ── Unauthenticated access ─────────────────────────────────────────

  describe('Unauthenticated access', () => {
    it('rejects requests without auth token', async () => {
      const { req, res, next } = createMocks(undefined);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  // ── Regular user blocked from admin ────────────────────────────────

  describe('Regular user → admin endpoints', () => {
    it('blocks regular user from admin endpoints', async () => {
      mockUserRole = 'user';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  // ── Admin can access admin endpoints ───────────────────────────────

  describe('Admin → admin endpoints', () => {
    it('allows admin to access admin endpoints', async () => {
      mockUserRole = 'admin';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('attaches role to request', async () => {
      mockUserRole = 'admin';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(req.userRole).toBe('admin');
    });
  });

  // ── Admin blocked from superadmin endpoints ────────────────────────

  describe('Admin → superadmin endpoints', () => {
    it('blocks admin from superadmin-only endpoints', async () => {
      mockUserRole = 'admin';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('superadmin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  // ── Superadmin can access everything ───────────────────────────────

  describe('Superadmin → all endpoints', () => {
    it('allows superadmin to access admin endpoints', async () => {
      mockUserRole = 'superadmin';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('allows superadmin to access superadmin endpoints', async () => {
      mockUserRole = 'superadmin';
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('superadmin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });
  });

  // ── Deactivated user blocked ───────────────────────────────────────

  describe('Deactivated user', () => {
    it('blocks deactivated admin from admin endpoints', async () => {
      mockUserRole = 'admin';
      mockUserActive = false;
      const { req, res, next } = createMocks(1);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  // ── Non-existent user blocked ──────────────────────────────────────

  describe('Non-existent user', () => {
    it('rejects requests for non-existent users', async () => {
      const { req, res, next } = createMocks(0);
      const middleware = requireRole('admin');
      await middleware(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
    });
  });

  // ── Role hierarchy tests ───────────────────────────────────────────

  describe('Role hierarchy', () => {
    it('superadmin has higher role than admin', async () => {
      mockUserRole = 'superadmin';
      const { req, res, next } = createMocks(1);
      await requireRole('admin')(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('admin has higher role than user', async () => {
      mockUserRole = 'admin';
      const { req, res, next } = createMocks(1);
      await requireRole('user')(req, res, next);
      expect(next).toHaveBeenCalledWith();
    });

    it('user does NOT have admin role', async () => {
      mockUserRole = 'user';
      const { req, res, next } = createMocks(1);
      await requireRole('admin')(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(ForbiddenError));
    });
  });

  // ── Audit logging ──────────────────────────────────────────────────

  describe('Audit logging', () => {
    it('logs audit action with correct fields', async () => {
      await logAuditAction({
        actorId: 1,
        actorEmail: 'admin@test.com',
        action: 'user.update',
        resourceType: 'user',
        resourceId: 42,
        changes: { before: { role: 'user' }, after: { role: 'admin' } },
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      });

      expect(mockAuditLogs.length).toBe(1);
      const log = mockAuditLogs[0];
      expect(log.actor_id).toBe(1);
      expect(log.actor_email).toBe('admin@test.com');
      expect(log.action).toBe('user.update');
      expect(log.resource_type).toBe('user');
      expect(log.resource_id).toBe(42);
      expect(log.success).toBe(true);
    });

    it('logs failed action', async () => {
      await logAuditAction({
        actorId: 1,
        actorEmail: 'admin@test.com',
        action: 'user.deactivate',
        resourceType: 'user',
        resourceId: 5,
        success: false,
        errorMessage: 'Cannot deactivate superadmin',
      });

      const log = mockAuditLogs[0];
      expect(log.success).toBe(false);
      expect(log.error_message).toBe('Cannot deactivate superadmin');
    });
  });

  // ── getAuditContext helper ──────────────────────────────────────────

  describe('getAuditContext', () => {
    it('extracts context from request', async () => {
      const { req } = createMocks(1);
      req.auditContext = {
        actorId: 1,
        actorEmail: 'admin@test.com',
        ipAddress: '10.0.0.1',
        userAgent: 'Mozilla/5.0',
      };
      const ctx = getAuditContext(req);
      expect(ctx.actorId).toBe(1);
      expect(ctx.actorEmail).toBe('admin@test.com');
      expect(ctx.ipAddress).toBe('10.0.0.1');
    });

    it('returns defaults for unauthenticated request', async () => {
      const { req } = createMocks(undefined);
      const ctx = getAuditContext(req);
      expect(ctx.actorId).toBe(0);
      expect(ctx.actorEmail).toBe('');
    });
  });
});
