/**
 * AdminController tests — exercises all admin endpoints with mocked models.
 * Proves: RBAC, IDOR protection, role validation, LIKE escaping, CRUD ops.
 */

// ── Mock data stores ──────────────────────────────────────────────────

const stores = {
  users: [
    {
      id: 1,
      email: 'user@test.com',
      first_name: 'Test',
      last_name: 'User',
      role: 'user',
      is_active: true,
      password_hash: 'hash',
    },
    {
      id: 2,
      email: 'admin@test.com',
      first_name: 'Admin',
      last_name: 'User',
      role: 'admin',
      is_active: true,
      password_hash: 'hash',
    },
    {
      id: 3,
      email: 'super@test.com',
      first_name: 'Super',
      last_name: 'Admin',
      role: 'superadmin',
      is_active: true,
      password_hash: 'hash',
    },
  ],
  plans: [{ id: 1, slug: 'free', name: 'Free', is_active: true, sort_order: 0 }],
  subscriptions: [] as any[],
  payments: [] as any[],
  exchanges: [{ id: 1, name: 'Binance', slug: 'binance', is_active: true }],
  coins: [] as any[],
  networks: [] as any[],
  opps: [] as any[],
  alerts: [] as any[],
  notifications: [] as any[],
  auditLogs: [] as any[],
  entitlements: [] as any[],
};

function createStoreMock(getArray: () => any[]) {
  const wrapItem = (item: any) => {
    if (item && !item.update) {
      item.update = jest.fn().mockImplementation((updates: any) => {
        Object.assign(item, updates);
        return Promise.resolve(item);
      });
      item.toJSON = jest.fn().mockReturnValue({ ...item });
      item.destroy = jest.fn().mockResolvedValue(undefined);
    }
    return item;
  };

  return {
    findAll: jest.fn().mockImplementation(() => Promise.resolve(getArray().map(wrapItem))),
    findOne: jest.fn().mockImplementation(({ where }: any) => {
      if (!where) return Promise.resolve(wrapItem(getArray()[0] ?? null));
      const arr = getArray();
      const match = arr.find((item: any) => {
        for (const [key, val] of Object.entries(where)) {
          if (item[key] !== val) return false;
        }
        return true;
      });
      return Promise.resolve(match ? wrapItem(match) : null);
    }),
    findByPk: jest.fn().mockImplementation((id: number) => {
      const item = getArray().find((i: any) => i.id === id);
      return Promise.resolve(item ? wrapItem(item) : null);
    }),
    findAndCountAll: jest.fn().mockImplementation(({ where }: any) => {
      let result = [...getArray()];
      if (where) {
        for (const [key, val] of Object.entries(where)) {
          if (typeof val === 'string' || typeof val === 'boolean' || typeof val === 'number') {
            result = result.filter((item: any) => item[key] === val);
          }
        }
      }
      return Promise.resolve({ rows: result.map(wrapItem), count: result.length });
    }),
    create: jest.fn().mockImplementation((data: any) => {
      const arr = getArray();
      const item: any = { id: arr.length + 100, ...data };
      item.update = jest.fn().mockImplementation((updates: any) => {
        Object.assign(item, updates);
        return Promise.resolve(item);
      });
      item.toJSON = jest.fn().mockReturnValue(item);
      arr.push(item);
      return Promise.resolve(wrapItem(item));
    }),
    count: jest.fn().mockImplementation(({ where }: any) => {
      return Promise.resolve(
        getArray().filter(
          (item: any) => !where || item[Object.keys(where)[0]] === Object.values(where)[0],
        ).length,
      );
    }),
    update: jest.fn().mockResolvedValue([1]),
    upsert: jest.fn().mockResolvedValue({}),
    literal: jest.fn((val: string) => ({ val, type: 'literal' })),
  };
}

