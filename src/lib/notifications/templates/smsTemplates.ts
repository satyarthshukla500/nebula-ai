/**
 * SMS Templates for Guardian Mode Notifications
 *
 * All messages are kept at or under 160 characters (standard single-SMS limit).
 * Messages sent to emergency contacts include "Reply STOP to opt out" per TCPA.
 */

import { NotificationType } from '../types';

export interface SmsTemplateData {
  message: string;
  recipientName?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

/**
 * Build an SMS body for the given notification type.
 * Returns a string guaranteed to be ≤160 characters.
 */
export function getSmsTemplate(type: NotificationType, data: SmsTemplateData): string {
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://nebula-ai.com').replace(/\/$/, '');
  const name = data.recipientName ?? '';

  let msg: string;

  switch (type) {
    // -----------------------------------------------------------------------
    case 'CHECKIN_REMINDER': {
      // Sent to the user — no TCPA opt-out required
      // e.g. "Nebula AI: Time for your wellness check-in. {url}"
      const url = `${appUrl}/guardian/checkin`;
      const base = `Nebula AI: Time for your wellness check-in. ${url}`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    case 'ESCALATION_WARNING': {
      // Stage 2 — sent to the user
      // e.g. "Nebula AI: You missed a check-in. Please respond to let us know you're okay. {url}"
      const url = `${appUrl}/guardian/respond`;
      const base = `Nebula AI: You missed a check-in. Please respond: ${url}`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    case 'EMERGENCY_ALERT': {
      // Stage 4 — sent to emergency contact (NOT the user)
      // Must include TCPA opt-out. Must NOT include private/medical info.
      const userName = data.metadata?.userName ?? 'your contact';
      const optOutUrl = data.metadata?.optOutUrl ?? `${appUrl}/guardian/contact-optout`;
      // Keep it short: name + action + opt-out
      const base = `Nebula AI: ${userName} has missed wellness check-ins. Please reach out to them. Reply STOP to opt out: ${optOutUrl}`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    case 'CONTACT_VERIFICATION': {
      // OTP sent to emergency contact — include opt-out per TCPA
      const otp = data.metadata?.otp ?? '';
      const base = otp
        ? `Nebula AI: Your verification code is ${otp}. Expires in 15 min. Reply STOP to opt out.`
        : `Nebula AI: You have been added as an emergency contact. Reply STOP to opt out.`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    case 'GUARDIAN_ENABLED': {
      // Confirmation to the user — no TCPA opt-out required
      const base = `Nebula AI: Guardian Mode is now active. You will receive wellness check-in reminders. Manage: ${appUrl}/guardian`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    case 'GUARDIAN_DISABLED': {
      // Confirmation to the user — no TCPA opt-out required
      const base = `Nebula AI: Guardian Mode has been disabled. No further check-in reminders will be sent. Re-enable: ${appUrl}/guardian`;
      msg = base;
      break;
    }

    // -----------------------------------------------------------------------
    default:
      msg = data.message.length > 160 ? `${data.message.slice(0, 157)}...` : data.message;
  }

  // Safety truncation — should never be needed given the templates above,
  // but guards against unexpectedly long env URLs.
  return msg.length > 160 ? `${msg.slice(0, 157)}...` : msg;
}
