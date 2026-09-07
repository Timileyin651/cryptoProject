import { Op, col, literal } from 'sequelize';
import { Notification, NotificationStatus } from '../models/Notification';
import { NotificationPreference } from '../models/NotificationPreference';
import { Alert } from '../models/Alert';
import { User } from '../models/User';
import { AlertMatch } from './AlertEvaluator';
import { getChannelHandler, NotificationChannelHandler } from './NotificationChannel';
import { logger } from '../utils/logger';
import { prefCache } from '../cache/RedisCache';
import { redisClient } from '../config/redis';
import { retryManager } from '../notifications/RetryManager';

// ──────────────────── NotificationService ──────────────────────────────

class NotificationService {
  /** Maximum notifications per hour (global safety limit). */
  private readonly GLOBAL_RATE_LIMIT = 100;

  // ──────────────────── Dispatch ──────────────────────────────────────

  /**
   * Dispatch notifications for an alert match across all configured channels.
   * Handles deduplication, rate limiting, and creates Notification records.
   */
  async dispatch(match: AlertMatch): Promise<Notification[]> {
    const { alert, opportunity } = match;

    // Load user preferences (with Redis cache)
    let preference = await prefCache.get<NotificationPreference>(`user:${alert.user_id}`);
    if (!preference) {
      const dbPref = await NotificationPreference.findOne({
        where: { user_id: alert.user_id },
      });
      if (dbPref) {
        preference = dbPref as unknown as NotificationPreference;
        await prefCache.set(`user:${alert.user_id}`, preference, 300_000);
      }
    }

    if (!preference) {
      logger.warn(`[NotificationService] No preferences for user ${alert.user_id}`);
      return [];
    }

    // Check quiet hours
    if (this.isQuietHours(preference)) {
      logger.debug(`[NotificationService] User ${alert.user_id} in quiet hours`);
      return [];
    }

    // Check global rate limit
    const recentCount = await this.getRecentNotificationCount(alert.user_id);
    if (recentCount >= this.GLOBAL_RATE_LIMIT) {
      logger.warn(`[NotificationService] User ${alert.user_id} hit global rate limit`);
      return [];
    }

    const notifications: Notification[] = [];

    for (const channelType of alert.channels) {
      const handler = getChannelHandler(channelType);

      // Check if channel is enabled
      if (!handler.isEnabled(preference)) {
        continue;
      }

      // Check per-channel rate limit (approximate from recent count)
      // Each channel gets roughly 1/3 of the limit if all 3 are active
      const channelLimit = Math.ceil(this.GLOBAL_RATE_LIMIT / 3);
      if (recentCount >= channelLimit) {
        continue;
      }

    // Check dedup (Redis fast path → DB fallback)
    const dedupKey = `${alert.id}:${opportunity.symbol}:${opportunity.buy_exchange_slug}:${opportunity.sell_exchange_slug}:${channelType}`;
    const dedupRedisKey = `arb:dedup:${dedupKey}`;

    try {
      const exists = await redisClient.exists(dedupRedisKey);
      if (exists) {
        logger.debug(`[NotificationService] Duplicate notification skipped (Redis)`, { dedupKey });
        continue;
      }
    } catch {
      // Redis failure — fall through to DB check
    }

    const existing = await Notification.findOne({
      where: { dedup_key: dedupKey },
    });

    if (existing) {
      logger.debug(`[NotificationService] Duplicate notification skipped (DB)`, { dedupKey });
      continue;
    }

    // Set Redis dedup flag (TTL = max cooldown, 24h)
    try {
      await redisClient.setex(dedupRedisKey, 86400, '1');
    } catch {
      // Non-fatal
    }

      // Build notification content
      const { subject, bodyText, bodyHtml } = this.buildContent(match);

      // Create notification record
      const notification = await Notification.create({
        user_id: alert.user_id,
        alert_id: alert.id,
        channel: channelType,
        status: 'pending',
        subject,
        body_text: bodyText,
        body_html: bodyHtml,
        payload: {
          opportunityId: opportunity.id,
          symbol: opportunity.symbol,
          netProfit: opportunity.net_profit,
          roi: opportunity.roi,
        },
        error_message: null,
        max_attempts: 3,
        dedup_key: dedupKey,
      });

      // Attempt delivery
      const success = await this.attemptDelivery(notification, handler, preference);

      if (success) {
        notifications.push(notification);
      } else {
        // Schedule retry
        await this.scheduleRetry(notification);
      }
    }

    // Update alert's last notified time
    if (notifications.length > 0) {
      await Alert.update(
        {
          last_notified_at: new Date(),
          trigger_count: literal('trigger_count + 1'),
        },
        { where: { id: alert.id } },
      );
    }

    return notifications;
  }

