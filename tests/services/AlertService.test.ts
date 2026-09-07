import { AlertService } from '../../src/services/AlertService';

// Mock dependencies
jest.mock('../../src/models/Alert', () => {
  const mockAlert = {
    create: jest.fn(),
    update: jest.fn(),
    count: jest.fn().mockResolvedValue(0),
    findOne: jest.fn().mockResolvedValue(null),
    findAndCountAll: jest.fn().mockResolvedValue({ rows: [], count: 0 }),
    reload: jest.fn().mockImplementation(function (this: any) {
      return Promise.resolve(this);
    }),
    sequelize: { literal: jest.fn((val: string) => ({ val, type: 'literal' })) },
  };
  return {
    Alert: Object.assign(jest.fn(), mockAlert),
    AlertStatus: {},
    AlertConditions: {},
    AlertChannel: {},
  };
});

jest.mock('../../src/services/SubscriptionService', () => ({
  subscriptionService: {
    resolvePlan: jest.fn().mockResolvedValue({
      slug: 'free',
      max_alerts: 1,
      min_alert_cooldown_seconds: 7200,
    }),
  },
}));

import { Alert } from '../../src/models/Alert';
import { subscriptionService } from '../../src/services/SubscriptionService';

describe('AlertService', () => {
  let service: AlertService;

  beforeEach(() => {
    service = new AlertService();
    jest.clearAllMocks();
  });

  describe('resolveLimits', () => {
    it('returns free tier limits for free plan', async () => {
      (subscriptionService.resolvePlan as jest.Mock).mockResolvedValue({ slug: 'free' });
      const limits = await service.resolveLimits(1);
      expect(limits.maxAlerts).toBe(1);
      expect(limits.maxChannels).toBe(1);
      expect(limits.allowFundingAlerts).toBe(false);
    });

    it('returns pro tier limits for pro plan', async () => {
      (subscriptionService.resolvePlan as jest.Mock).mockResolvedValue({ slug: 'pro' });
      const limits = await service.resolveLimits(1);
      expect(limits.maxAlerts).toBe(50);
      expect(limits.allowFundingAlerts).toBe(true);
    });
  });

  describe('isInCooldown', () => {
    it('returns false if no last_notified_at', () => {
      const alert = { last_notified_at: null, cooldown_seconds: 3600 } as any;
      expect(service.isInCooldown(alert)).toBe(false);
    });

    it('returns true if within cooldown', () => {
      const alert = {
        last_notified_at: new Date(Date.now() - 1000), // 1 second ago
        cooldown_seconds: 3600,
      } as any;
      expect(service.isInCooldown(alert)).toBe(true);
    });

    it('returns false if cooldown has elapsed', () => {
      const alert = {
        last_notified_at: new Date(Date.now() - 7200000), // 2 hours ago
        cooldown_seconds: 3600,
      } as any;
      expect(service.isInCooldown(alert)).toBe(false);
    });
  });

  describe('createAlert', () => {
    it('validates alert name is required', async () => {
      await expect(
        service.createAlert(1, {
          name: '',
          conditions: {},
          channels: ['email'],
        }),
      ).rejects.toThrow('Alert name is required');
    });

    it('validates channels are required', async () => {
      await expect(
        service.createAlert(1, {
          name: 'Test',
          conditions: {},
          channels: [],
        }),
      ).rejects.toThrow('At least one notification channel is required');
    });

    it('validates cooldown range', async () => {
      (subscriptionService.resolvePlan as jest.Mock).mockResolvedValue({ slug: 'free' });
      // Cooldown 30s < free tier min (7200s), so minimum-cooldown check fires first
      await expect(
        service.createAlert(1, {
          name: 'Test',
          conditions: {},
          channels: ['email'],
          cooldownSeconds: 30, // too low
        }),
      ).rejects.toThrow('cooldown');
    });

    it('enforces free tier channel limit', async () => {
      (subscriptionService.resolvePlan as jest.Mock).mockResolvedValue({ slug: 'free' });
      await expect(
        service.createAlert(1, {
          name: 'Test',
          conditions: {},
          channels: ['email', 'telegram'], // free tier only allows 1
        }),
      ).rejects.toThrow('Maximum 1 channel(s) allowed on your plan');
    });

    it('enforces free tier alert limit', async () => {
      (subscriptionService.resolvePlan as jest.Mock).mockResolvedValue({ slug: 'free' });
      const alertCountMock = jest.spyOn(Alert, 'count').mockResolvedValue(1); // already at limit
      await expect(
        service.createAlert(1, {
          name: 'Test',
          conditions: {},
          channels: ['email'],
        }),
      ).rejects.toThrow('Alert limit reached');
      alertCountMock.mockRestore();
    });
  });
});