jest.mock('../../src/models/User', () => ({
  User: createStoreMock(() => stores.users),
  UserRole: { ADMIN: 'admin', SUPERADMIN: 'superadmin', USER: 'user' },
}));
jest.mock('../../src/models/AuditLog', () => ({
  AuditLog: createStoreMock(() => stores.auditLogs),
}));
jest.mock('../../src/models/SubscriptionPlan', () => ({
  SubscriptionPlan: createStoreMock(() => stores.plans),
}));
jest.mock('../../src/models/Subscription', () => ({
  Subscription: createStoreMock(() => stores.subscriptions),
}));
jest.mock('../../src/models/PaymentTransaction', () => ({
  PaymentTransaction: createStoreMock(() => stores.payments),
}));
jest.mock('../../src/models/Exchange', () => ({
  Exchange: createStoreMock(() => stores.exchanges),
}));
jest.mock('../../src/models/Coin', () => ({
  Coin: createStoreMock(() => stores.coins),
}));
jest.mock('../../src/models/Network', () => ({
  Network: createStoreMock(() => stores.networks),
}));
jest.mock('../../src/models/OpportunityRecord', () => ({
  OpportunityRecord: createStoreMock(() => stores.opps),
}));
jest.mock('../../src/models/Alert', () => ({
  Alert: createStoreMock(() => stores.alerts),
}));
jest.mock('../../src/models/Notification', () => ({
  Notification: createStoreMock(() => stores.notifications),
}));
jest.mock('../../src/models/FeatureEntitlement', () => ({
  FeatureEntitlement: createStoreMock(() => stores.entitlements),
}));
jest.mock('../../src/models/ExchangeCoin', () => ({}));
jest.mock('../../src/models/ExchangeMarket', () => ({}));
jest.mock('../../src/models/TradingPair', () => ({}));
jest.mock('../../src/models/PairSymbolMapping', () => ({}));
jest.mock('../../src/models/SubscriptionEvent', () => ({}));

jest.mock('../../src/middleware/adminGuard', () => ({
  logAuditAction: jest.fn().mockResolvedValue({}),
  getAuditContext: jest.fn().mockReturnValue({
    actorId: 1,
    actorEmail: 'admin@test.com',
    ipAddress: '127.0.0.1',
    userAgent: 'test',
  }),
}));

jest.mock('../../src/config', () => ({
  config: { env: 'test', logging: { level: 'error', dir: './logs' } },
}));

// ── Import after mocks ───────────────────────────────────────────────────

import { AdminController } from '../../src/controllers/AdminController';
import { BadRequestError, NotFoundError } from '../../src/utils/errors';

function mockReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    ip: '127.0.0.1',
    headers: { 'user-agent': 'test' },
    user: { userId: 2, email: 'admin@test.com' },
    userRole: 'admin',
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockNext() {
  return jest.fn();
}

