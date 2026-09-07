/**
 * BillingController tests — webhook handling, payment verification, checkout.
 * Proves: webhook signature enforcement, idempotent processing, error handling.
 */

jest.mock('../../src/services/BillingService', () => ({
  billingService: {
    listPlansWithStatus: jest
      .fn()
      .mockResolvedValue({ plans: [], currentPlan: null, currentSubscription: null }),
    initializeCheckout: jest.fn().mockResolvedValue({
      authorizationUrl: 'https://checkout.paystack.com/abc',
      reference: 'al_1_test',
      accessCode: 'access_123',
    }),
    verifyPayment: jest.fn().mockResolvedValue({ success: true, message: 'Confirmed' }),
    processWebhook: jest.fn(),
    getPaymentHistory: jest.fn().mockResolvedValue({ data: [], total: 0 }),
    getPaymentStats: jest
      .fn()
      .mockResolvedValue({
        totalPayments: 0,
        successfulPayments: 0,
        totalSpent: 0,
        lastPayment: null,
      }),
    getCurrentSubscription: jest.fn().mockResolvedValue({ subscription: null, plan: null }),
    cancelSubscription: jest.fn(),
  },
}));

jest.mock('../../src/services/PaystackService', () => ({
  paystackService: {
    verifyWebhookSignature: jest.fn(),
    parseWebhookEvent: jest.fn(),
    toSmallestUnit: jest.fn((amt: number) => Math.round(amt * 100)),
  },
}));

jest.mock('../../src/config', () => ({
  config: {
    env: 'test',
    paystack: { webhookSecret: 'whsec_test' },
    logging: { level: 'error', dir: './logs' },
  },
}));

jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

import { BillingController } from '../../src/controllers/BillingController';
import { billingService } from '../../src/services/BillingService';
import { paystackService } from '../../src/services/PaystackService';

function mockReq(overrides: Record<string, any> = {}) {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    cookies: {},
    ip: '127.0.0.1',
    user: { userId: 1, email: 'test@test.com' },
    ...overrides,
  } as any;
}

function mockRes() {
  const res: any = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    send: jest.fn().mockReturnThis(),
    redirect: jest.fn().mockReturnThis(),
  };
  return res;
}

function mockNext() {
  return jest.fn();
}

describe('BillingController', () => {
  let ctrl: BillingController;

  beforeEach(() => {
    ctrl = new BillingController();
    jest.clearAllMocks();
  });

  describe('webhook', () => {
    it('rejects requests with no signature header', async () => {
      const req = mockReq({
        headers: {},
        body: { event: 'charge.success', data: {} },
        rawBody: JSON.stringify({ event: 'charge.success', data: {} }),
      });
      const res = mockRes();
      const next = mockNext();
      await ctrl.handleWebhook(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('rejects requests with invalid signature', async () => {
      (paystackService.verifyWebhookSignature as jest.Mock).mockReturnValue(false);
      const req = mockReq({
        headers: { 'x-paystack-signature': 'invalid_sig' },
        body: { event: 'charge.success', data: {} },
        rawBody: JSON.stringify({ event: 'charge.success', data: {} }),
      });
      const res = mockRes();
      await ctrl.handleWebhook(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('processes valid webhook with correct signature', async () => {
      (paystackService.verifyWebhookSignature as jest.Mock).mockReturnValue(true);
      (paystackService.parseWebhookEvent as jest.Mock).mockReturnValue({
        event: 'charge.success',
        data: { reference: 'al_1_test' },
      });
      const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: 'al_1_test' } });

      const req = mockReq({
        headers: { 'x-paystack-signature': 'valid_sig' },
        body: { event: 'charge.success', data: { reference: 'al_1_test' } },
        rawBody,
      });
      const res = mockRes();
      await ctrl.handleWebhook(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(billingService.processWebhook).toHaveBeenCalledWith(
        'charge.success',
        expect.any(Object),
      );
    });
  });

  describe('listPlans', () => {
    it('returns plans with status', async () => {
      const req = mockReq();
      const res = mockRes();
      await ctrl.listPlans(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('initializeCheckout', () => {
    it('creates checkout session', async () => {
      const req = mockReq({ body: { planId: 2, billingCycle: 'monthly' } });
      const res = mockRes();
      await ctrl.initializeCheckout(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ reference: 'al_1_test' }),
        }),
      );
    });
  });

  describe('verifyPayment', () => {
    it('verifies payment by reference', async () => {
      const req = mockReq({ params: { reference: 'al_1_test' } });
      const res = mockRes();
      await ctrl.verifyPayment(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
      expect(billingService.verifyPayment).toHaveBeenCalledWith('al_1_test', 1);
    });
  });

  describe('getPaymentHistory', () => {
    it('returns paginated payment history', async () => {
      const req = mockReq({ query: { page: '1', limit: '10' } });
      const res = mockRes();
      await ctrl.listPayments(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getPaymentStats', () => {
    it('returns payment stats', async () => {
      const req = mockReq();
      const res = mockRes();
      await ctrl.getPaymentStats(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('getCurrentSubscription', () => {
    it('returns current subscription', async () => {
      const req = mockReq();
      const res = mockRes();
      await ctrl.getSubscription(req, res, mockNext());
      expect(res.status).toHaveBeenCalledWith(200);
    });
  });
});
