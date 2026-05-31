/**
 * SMS Notification Provider
 *
 * Sends SMS messages via Twilio.
 * Falls back gracefully when credentials are not configured.
 *
 * Required environment variables:
 *   TWILIO_ACCOUNT_SID  — Twilio Account SID
 *   TWILIO_AUTH_TOKEN   — Twilio Auth Token
 *   TWILIO_FROM_NUMBER  — Twilio phone number in E.164 format (e.g. +15551234567)
 */

import twilio from 'twilio';
import {
  NotificationProvider,
  NotificationRequest,
  NotificationResult,
} from '../types';
import { getSmsTemplate } from '../templates/smsTemplates';

/**
 * SMSProvider — Twilio-backed SMS delivery
 */
export class SMSProvider implements NotificationProvider {
  readonly name = 'SMSProvider';

  private client: ReturnType<typeof twilio> | null = null;

  private get accountSid(): string {
    return process.env.TWILIO_ACCOUNT_SID ?? '';
  }

  private get authToken(): string {
    return process.env.TWILIO_AUTH_TOKEN ?? '';
  }

  private get fromNumber(): string {
    return process.env.TWILIO_FROM_NUMBER ?? '';
  }

  /**
   * Returns true only when all required Twilio credentials are set.
   */
  isAvailable(): boolean {
    return !!(
      process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_FROM_NUMBER
    );
  }

  /**
   * Lazily initialise the Twilio client so it is only created when needed.
   */
  private getClient(): ReturnType<typeof twilio> {
    if (!this.client) {
      this.client = twilio(this.accountSid, this.authToken);
    }
    return this.client;
  }

  /**
   * Send a notification SMS via Twilio.
   */
  async send(request: NotificationRequest): Promise<NotificationResult> {
    const timestamp = new Date().toISOString();
    const phone = request.recipient.phone;

    if (!phone) {
      return {
        success: false,
        provider: this.name,
        timestamp,
        error: 'No phone number provided for SMS delivery',
      };
    }

    if (!this.isAvailable()) {
      return {
        success: false,
        provider: this.name,
        timestamp,
        error:
          'SMSProvider not configured: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER are required',
      };
    }

    const body = getSmsTemplate(request.payload.type, {
      message: request.payload.message ?? '',
      recipientName: request.recipient.name,
      userId: request.payload.userId,
      metadata: request.payload.metadata,
    });

    try {
      const message = await this.getClient().messages.create({
        body,
        from: this.fromNumber,
        to: phone,
      });

      const maskedPhone = maskPhone(phone);
      console.log('📱 [SMSProvider] SMS sent via Twilio', {
        timestamp,
        to: maskedPhone,
        type: request.payload.type,
        sid: message.sid,
      });

      return { success: true, provider: this.name, timestamp };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      console.error('❌ [SMSProvider] Twilio error', { message });
      return {
        success: false,
        provider: this.name,
        timestamp,
        error: `Twilio error: ${message}`,
      };
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function maskPhone(phone: string): string {
  return phone.length >= 4 ? `***${phone.slice(-4)}` : '***';
}
