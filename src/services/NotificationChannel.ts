import { Notification, NotificationChannel as ChannelType } from '../models/Notification';
import { NotificationPreference } from '../models/NotificationPreference';
import { logger } from '../utils/logger';

// ──────────────────── Channel Interface ────────────────────────────────

export interface NotificationChannelHandler {
  readonly channelType: ChannelType;

  /** Check if this channel is enabled for the user. */
  isEnabled(preference: NotificationPreference): boolean;

  /** Send the notification. Returns true on success. */
  send(notification: Notification, preference: NotificationPreference): Promise<boolean>;
}

// ──────────────────── Email Channel (MVP) ──────────────────────────────

export class EmailChannel implements NotificationChannelHandler {
  readonly channelType: ChannelType = 'email';

  isEnabled(preference: NotificationPreference): boolean {
    return preference.email_enabled;
  }

  async send(notification: Notification, _preference: NotificationPreference): Promise<boolean> {
    try {
      // In production, integrate with a real email provider (SendGrid, SES, etc.)
      // For now, log the email as a placeholder.
      logger.info(`[EMAIL] Sending alert notification`, {
        to: `user_${notification.user_id}@example.com`,
        subject: notification.subject,
        body: notification.body_text,
        html: notification.body_html,
      });

      // TODO: Replace with real email provider integration
      // await this.emailProvider.send({
      //   to: user.email,
      //   subject: notification.subject,
      //   text: notification.body_text,
      //   html: notification.body_html,
      // });

      return true;
    } catch (error) {
      logger.error(`[EMAIL] Failed to send notification`, {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// ──────────────────── Telegram Channel ─────────────────────────────────

export class TelegramChannel implements NotificationChannelHandler {
  readonly channelType: ChannelType = 'telegram';

  isEnabled(preference: NotificationPreference): boolean {
    return (
      preference.telegram_enabled &&
      !!preference.telegram_bot_token &&
      !!preference.telegram_chat_id
    );
  }

  async send(notification: Notification, preference: NotificationPreference): Promise<boolean> {
    if (!preference.telegram_bot_token || !preference.telegram_chat_id) {
      logger.warn('[TELEGRAM] Missing bot token or chat ID');
      return false;
    }

    try {
      const url = `https://api.telegram.org/bot${preference.telegram_bot_token}/sendMessage`;

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: preference.telegram_chat_id,
          text: notification.body_text,
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });

      if (!response.ok) {
        const errorBody = await response.text();
        logger.error('[TELEGRAM] API error', {
          status: response.status,
          body: errorBody,
        });
        return false;
      }

      logger.info('[TELEGRAM] Message sent successfully', {
        chatId: preference.telegram_chat_id,
      });
      return true;
    } catch (error) {
      logger.error('[TELEGRAM] Failed to send message', {
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  }
}

// ──────────────────── Web Push Channel (Stub) ──────────────────────────

/**
 * Web Push notification channel.
 * STUB: This is a placeholder implementation. Web Push requires:
 * 1. A push service (Firebase Cloud Messaging, OneSignal, etc.)
 * 2. Service worker registration on the client
 * 3. Push subscription management
 *
 * This stub logs the intent but does not actually send push notifications.
 * Implement when ready for production.
 */
export class WebPushChannel implements NotificationChannelHandler {
  readonly channelType: ChannelType = 'web_push';

  isEnabled(preference: NotificationPreference): boolean {
    return preference.web_push_enabled;
  }

  async send(notification: Notification, _preference: NotificationPreference): Promise<boolean> {
    // Stub: log that push would be sent
    logger.info(`[WEB_PUSH] STUB — Would send push notification`, {
      notificationId: notification.id,
      subject: notification.subject,
      body: notification.body_text.substring(0, 100),
    });

    // TODO: Implement actual web push
    // 1. Load push subscription from user settings
    // 2. Encrypt payload with subscription keys
    // 3. Send via web-push library or FCM
    // 4. Handle expired subscriptions

    return true; // Stub always succeeds
  }
}

// ──────────────────── Channel Factory ──────────────────────────────────

const channelHandlers: Record<ChannelType, NotificationChannelHandler> = {
  email: new EmailChannel(),
  telegram: new TelegramChannel(),
  web_push: new WebPushChannel(),
};

export function getChannelHandler(channel: ChannelType): NotificationChannelHandler {
  return channelHandlers[channel];
}

export function getAllChannelHandlers(): NotificationChannelHandler[] {
  return Object.values(channelHandlers);
}
