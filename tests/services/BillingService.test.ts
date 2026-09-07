import { BillingService } from '../../src/services/BillingService';

// Mock PaystackService
jest.mock('../../src/services/PaystackService', () => ({
  paystackService: {
    initializeTransaction: jest.fn().mockResolvedValue({
      status: true,
      message: 'Authorization URL created',
      data: {
        authorization_url: 'https://checkout.paystack.com/abc123',
        access_code: 'access_code_123',
        reference: 'al_1_test_ref',
      },
    }),
    verifyTransaction: jest.fn().mockResolvedValue({
      status: true,
      message: 'Verification successful',
      data: {
        id: 12345,
        status: 'success',
        reference: 'al_1_test_ref',
        amount: 50000,
        gateway_response: 'Successful',
        channel: 'card',
        paid_at: '2024-01-01T00:00:00Z',
        authorization: {
          card_type: 'visa',
          last4: '4242',
        },
        customer: {
          customer_code: 'CUS_test123',
        },
      },
    }),
    generateReference: jest.fn().mockReturnValue('al_1_test_ref'),
    toSmallestUnit: jest.fn((amount: number) => Math.round(amount * 100)),
  },
}));

// Mock SubscriptionService
jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    getActiveSubscription: jest.fn().mockResolvedValue(null),
    cancelSubscription: jest.fn().mockResolvedValue({ id: 1, status: 'cancelled' }),
    logEvent: jest.fn().mockResolvedValue({}),
  },
}));

// Mock models
const mockPlans: any[] = [
  {
    id: 1,
    slug: 'free',
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    currency: 'NGN',
    is_active: true,
    sort_order: 0,
    max_scans_per_day: 10,
    max_alerts: 1,
    max_portfolios: 0,
  },
  {
    id: 2,
    slug: 'basic',
    name: 'Basic',
    price_monthly: 5000,
    price_yearly: 48000,
    currency: 'NGN',
    is_active: true,
    sort_order: 1,
    max_scans_per_day: 100,
    max_alerts: 10,
    max_portfolios: 3,
  },
  {
    id: 3,
    slug: 'pro',
    name: 'Pro',
    price_monthly: 15000,
    price_yearly: 144000,
    currency: 'NGN',
    is_active: true,
    sort_order: 2,
    max_scans_per_day: 500,
    max_alerts: 50,
    max_portfolios: 10,
  },
];

const mockTransactions: any[] = [];
const mockSubscriptions: any[] = [];
let nextTxId = 1;
let nextSubId = 1;

jest.mock('../../src/models/SubscriptionPlan', () => ({
  SubscriptionPlan: {
    findByPk: jest
      .fn()
      .mockImplementation((id: number) =>
        Promise.resolve(mockPlans.find((p) => p.id === id) ?? null),
      ),
    findAll: jest.fn().mockImplementation(() => Promise.resolve(mockPlans)),
  },
}));

jest.mock('../../src/models/PaymentTransaction', () => {
  const Op = require('sequelize').Op;
  return {
    PaymentTransaction: {
      create: jest.fn().mockImplementation((data: any) => {
        const tx = { id: nextTxId++, ...data };
        tx.update = jest.fn().mockImplementation((updates: any) => {
          Object.assign(tx, updates);
          return Promise.resolve(tx);
        });
        mockTransactions.push(tx);
        return Promise.resolve(tx);
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const match = mockTransactions.find((t) => {
          if (where.paystack_reference && t.paystack_reference !== where.paystack_reference)
            return false;
          if (where.user_id !== undefined && t.user_id !== where.user_id) return false;
          if (where.id !== undefined && t.id !== where.id) return false;
          if (where.status && t.status !== where.status) return false;
          return true;
        });
        return Promise.resolve(match ?? null);
      }),
      findAndCountAll: jest.fn().mockImplementation(({ where }: any) => {
        const filtered = mockTransactions.filter((t) => {
          if (where?.user_id !== undefined) return t.user_id === where.user_id;
          return true;
        });
        return Promise.resolve({ rows: filtered, count: filtered.length });
      }),
      count: jest.fn().mockImplementation(({ where }: any) => {
        return Promise.resolve(
          mockTransactions.filter((t) => {
            if (where?.user_id !== undefined && t.user_id !== where.user_id) return false;
            if (where?.status && t.status !== where.status) return false;
            return true;
          }).length,
        );
      }),
      sum: jest.fn().mockImplementation((_col: string, { where }: any) => {
        const total = mockTransactions
          .filter((t) => t.user_id === where.user_id && t.status === where.status)
          .reduce((sum, t) => sum + (t.amount || 0), 0);
        return Promise.resolve(total || 0);
      }),
      update: jest.fn().mockResolvedValue([1]),
    },
  };
});