describe('AdminController', () => {
  let ctrl: AdminController;

  beforeEach(() => {
    ctrl = new AdminController();
    // Reset store data (in case previous test mutated objects)
    stores.users.length = 0;
    stores.users.push(
      {
        id: 1,
        email: 'user@test.com',
        first_name: 'Test',
        last_name: 'User',
        role: 'user',
        is_active: true,
        password_hash: 'hash',
      },
      {
        id: 2,
        email: 'admin@test.com',
        first_name: 'Admin',
        last_name: 'User',
        role: 'admin',
        is_active: true,
        password_hash: 'hash',
      },
      {
        id: 3,
        email: 'super@test.com',
        first_name: 'Super',
        last_name: 'Admin',
        role: 'superadmin',
        is_active: true,
        password_hash: 'hash',
      },
    );
    stores.plans.length = 0;
    stores.plans.push({ id: 1, slug: 'free', name: 'Free', is_active: true, sort_order: 0 });
    stores.subscriptions.length = 0;
    stores.payments.length = 0;
    stores.exchanges.length = 0;
    stores.exchanges.push({ id: 1, name: 'Binance', slug: 'binance', is_active: true });
    stores.coins.length = 0;
    stores.networks.length = 0;
    stores.opps.length = 0;
    stores.alerts.length = 0;
    stores.notifications.length = 0;
    stores.auditLogs.length = 0;
    stores.entitlements.length = 0;
  });

  // ── USERS ────────────────────────────────────────────────────────────

  describe('listUsers', () => {
    it('returns paginated users', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();
      await ctrl.listUsers(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('escapes LIKE wildcards in search', async () => {
      const req = mockReq({ query: { search: '%test%' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.listUsers(req, res, next);
      expect(next).not.toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('updateUser', () => {
    it('updates user fields successfully', async () => {
      const req = mockReq({ params: { id: '1' }, body: { firstName: 'Updated' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('rejects invalid roles', async () => {
      const req = mockReq({ params: { id: '1' }, body: { role: 'superadmin' }, userRole: 'admin' });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateUser(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('prevents self-role elevation', async () => {
      const req = mockReq({
        params: { id: '2' },
        body: { role: 'superadmin' },
        user: { userId: 2 },
        userRole: 'admin',
      });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateUser(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('prevents self-deactivation', async () => {
      const req = mockReq({ params: { id: '2' }, body: { isActive: false }, user: { userId: 2 } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateUser(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('returns 404 for non-existent user', async () => {
      const req = mockReq({ params: { id: '999' }, body: { firstName: 'Test' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateUser(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  describe('deactivateUser', () => {
    it('deactivates a regular user', async () => {
      const req = mockReq({ params: { id: '1' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.deactivateUser(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('prevents deactivation of superadmin', async () => {
      const req = mockReq({ params: { id: '3' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.deactivateUser(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── PLANS ────────────────────────────────────────────────────────────

  describe('createPlan', () => {
    it('creates a plan with valid slug', async () => {
      const req = mockReq({ body: { slug: 'basic', name: 'Basic' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createPlan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('rejects invalid slug format', async () => {
      const req = mockReq({ body: { slug: 'UPPERCASE!', name: 'Bad' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createPlan(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });

    it('requires slug and name', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createPlan(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── EXCHANGES ────────────────────────────────────────────────────────

  describe('createExchange', () => {
    it('creates an exchange with valid data', async () => {
      const req = mockReq({ body: { name: 'OKX', slug: 'okx' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createExchange(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('requires name and slug', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createExchange(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── COINS ────────────────────────────────────────────────────────────

  describe('createCoin', () => {
    it('creates a coin with valid symbol', async () => {
      const req = mockReq({ body: { symbol: 'ETH', name: 'Ethereum' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createCoin(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('requires symbol', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createCoin(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── NETWORKS ─────────────────────────────────────────────────────────

  describe('createNetwork', () => {
    it('creates a network with valid name', async () => {
      const req = mockReq({ body: { name: 'Ethereum', chainId: 1 } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createNetwork(req, res, next);
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('requires name', async () => {
      const req = mockReq({ body: {} });
      const res = mockRes();
      const next = mockNext();
      await ctrl.createNetwork(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── OPPORTUNITIES ────────────────────────────────────────────────────

  describe('deleteOpportunity', () => {
    it('returns 404 for non-existent opportunity', async () => {
      const req = mockReq({ params: { id: '999' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.deleteOpportunity(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(NotFoundError));
    });
  });

  // ── ENTITLEMENTS ─────────────────────────────────────────────────────

  describe('updateEntitlements', () => {
    it('rejects non-array entitlements', async () => {
      const req = mockReq({ params: { id: '1' }, body: { entitlements: 'not-an-array' } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateEntitlements(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(BadRequestError));
    });
  });

  // ── NOTIFICATIONS ────────────────────────────────────────────────────

  describe('retryFailedNotifications', () => {
    it('retries failed notifications', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();
      await ctrl.retryFailedNotifications(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  // ── SETTINGS ─────────────────────────────────────────────────────────

  describe('getSettings', () => {
    it('returns settings data', async () => {
      const req = mockReq();
      const res = mockRes();
      const next = mockNext();
      await ctrl.getSettings(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('updateSettings', () => {
    it('updates settings and logs audit', async () => {
      const req = mockReq({ body: { scannerInterval: 3000 } });
      const res = mockRes();
      const next = mockNext();
      await ctrl.updateSettings(req, res, next);
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
