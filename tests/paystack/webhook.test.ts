/**
 * Paystack webhook signature verification tests.
 * Proves:
 * 1. Fail-closed when webhook secret is not configured
 * 2. Rejects missing signature header
 * 3. Rejects invalid signatures
 * 4. Accepts valid signatures with timing-safe comparison
 * 5. Handles malformed hex in signature
 * 6. parseWebhookEvent handles invalid JSON
 */

import crypto from 'crypto';

// We need to test the actual PaystackService.verifyWebhookSignature
// but we need to control config.paystack.webhookSecret

let webhookSecret = 'whsec_test_secret_key_for_testing';

jest.mock('../../src/config', () => ({
  config: {
    env: 'test',
    paystack: {
      get webhookSecret() {
        return webhookSecret;
      },
      secretKey: 'sk_test',
      publicKey: 'pk_test',
      baseUrl: 'https://api.paystack.co',
      defaultCurrency: 'NGN',
      callbackUrl: 'http://localhost:3000/callback',
    },
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

import { PaystackService } from '../../src/services/PaystackService';

describe('PaystackService — Webhook signature verification', () => {
  let service: PaystackService;

  beforeEach(() => {
    service = new PaystackService();
    webhookSecret = 'whsec_test_secret_key_for_testing';
  });

  describe('verifyWebhookSignature', () => {
    it('fails closed when no webhook secret is configured', () => {
      webhookSecret = '';
      const payload = '{"event":"charge.success","data":{}}';
      const result = service.verifyWebhookSignature(payload, 'any_signature');
      expect(result).toBe(false);
    });

    it('rejects empty signature', () => {
      const payload = '{"event":"charge.success","data":{}}';
      const result = service.verifyWebhookSignature(payload, '');
      expect(result).toBe(false);
    });

    it('rejects invalid signature', () => {
      const payload = '{"event":"charge.success","data":{}}';
      const result = service.verifyWebhookSignature(payload, 'invalid_signature_hex');
      expect(result).toBe(false);
    });

    it('accepts valid signature', () => {
      const payload = '{"event":"charge.success","data":{"reference":"al_1_test"}}';
      const expectedHash = crypto.createHmac('sha512', webhookSecret).update(payload).digest('hex');

      const result = service.verifyWebhookSignature(payload, expectedHash);
      expect(result).toBe(true);
    });

    it('rejects signature computed with wrong secret', () => {
      const payload = '{"event":"charge.success","data":{}}';
      const wrongHash = crypto
        .createHmac('sha512', 'wrong_secret_key')
        .update(payload)
        .digest('hex');

      const result = service.verifyWebhookSignature(payload, wrongHash);
      expect(result).toBe(false);
    });

    it('handles non-hex signature gracefully (no crash)', () => {
      const payload = '{"event":"test"}';
      // Non-hex string will cause timingSafeEqual to fail
      const result = service.verifyWebhookSignature(payload, 'not_valid_hex_at_all!!!');
      expect(result).toBe(false);
    });
  });

  describe('parseWebhookEvent', () => {
    it('parses valid JSON', () => {
      const body = '{"event":"charge.success","data":{"ref":"al_1"}}';
      const result = service.parseWebhookEvent(body);
      expect(result).not.toBeNull();
      expect(result!.event).toBe('charge.success');
    });

    it('returns null for invalid JSON', () => {
      const result = service.parseWebhookEvent('{invalid json}');
      expect(result).toBeNull();
    });
  });

  describe('generateReference', () => {
    it('generates unique references', () => {
      const ref1 = service.generateReference(1);
      const ref2 = service.generateReference(1);
      expect(ref1).not.toBe(ref2);
      expect(ref1).toMatch(/^al_1_/);
    });

    it('includes user id in reference', () => {
      const ref = service.generateReference(42);
      expect(ref).toMatch(/^al_42_/);
    });
  });

  describe('toSmallestUnit / fromSmallestUnit', () => {
    it('converts correctly', () => {
      expect(service.toSmallestUnit(100)).toBe(10000);
      expect(service.fromSmallestUnit(10000)).toBe(100);
      expect(service.toSmallestUnit(0.01)).toBe(1);
      expect(service.fromSmallestUnit(1)).toBe(0.01);
    });
  });
});
