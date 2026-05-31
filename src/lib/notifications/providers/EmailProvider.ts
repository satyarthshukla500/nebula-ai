/**
 * Email Notification Provider
 *
 * Sends emails via AWS Simple Email Service (SES) using the AWS SDK v3.
 * Falls back gracefully when credentials are not configured.
 *
 * Required environment variables:
 *   AWS_REGION            — AWS region (e.g. us-east-1)
 *   AWS_ACCESS_KEY_ID     — IAM access key with ses:SendEmail permission
 *   AWS_SECRET_ACCESS_KEY — IAM secret key
 *   AWS_SES_FROM_EMAIL    — Verified sender address (e.g. noreply@nebula-ai.com)
 *
 * Optional:
 *   AWS_SES_FROM_NAME     — Sender display name (default: Nebula AI)
 *   AWS_SES_REGION        — Override SES region if different from AWS_REGION
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationResult,
  NotificationType,
} from '../types';
import { getEmailTemplate, EmailTemplate } from '../templates/emailTemplates';

/**
 * EmailProvider — AWS SES-backed email delivery
 */
export class EmailProvider implements NotificationProvider {
  readonly name = 'EmailProvider';

  private client: SESClient | null = null;

  private get fromEmail(): string {
    return process.env.AWS_SES_FROM_EMAIL ?? '';
  }

  private get fromName(): string {
    return process.env.AWS_SES_FROM_NAME ?? 'Nebula AI';
  }

  private get sesRegion(): string {
    return process.env.AWS_SES_REGION ?? process.env.AWS_REGION ?? 'us-east-1';
  }

  /**
   * Returns true only when the required AWS credentials and sender address are set.
   */
  isAvailable(): boolean {
    return !!(
      process.env.AWS_ACCESS_KEY_ID &&
      process.env.AWS_SECRET_ACCESS_KEY &&
      process.env.AWS_SES_FROM_EMAIL
    );
  }

  /**
   * Lazily initialise the SES client so it is only created when needed.
   */
  private getClient(): SESClient {
    if (!this.client) {
      this.client = new SESClient({
        region: this.sesRegion,
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
        },
      });
    }
    return this.client;
  }

  /**
   * Send a notification email via AWS SES.
   */
  async send(request: NotificationRequest): Promise<NotificationResult> {
    const timestamp = new Date().toISOString();
    const email = request.recipient.email;

    if (!email) {
      return {
        success: false,
        provider: this.name,
        timestamp,
        error: 'No email address provided for email delivery',
      };
    }

    if (!this.isAvailable()) {
      return {
        success: false,
        provider: this.name,
        timestamp,
        error:
          'EmailProvider not configured: AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SES_FROM_EMAIL are required',
      };
    }

    const template = getEmailTemplate(request.payload.type, {
      message: request.payload.message,
      recipientName: request.recipient.name,
      userId: request.payload.userId,
      metadata: request.payload.metadata,
    });

    const source = this.fromName
      ? `${this.fromName} <${this.fromEmail}>`
      : this.fromEmail;

    const command = new SendEmailCommand({
      Source: source,
      Destination: {
        ToAddresses: [email],
      },
      Message: {
        Subject: {
          Data: template.subject,
          Charset: 'UTF-8',
        },
        Body: {
          Html: {
            Data: template.htmlBody,
            Charset: 'UTF-8',
          },
          Text: {
            Data: template.textBody,
            Charset: 'UTF-8',
          },
        },
      },
    });

    try {
      const response = await this.getClient().send(command);

      const maskedEmail = maskEmail(email);
      console.log('📧 [EmailProvider] Email sent via AWS SES', {
        timestamp,
        to: maskedEmail,
        type: request.payload.type,
        subject: template.subject,
        messageId: response.MessageId,
      });

      return { success: true, provider: this.name, timestamp };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ [EmailProvider] AWS SES error', { message });
      return {
        success: false,
        provider: this.name,
        timestamp,
        error: `AWS SES error: ${message}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskEmail(email: string): string {
  const [local, domain] = email.split('@');
  if (!domain) return '***';
  return `${local.slice(0, 2)}***@${domain}`;
}

// Re-export for consumers that import EmailTemplate from this module
export type { EmailTemplate };