  // ──────────────────── Delivery ──────────────────────────────────────

  /** Attempt to deliver a notification via a channel handler. */
  private async attemptDelivery(
    notification: Notification,
    handler: NotificationChannelHandler,
    preference: NotificationPreference,
  ): Promise<boolean> {
    try {
      await notification.update({
        status: 'sent',
        attempt_count: notification.attempt_count + 1,
        last_attempt_at: new Date(),
      });

      const success = await handler.send(notification, preference);

      if (success) {
        await notification.update({
          status: 'delivered',
          delivered_at: new Date(),
        });
        return true;
      } else {
        await notification.update({
          status: 'failed',
          error_message: 'Channel handler returned false',
        });
        return false;
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[NotificationService] Delivery failed`, {
        notificationId: notification.id,
        channel: notification.channel,
        error: errorMsg,
      });

      await notification.update({
        status: 'failed',
        error_message: errorMsg,
      });
      return false;
    }
  }

  /** Schedule a retry for a failed notification. Uses RetryManager for shutdown-safe scheduling. */
  private async scheduleRetry(notification: Notification): Promise<void> {
    if (notification.attempt_count >= notification.max_attempts) {
      logger.warn(`[NotificationService] Max attempts reached`, {
        notificationId: notification.id,
        attempts: notification.attempt_count,
      });
      return;
    }

    await notification.update({ status: 'retrying' });

    // Exponential backoff: 30s, 60s, 120s...
    const delay = 30000 * Math.pow(2, notification.attempt_count - 1);

    const scheduled = retryManager.schedule(notification.id, delay, async () => {
      const handler = getChannelHandler(notification.channel);
      // Use cached preferences
      let preference = await prefCache.get<NotificationPreference>(`user:${notification.user_id}`);
      if (!preference) {
        const dbPref = await NotificationPreference.findOne({
          where: { user_id: notification.user_id },
        });
        if (dbPref) {
          preference = dbPref as unknown as NotificationPreference;
          await prefCache.set(`user:${notification.user_id}`, preference, 300_000);
        }
      }

      if (preference) {
        await this.attemptDelivery(notification, handler, preference);
      }
    });

    if (!scheduled) {
      logger.debug(`[NotificationService] Retry for #${notification.id} cancelled (shutdown)`);
    }
  }

  // ──────────────────── Content builder ───────────────────────────────

  private buildContent(match: AlertMatch): {
    subject: string;
    bodyText: string;
    bodyHtml: string;
  } {
    const { alert, opportunity } = match;
    const profit = parseFloat(opportunity.net_profit);
    const roi = parseFloat(opportunity.roi);
    const spread = parseFloat(opportunity.gross_spread_pct);

    const profitStr = !isNaN(profit)
      ? `${profit > 0 ? '+' : ''}${profit.toFixed(2)} ${opportunity.quote_currency}`
      : 'N/A';
    const roiStr = !isNaN(roi) ? `${(roi * 100).toFixed(2)}%` : 'N/A';
    const spreadStr = !isNaN(spread) ? `${(spread * 100).toFixed(2)}%` : 'N/A';

    const subject = `🔔 ${alert.name}: ${opportunity.symbol} — ROI ${roiStr}`;

    const bodyText = [
      `Alert: ${alert.name}`,
      `Pair: ${opportunity.symbol}`,
      `Type: ${opportunity.opportunity_type}`,
      ``,
      `Buy on: ${opportunity.buy_exchange_slug} @ ${parseFloat(opportunity.buy_price).toFixed(2)}`,
      `Sell on: ${opportunity.sell_exchange_slug} @ ${parseFloat(opportunity.sell_price).toFixed(2)}`,
      ``,
      `Gross Spread: ${spreadStr}`,
      `Net Profit: ${profitStr}`,
      `ROI: ${roiStr}`,
      ``,
      `Network: ${opportunity.network ?? 'N/A'}`,
      `Withdrawal: ${opportunity.withdrawal_available ? '✅' : '❌'}`,
      `Deposit: ${opportunity.deposit_available ? '✅' : '❌'}`,
      `Liquidity: ${opportunity.liquidity_executable ? '✅ Executable' : '⚠️ Insufficient'}`,
      ``,
      `All values are estimates. Not financial advice.`,
    ].join('\n');

    const profitColor = profit > 0 ? '#22c55e' : profit < 0 ? '#ef4444' : '#9ca3af';
    const roiColor = roi > 0 ? '#22c55e' : roi < 0 ? '#ef4444' : '#9ca3af';

    const bodyHtml = `
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; color: #e0e0e0; padding: 24px; border-radius: 12px;">
  <h2 style="color: #f59e0b; margin: 0 0 16px;">🔔 ${this.escapeHtml(alert.name)}</h2>
  <div style="background: #16213e; border-radius: 8px; padding: 16px; margin-bottom: 16px;">
    <div style="font-size: 24px; font-weight: bold; color: ${roiColor}; margin-bottom: 8px;">
      ${opportunity.symbol} — ROI ${roiStr}
    </div>
    <div style="display: flex; gap: 16px; font-size: 14px;">
      <span>Spread: <strong style="color: #f59e0b;">${spreadStr}</strong></span>
      <span>Profit: <strong style="color: ${profitColor};">${profitStr}</strong></span>
    </div>
  </div>
  <div style="font-size: 14px; line-height: 1.6;">
    <p style="margin: 4px 0;"><strong>Buy:</strong> ${opportunity.buy_exchange_slug} @ ${parseFloat(opportunity.buy_price).toFixed(2)}</p>
    <p style="margin: 4px 0;"><strong>Sell:</strong> ${opportunity.sell_exchange_slug} @ ${parseFloat(opportunity.sell_price).toFixed(2)}</p>
    <p style="margin: 4px 0;"><strong>Network:</strong> ${opportunity.network ?? 'N/A'}</p>
    <p style="margin: 4px 0;"><strong>Withdrawal:</strong> ${opportunity.withdrawal_available ? '✅ Available' : '❌ Unavailable'}</p>
    <p style="margin: 4px 0;"><strong>Deposit:</strong> ${opportunity.deposit_available ? '✅ Available' : '❌ Unavailable'}</p>
    <p style="margin: 4px 0;"><strong>Liquidity:</strong> ${opportunity.liquidity_executable ? '✅ Executable' : '⚠️ Insufficient'}</p>
  </div>
  <div style="margin-top: 16px; padding-top: 12px; border-top: 1px solid #333; font-size: 12px; color: #666;">
    All values are estimates. Funding rates change and basis can move against the position. Not financial advice.
  </div>
</div>`;

    return { subject, bodyText, bodyHtml };
  }

  // ──────────────────── Helpers ───────────────────────────────────────

  /** Check if the user is in quiet hours. */
  private isQuietHours(preference: NotificationPreference): boolean {
    if (preference.quiet_hours_start === null || preference.quiet_hours_end === null) {
      return false;
    }

    const now = new Date();
    // Convert to user's timezone
    const options: Intl.DateTimeFormatOptions = {
      timeZone: preference.timezone,
      hour: 'numeric',
      hour12: false,
    };
    const hour = parseInt(new Intl.DateTimeFormat('en-US', options).format(now), 10);

    const start = preference.quiet_hours_start;
    const end = preference.quiet_hours_end;

    if (start <= end) {
      // Same day range (e.g. 22:00 - 07:00 wraps)
      return hour >= start && hour < end;
    } else {
      // Overnight range (e.g. 22:00 - 07:00)
      return hour >= start || hour < end;
    }
  }

  /** Get count of notifications sent in the last hour. */
  private async getRecentNotificationCount(userId: number): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 3600000);
    return Notification.count({
      where: {
        user_id: userId,
        status: { [Op.in]: ['sent', 'delivered'] },
        last_attempt_at: { [Op.gte]: oneHourAgo },
      },
    });
  }

  /** Escape HTML entities. */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ──────────────────── Query helpers ─────────────────────────────────

  /** List notifications for a user with pagination. */
  async listNotifications(
    userId: number,
    options?: {
      alertId?: number;
      status?: NotificationStatus;
      channel?: string;
      page?: number;
      limit?: number;
    },
  ): Promise<{ data: Notification[]; total: number }> {
    const where: Record<string, unknown> = { user_id: userId };
    if (options?.alertId) where.alert_id = options.alertId;
    if (options?.status) where.status = options.status;
    if (options?.channel) where.channel = options.channel;

    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 25, 100);
    const offset = (page - 1) * limit;

    const { rows, count } = await Notification.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset,
    });

    return { data: rows, total: count };
  }

  /** Get notification stats for a user. */
  async getStats(userId: number): Promise<{
    total: number;
    delivered: number;
    failed: number;
    pending: number;
    retrying: number;
  }> {
    const [total, delivered, failed, pending, retrying] = await Promise.all([
      Notification.count({ where: { user_id: userId } }),
      Notification.count({ where: { user_id: userId, status: 'delivered' } }),
      Notification.count({ where: { user_id: userId, status: 'failed' } }),
      Notification.count({ where: { user_id: userId, status: { [Op.in]: ['pending', 'sent'] } } }),
      Notification.count({ where: { user_id: userId, status: 'retrying' } }),
    ]);

    return { total, delivered, failed, pending, retrying };
  }

  /** Retry all failed notifications that haven't exhausted attempts. */
  async retryFailed(): Promise<number> {
    const failed = await Notification.findAll({
      where: {
        status: 'failed',
        attempt_count: { [Op.lt]: col('max_attempts') },
      },
      limit: 50,
    });

    let retried = 0;
    for (const notification of failed) {
      const handler = getChannelHandler(notification.channel);
      const preference = await NotificationPreference.findOne({
        where: { user_id: notification.user_id },
      });

      if (preference && handler.isEnabled(preference)) {
        await notification.update({ status: 'retrying' });
        await this.attemptDelivery(notification, handler, preference);
        retried++;
      }
    }

    return retried;
  }

  /** Get or create notification preferences for a user. */
  async getPreferences(userId: number): Promise<NotificationPreference> {
    let pref = await NotificationPreference.findOne({ where: { user_id: userId } });
    if (!pref) {
      pref = await NotificationPreference.create({
        user_id: userId,
        email_enabled: true,
        telegram_enabled: false,
        telegram_bot_token: null,
        telegram_chat_id: null,
        web_push_enabled: false,
        quiet_hours_start: null,
        quiet_hours_end: null,
        timezone: 'UTC',
        rate_limit_per_hour: 30,
      });
    }
    return pref;
  }

  /** Update notification preferences. */
  async updatePreferences(
    userId: number,
    data: Partial<{
      emailEnabled: boolean;
      telegramEnabled: boolean;
      telegramBotToken: string;
      telegramChatId: string;
      webPushEnabled: boolean;
      quietHoursStart: number | null;
      quietHoursEnd: number | null;
      timezone: string;
      rateLimitPerHour: number;
    }>,
  ): Promise<NotificationPreference> {
    const pref = await this.getPreferences(userId);

    const updates: Record<string, unknown> = {};
    if (data.emailEnabled !== undefined) updates.email_enabled = data.emailEnabled;
    if (data.telegramEnabled !== undefined) updates.telegram_enabled = data.telegramEnabled;
    if (data.telegramBotToken !== undefined) updates.telegram_bot_token = data.telegramBotToken;
    if (data.telegramChatId !== undefined) updates.telegram_chat_id = data.telegramChatId;
    if (data.webPushEnabled !== undefined) updates.web_push_enabled = data.webPushEnabled;
    if (data.quietHoursStart !== undefined) updates.quiet_hours_start = data.quietHoursStart;
    if (data.quietHoursEnd !== undefined) updates.quiet_hours_end = data.quietHoursEnd;
    if (data.timezone !== undefined) updates.timezone = data.timezone;
    if (data.rateLimitPerHour !== undefined) updates.rate_limit_per_hour = data.rateLimitPerHour;

    if (Object.keys(updates).length > 0) {
      await pref.update(updates);
    }

    return pref.reload();
  }
}

export const notificationService = new NotificationService();
export { NotificationService };
