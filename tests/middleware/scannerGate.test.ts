/**
 * scannerGate middleware tests — proves that unauthenticated users
 * are restricted to free-tier scanner limits and advanced filters are stripped.
 */

jest.mock('../../src/services/ScannerFilterService', () => ({
  scannerFilterService: {
    enforceLimits: jest.fn().mockResolvedValue({
      sanitized: { minSpread: 0.01, maxSpread: 0.1, limit: 25 },
      restrictions: [],
    }),
  },
  FILTER_FEATURE_MAP: {
    minSpread: 'scanner.advanced_filters',
    maxSpread: 'scanner.advanced_filters',
    minProfit: 'scanner.advanced_filters',
    network: 'scanner.advanced_filters',
  },
}));

import { enforceScannerLimits, attachScannerRestrictions } from '../../src/middleware/scannerGate';

function createMocks(userId?: number, query: Record<string, any> = {}) {
  const req: any = {
    user: userId !== undefined ? { userId } : undefined,
    query,
  };
  const res: any = { json: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return { req, res, next };
}

describe('scannerGate middleware', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('unauthenticated users', () => {
    it('allows basic queries through', async () => {
      const { req, res, next } = createMocks(undefined, { page: '1' });
      await enforceScannerLimits(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('strips advanced filter params for unauthenticated users', async () => {
      const { req, res, next } = createMocks(undefined, {
        minSpread: '0.01',
        maxSpread: '0.1',
        network: 'ETH',
        page: '1',
      });
      await enforceScannerLimits(req, res, next);
      expect(req.query.minSpread).toBeUndefined();
      expect(req.query.maxSpread).toBeUndefined();
      expect(req.query.network).toBeUndefined();
      expect(next).toHaveBeenCalled();
    });

    it('clamps page size for unauthenticated users', async () => {
      const { req, res, next } = createMocks(undefined, { limit: '100' });
      await enforceScannerLimits(req, res, next);
      expect(Number(req.query.limit)).toBeLessThanOrEqual(25);
    });

    it('attaches restriction info to request', async () => {
      const { req, res, next } = createMocks(undefined, { minSpread: '0.01' });
      await enforceScannerLimits(req, res, next);
      expect(req._scannerRestrictions).toBeDefined();
      expect(req._scannerRestrictions.length).toBeGreaterThan(0);
    });
  });

  describe('authenticated users', () => {
    it('passes through with plan-based limits', async () => {
      const { req, res, next } = createMocks(1, { minSpread: '0.01', limit: '25' });
      await enforceScannerLimits(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('attachScannerRestrictions', () => {
    it('adds restrictions to JSON response when present', () => {
      const jsonFn = jest.fn().mockReturnThis();
      const { req, res, next } = createMocks(1);
      res.json = jsonFn;
      req._scannerRestrictions = ['minSpread removed'];
      attachScannerRestrictions(req, res, next);
      expect(next).toHaveBeenCalled();

      // After monkey-patching, calling res.json should inject restrictions
      const body = { data: [] };
      res.json(body);
      expect(body).toHaveProperty('_restrictions');
    });

    it('does not modify response when no restrictions', () => {
      const { req, res, next } = createMocks(1);
      attachScannerRestrictions(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
