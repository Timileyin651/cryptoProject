import { logger } from '../utils/logger';

export class EmailService {
  async sendVerificationEmail(
    to: string,
    firstName: string,
    verificationToken: string,
  ): Promise<void> {
    // Placeholder: log the email. Replace with real email provider integration.
    logger.info(`[EMAIL] Verification email to ${to}`, {
      to,
      firstName,
      verificationLink: `http://localhost:3000/api/v1/auth/verify-email?token=${verificationToken}`,
    });
  }

  async sendPasswordResetEmail(
    to: string,
    firstName: string,
    resetToken: string,
  ): Promise<void> {
    // Placeholder: log the email. Replace with real email provider integration.
    logger.info(`[EMAIL] Password reset email to ${to}`, {
      to,
      firstName,
      resetLink: `http://localhost:3000/auth/reset-password?token=${resetToken}`,
    });
  }
}

export const emailService = new EmailService();