jest.mock('../../src/models/Subscription', () => {
  const Op = require('sequelize').Op;
  return {
    Subscription: {
      create: jest.fn().mockImplementation((data: any) => {
        const sub = { id: nextSubId++, ...data };
        sub.update = jest.fn().mockImplementation((updates: any) => {
          Object.assign(sub, updates);
          return Promise.resolve(sub);
        });
        mockSubscriptions.push(sub);
        return Promise.resolve(sub);
      }),
      findOne: jest.fn().mockImplementation(({ where }: any) => {
        const match = mockSubscriptions.find((s) => {
          if (where.user_id !== undefined && s.user_id !== where.user_id) return false;
          if (where.plan_id !== undefined && s.plan_id !== where.plan_id) return false;
          if (
            where.gateway_subscription_id &&
            s.gateway_subscription_id !== where.gateway_subscription_id
          )
            return false;
          if (where.status) {
            const statuses = Array.isArray(where.status[Op?.in])
              ? where.status[Op.in]
              : [where.status];
            if (!statuses.includes(s.status)) return false;
          }
          return true;
        });
        return Promise.resolve(match ?? null);
      }),
      findByPk: jest
        .fn()
        .mockImplementation((id: number) =>
          Promise.resolve(mockSubscriptions.find((s) => s.id === id) ?? null),
        ),
    },
  };
});

jest.mock('../../src/models/User', () => ({ User: {} }));
jest.mock('../../src/models/SubscriptionEvent', () => ({ SubscriptionEvent: {} }));
jest.mock('../../src/config', () => ({
  config: {
    env: 'test',
    logging: { level: 'error', dir: './logs' },
    paystack: {
      secretKey: 'test_secret',
      publicKey: 'test_public',
      webhookSecret: 'test_webhook_secret',
      baseUrl: 'https://api.paystack.co',
      defaultCurrency: 'NGN',
      callbackUrl: 'http://localhost:3000/billing/checkout-result',
    },
  },
}));

describe('BillingService', () => {
  let service: BillingService;

  beforeEach(() => {
    service = new BillingService();
    mockTransactions.length = 0;
    mockSubscriptions.length = 0;
    nextTxId = 1;
    nextSubId = 1;
  });

  describe('listPlansWithStatus', () => {
    it('returns plans with no current subscription', async () => {
      const result = await service.listPlansWithStatus(1);
      expect(result.plans.length).toBe(3);
      expect(result.currentPlan).toBeNull();
      expect(result.currentSubscription).toBeNull();
    });
  });

  describe('initializeCheckout', () => {
    it('creates a checkout session for a valid plan', async () => {
      const result = await service.initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });
      expect(result.authorizationUrl).toContain('paystack.com');
      expect(result.reference).toBe('al_1_test_ref');
      expect(result.accessCode).toBe('access_code_123');
    });

    it('rejects free plan', async () => {
      await expect(
        service.initializeCheckout({
          userId: 1,
          planId: 1,
          billingCycle: 'monthly',
          email: 'test@example.com',
        }),
      ).rejects.toThrow('Free plan does not require payment');
    });

    it('rejects non-existent plan', async () => {
      await expect(
        service.initializeCheckout({
          userId: 1,
          planId: 999,
          billingCycle: 'monthly',
          email: 'test@example.com',
        }),
      ).rejects.toThrow('not found');
    });

    it('creates a pending transaction record', async () => {
      await service.initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });
      expect(mockTransactions.length).toBe(1);
      expect(mockTransactions[0].status).toBe('initialized');
      expect(mockTransactions[0].user_id).toBe(1);
      expect(mockTransactions[0].plan_id).toBe(3);
    });
  });

  describe('verifyPayment', () => {
    it('returns success for an already-confirmed payment', async () => {
      // Pre-create a confirmed transaction
      const tx = await (service as any).initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });
      mockTransactions[0].status = 'success';

      const result = await service.verifyPayment('al_1_test_ref', 1);
      expect(result.success).toBe(true);
    });

    it('verifies a pending payment with Paystack', async () => {
      await service.initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });

      const result = await service.verifyPayment('al_1_test_ref', 1);
      expect(result.success).toBe(true);
      expect(result.message).toBe('Payment confirmed');
    });

    it('activates subscription after successful verification', async () => {
      await service.initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });

      const result = await service.verifyPayment('al_1_test_ref', 1);
      expect(result.subscription).toBeDefined();
      expect(result.subscription!.status).toBe('active');
    });

    it('throws for non-existent transaction', async () => {
      await expect(service.verifyPayment('nonexistent_ref', 1)).rejects.toThrow('not found');
    });
  });

  describe('getPaymentHistory', () => {
    it('returns empty history for new user', async () => {
      const result = await service.getPaymentHistory(1);
      expect(result.data.length).toBe(0);
      expect(result.total).toBe(0);
    });

    it('returns paginated results', async () => {
      // Create some transactions
      await service.initializeCheckout({
        userId: 1,
        planId: 3,
        billingCycle: 'monthly',
        email: 'test@example.com',
      });
      await service.initializeCheckout({
        userId: 1,
        planId: 2,
        billingCycle: 'yearly',
        email: 'test@example.com',
      });

      const result = await service.getPaymentHistory(1, { page: 1, limit: 10 });
      expect(result.data.length).toBe(2);
      expect(result.total).toBe(2);
    });
  });

  describe('getPaymentStats', () => {
    it('returns zero stats for new user', async () => {
      const stats = await service.getPaymentStats(1);
      expect(stats.totalPayments).toBe(0);
      expect(stats.successfulPayments).toBe(0);
      expect(stats.totalSpent).toBe(0);
      expect(stats.lastPayment).toBeNull();
    });
  });

  describe('getCurrentSubscription', () => {
    it('returns null when no active subscription', async () => {
      const result = await service.getCurrentSubscription(1);
      expect(result.subscription).toBeNull();
      expect(result.plan).toBeNull();
    });
  });
});
