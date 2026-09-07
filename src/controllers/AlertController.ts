import { Request, Response, NextFunction } from 'express';
import { alertService } from '../services/AlertService';
import { notificationService } from '../services/NotificationService';
import { getAlertEngine } from '../services/AlertEngine';

export class AlertController {
  // ──────────────────── Alerts CRUD ───────────────────────────────────

  /** GET /api/v1/alerts */
  async listAlerts(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { status, isEnabled, page, limit } = req.query;
      const result = await alertService.listAlerts(userId, {
        status: status as any,
        isEnabled: isEnabled !== undefined ? isEnabled === 'true' : undefined,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.status(200).json({
        data: result.data,
        pagination: {
          total: result.total,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 25,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/alerts/:id */
  async getAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid alert ID' });
        return;
      }

      const alert = await alertService.getAlert(userId, id);
      res.status(200).json({ data: alert });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/alerts */
  async createAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { name, description, conditions, channels, cooldownSeconds } = req.body;
      if (!name || typeof name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      if (!conditions || typeof conditions !== 'object') {
        res.status(400).json({ error: 'conditions object is required' });
        return;
      }
      if (!channels || !Array.isArray(channels) || channels.length === 0) {
        res.status(400).json({ error: 'channels array is required' });
        return;
      }

      const alert = await alertService.createAlert(userId, {
        name,
        description,
        conditions,
        channels,
        cooldownSeconds,
      });

      res.status(201).json({ data: alert });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/alerts/:id */
  async updateAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid alert ID' });
        return;
      }

      const { name, description, conditions, channels, cooldownSeconds, isEnabled, status } =
        req.body;
      const alert = await alertService.updateAlert(userId, id, {
        name,
        description,
        conditions,
        channels,
        cooldownSeconds,
        isEnabled,
        status,
      });

      res.status(200).json({ data: alert });
    } catch (error) {
      next(error);
    }
  }

  /** DELETE /api/v1/alerts/:id */
  async deleteAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid alert ID' });
        return;
      }

      await alertService.deleteAlert(userId, id);
      res.status(204).send();
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/alerts/:id/pause */
  async pauseAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid alert ID' });
        return;
      }

      const alert = await alertService.pauseAlert(userId, id);
      res.status(200).json({ data: alert });
    } catch (error) {
      next(error);
    }
  }

  /** POST /api/v1/alerts/:id/resume */
  async resumeAlert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        res.status(400).json({ error: 'Invalid alert ID' });
        return;
      }

      const alert = await alertService.resumeAlert(userId, id);
      res.status(200).json({ data: alert });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Notifications ─────────────────────────────────

  /** GET /api/v1/alerts/notifications */
  async listNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const { alertId, status, channel, page, limit } = req.query;
      const result = await notificationService.listNotifications(userId, {
        alertId: alertId ? parseInt(alertId as string, 10) : undefined,
        status: status as any,
        channel: channel as string,
        page: page ? parseInt(page as string, 10) : undefined,
        limit: limit ? parseInt(limit as string, 10) : undefined,
      });

      res.status(200).json({
        data: result.data,
        pagination: {
          total: result.total,
          page: page ? parseInt(page as string, 10) : 1,
          limit: limit ? parseInt(limit as string, 10) : 25,
        },
      });
    } catch (error) {
      next(error);
    }
  }

  /** GET /api/v1/alerts/notifications/stats */
  async getNotificationStats(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const stats = await notificationService.getStats(userId);
      res.status(200).json({ data: stats });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Preferences ───────────────────────────────────

  /** GET /api/v1/alerts/preferences */
  async getPreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const prefs = await notificationService.getPreferences(userId);
      res.status(200).json({ data: prefs });
    } catch (error) {
      next(error);
    }
  }

  /** PUT /api/v1/alerts/preferences */
  async updatePreferences(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const {
        emailEnabled,
        telegramEnabled,
        telegramBotToken,
        telegramChatId,
        webPushEnabled,
        quietHoursStart,
        quietHoursEnd,
        timezone,
        rateLimitPerHour,
      } = req.body;

      const prefs = await notificationService.updatePreferences(userId, {
        emailEnabled,
        telegramEnabled,
        telegramBotToken,
        telegramChatId,
        webPushEnabled,
        quietHoursStart,
        quietHoursEnd,
        timezone,
        rateLimitPerHour,
      });

      res.status(200).json({ data: prefs });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Engine status ─────────────────────────────────

  /** GET /api/v1/alerts/engine/status */
  async getEngineStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const engine = getAlertEngine();
      const status = engine.getStatus();
      res.status(200).json({ data: status });
    } catch (error) {
      next(error);
    }
  }

  // ──────────────────── Limits ────────────────────────────────────────

  /** GET /api/v1/alerts/limits */
  async getLimits(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const userId = req.user?.userId;
      if (!userId) {
        res.status(401).json({ error: 'Authentication required' });
        return;
      }

      const result = await alertService.getLimits(userId);
      res.status(200).json({ data: result });
    } catch (error) {
      next(error);
    }
  }
}

export const alertController = new AlertController();
