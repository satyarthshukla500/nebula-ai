/**
 * Email Templates for Guardian Mode Notifications
 *
 * Proper HTML email templates with table-based layout for email client compatibility.
 * Each template includes:
 *   - Clear subject line
 *   - HTML body with table-based layout
 *   - Plain text fallback
 *   - Opt-out / deactivation link
 *   - Disclaimer (where appropriate) that this is NOT a medical/emergency service
 */

import { NotificationType } from '../types';

export interface EmailTemplate {
  subject: string;
  htmlBody: string;
  textBody: string;
}

interface TemplateData {
  message: string;
  recipientName?: string;
  userId?: string;
  metadata?: Record<string, any>;
}

// ---------------------------------------------------------------------------
// Shared layout helpers
// ---------------------------------------------------------------------------

function htmlWrapper(title: string, bodyContent: string, footerContent: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:Arial,Helvetica,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          <!-- Header -->
          <tr>
            <td style="background-color:#1a1a2e;padding:24px 32px;">
              <p style="margin:0;font-size:20px;font-weight:bold;color:#ffffff;">Nebula AI</p>
              <p style="margin:4px 0 0;font-size:13px;color:#a0a0c0;">Guardian Mode</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background-color:#f4f4f7;padding:20px 32px;border-top:1px solid #e0e0e0;">
              ${footerContent}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function standardFooter(appUrl: string, deactivateUrl: string): string {
  return `<p style="margin:0 0 8px;font-size:12px;color:#888888;">
    You are receiving this email because Guardian Mode is active on your Nebula AI account.
  </p>
  <p style="margin:0 0 8px;font-size:12px;color:#888888;">
    <a href="${deactivateUrl}" style="color:#6b7280;text-decoration:underline;">Deactivate Guardian Mode</a>
    &nbsp;|&nbsp;
    <a href="${appUrl}/guardian" style="color:#6b7280;text-decoration:underline;">Manage settings</a>
  </p>
  <p style="margin:0;font-size:11px;color:#aaaaaa;">
    Nebula AI &mdash; Mental Wellness Platform
  </p>`;
}

function contactFooter(appUrl: string, optOutUrl: string): string {
  return `<p style="margin:0 0 8px;font-size:12px;color:#888888;">
    You are receiving this email because you were added as an emergency contact on Nebula AI.
  </p>
  <p style="margin:0 0 8px;font-size:12px;color:#888888;">
    <a href="${optOutUrl}" style="color:#6b7280;text-decoration:underline;">Opt out of future notifications</a>
  </p>
  <p style="margin:0;font-size:11px;color:#aaaaaa;">
    Nebula AI &mdash; Mental Wellness Platform
  </p>`;
}

function disclaimer(): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <tr>
      <td style="background-color:#fff8e1;border-left:4px solid #f59e0b;padding:12px 16px;border-radius:4px;">
        <p style="margin:0;font-size:12px;color:#92400e;font-weight:bold;">Important Disclaimer</p>
        <p style="margin:4px 0 0;font-size:12px;color:#92400e;">
          Guardian Mode is <strong>NOT a medical service</strong> and <strong>NOT an emergency service</strong>.
          If you or someone you know is in immediate danger, please call your local emergency services (e.g. 911) directly.
        </p>
      </td>
    </tr>
  </table>`;
}

function primaryButton(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:24px;">
    <tr>
      <td style="background-color:#4f46e5;border-radius:6px;">
        <a href="${href}" style="display:inline-block;padding:12px 28px;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${label}</a>
      </td>
    </tr>
  </table>`;
}

// ---------------------------------------------------------------------------
// Template factory
// ---------------------------------------------------------------------------

export function getEmailTemplate(
  type: NotificationType,
  data: TemplateData
): EmailTemplate {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://nebula-ai.com';
  const name = data.recipientName ?? 'there';
  const deactivateUrl = `${appUrl}/guardian/deactivate${data.userId ? `?uid=${data.userId}` : ''}`;
  const checkinUrl = `${appUrl}/guardian/checkin`;
  const respondUrl = `${appUrl}/guardian/respond`;

  switch (type) {
    // -----------------------------------------------------------------------
    case 'CHECKIN_REMINDER': {
      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">Time for your wellness check-in</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">${data.message}</p>
        <p style="margin:0;font-size:15px;color:#444444;">
          Your check-in only takes a moment. Let us know how you're doing today.
        </p>
        ${primaryButton(checkinUrl, 'Complete Check-in')}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          You can also snooze or manage your schedule from your
          <a href="${appUrl}/guardian" style="color:#4f46e5;text-decoration:none;">Guardian Mode settings</a>.
        </p>`;

      return {
        subject: 'Guardian Mode: Time for your wellness check-in',
        htmlBody: htmlWrapper('Wellness Check-in Reminder', body, standardFooter(appUrl, deactivateUrl)),
        textBody: [
          `Hi ${name},`,
          '',
          data.message,
          '',
          'Your check-in only takes a moment. Let us know how you\'re doing today.',
          '',
          `Complete your check-in: ${checkinUrl}`,
          '',
          `Manage settings: ${appUrl}/guardian`,
          `Deactivate Guardian Mode: ${deactivateUrl}`,
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    case 'ESCALATION_WARNING': {
      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">We haven't heard from you</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">${data.message}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          You missed a scheduled wellness check-in. Please take a moment to let us know you're okay.
          If you don't respond, Guardian Mode may escalate to the next stage.
        </p>
        ${primaryButton(respondUrl, 'I\'m Okay — Respond Now')}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          You can also
          <a href="${deactivateUrl}" style="color:#4f46e5;text-decoration:none;">deactivate Guardian Mode</a>
          at any time if you no longer need it.
        </p>
        ${disclaimer()}`;

      return {
        subject: 'Guardian Mode: Missed check-in — please respond',
        htmlBody: htmlWrapper('Missed Check-in Follow-up', body, standardFooter(appUrl, deactivateUrl)),
        textBody: [
          `Hi ${name},`,
          '',
          data.message,
          '',
          'You missed a scheduled wellness check-in. Please take a moment to let us know you\'re okay.',
          'If you don\'t respond, Guardian Mode may escalate to the next stage.',
          '',
          `Respond now: ${respondUrl}`,
          '',
          `Deactivate Guardian Mode: ${deactivateUrl}`,
          '',
          'DISCLAIMER: Guardian Mode is NOT a medical service and NOT an emergency service.',
          'If you are in immediate danger, call your local emergency services (e.g. 911) directly.',
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    case 'EMERGENCY_ALERT': {
      const userName = data.metadata?.userName ?? 'your contact';
      const optOutUrl = data.metadata?.optOutUrl ?? `${appUrl}/guardian/contact-optout`;

      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">Wellness check-in alert</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          You are receiving this message because you are listed as an emergency contact for
          <strong>${userName}</strong> on Nebula AI.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          ${userName} has missed several scheduled wellness check-ins and has not responded to follow-up reminders.
          Please reach out to them directly to make sure they're okay.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          ${data.message}
        </p>
        ${disclaimer()}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          This notification does <strong>not</strong> include any private messages, medical information,
          or diagnosis. It is a simple wellness check prompt only.
        </p>`;

      return {
        subject: `Guardian Mode: Wellness check-in alert for ${userName}`,
        htmlBody: htmlWrapper('Emergency Contact Alert', body, contactFooter(appUrl, optOutUrl)),
        textBody: [
          `Hi ${name},`,
          '',
          `You are receiving this message because you are listed as an emergency contact for ${userName} on Nebula AI.`,
          '',
          `${userName} has missed several scheduled wellness check-ins and has not responded to follow-up reminders.`,
          'Please reach out to them directly to make sure they\'re okay.',
          '',
          data.message,
          '',
          'DISCLAIMER: Guardian Mode is NOT a medical service and NOT an emergency service.',
          'If you believe they are in immediate danger, please contact local emergency services (e.g. 911) directly.',
          '',
          'This notification does not include any private messages, medical information, or diagnosis.',
          '',
          `Opt out of future notifications: ${optOutUrl}`,
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    case 'CONTACT_VERIFICATION': {
      const otp = data.metadata?.otp ?? '';
      const verifyUrl = data.metadata?.verifyUrl ?? `${appUrl}/guardian/verify-contact`;

      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">Verify your emergency contact role</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          Someone has added you as an emergency contact on Nebula AI's Guardian Mode.
          Please verify your role by entering the code below or clicking the button.
        </p>
        ${otp ? `
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0;">
          <tr>
            <td style="background-color:#f4f4f7;border:2px dashed #d1d5db;border-radius:8px;padding:16px 32px;text-align:center;">
              <p style="margin:0;font-size:13px;color:#888888;letter-spacing:1px;">VERIFICATION CODE</p>
              <p style="margin:8px 0 0;font-size:32px;font-weight:bold;color:#1a1a2e;letter-spacing:8px;">${otp}</p>
              <p style="margin:8px 0 0;font-size:12px;color:#888888;">This code expires in 15 minutes.</p>
            </td>
          </tr>
        </table>` : ''}
        ${primaryButton(verifyUrl, 'Verify My Role')}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          If you did not expect this email, you can safely ignore it. No action is required.
        </p>`;

      return {
        subject: 'Guardian Mode: Verify your emergency contact role',
        htmlBody: htmlWrapper('Emergency Contact Verification', body, contactFooter(appUrl, `${appUrl}/guardian/contact-optout`)),
        textBody: [
          `Hi ${name},`,
          '',
          'Someone has added you as an emergency contact on Nebula AI\'s Guardian Mode.',
          'Please verify your role using the information below.',
          '',
          ...(otp ? [`Your verification code: ${otp}`, 'This code expires in 15 minutes.', ''] : []),
          `Verify here: ${verifyUrl}`,
          '',
          'If you did not expect this email, you can safely ignore it.',
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    case 'GUARDIAN_ENABLED': {
      const nextCheckIn = data.metadata?.nextCheckInDue
        ? new Date(data.metadata.nextCheckInDue).toLocaleString()
        : 'soon';

      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">Guardian Mode is now active</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">${data.message}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          Guardian Mode will send you scheduled wellness check-in reminders. If you miss multiple
          check-ins and meet certain criteria, your emergency contact may be notified.
        </p>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;">
          <tr>
            <td style="background-color:#f0fdf4;border-left:4px solid #22c55e;padding:12px 16px;border-radius:4px;">
              <p style="margin:0;font-size:13px;color:#166534;">
                Your next check-in is scheduled for <strong>${nextCheckIn}</strong>.
              </p>
            </td>
          </tr>
        </table>
        ${primaryButton(`${appUrl}/guardian`, 'Manage Guardian Mode')}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          You can
          <a href="${deactivateUrl}" style="color:#4f46e5;text-decoration:none;">deactivate Guardian Mode</a>
          at any time from your settings.
        </p>`;

      return {
        subject: 'Guardian Mode has been enabled on your account',
        htmlBody: htmlWrapper('Guardian Mode Enabled', body, standardFooter(appUrl, deactivateUrl)),
        textBody: [
          `Hi ${name},`,
          '',
          data.message,
          '',
          'Guardian Mode will send you scheduled wellness check-in reminders.',
          'If you miss multiple check-ins and meet certain criteria, your emergency contact may be notified.',
          '',
          `Your next check-in is scheduled for: ${nextCheckIn}`,
          '',
          `Manage Guardian Mode: ${appUrl}/guardian`,
          `Deactivate Guardian Mode: ${deactivateUrl}`,
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    case 'GUARDIAN_DISABLED': {
      const body = `
        <h1 style="margin:0 0 8px;font-size:22px;color:#1a1a2e;">Guardian Mode has been deactivated</h1>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">${data.message}</p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          Guardian Mode has been successfully disabled on your account. You will no longer receive
          check-in reminders, and your emergency contacts will not be notified.
        </p>
        <p style="margin:0 0 16px;font-size:15px;color:#444444;">
          If you disabled this by mistake or would like to re-enable it in the future, you can do so
          from your Mental Wellness settings at any time.
        </p>
        ${primaryButton(`${appUrl}/guardian`, 'Re-enable Guardian Mode')}
        <p style="margin:16px 0 0;font-size:13px;color:#888888;">
          If you did not make this change, please
          <a href="${appUrl}/support" style="color:#4f46e5;text-decoration:none;">contact support</a>
          immediately.
        </p>`;

      return {
        subject: 'Guardian Mode has been disabled on your account',
        htmlBody: htmlWrapper('Guardian Mode Disabled', body, `
          <p style="margin:0 0 8px;font-size:12px;color:#888888;">
            This is a confirmation that Guardian Mode was deactivated on your Nebula AI account.
          </p>
          <p style="margin:0;font-size:11px;color:#aaaaaa;">
            Nebula AI &mdash; Mental Wellness Platform
          </p>`),
        textBody: [
          `Hi ${name},`,
          '',
          data.message,
          '',
          'Guardian Mode has been successfully disabled on your account.',
          'You will no longer receive check-in reminders, and your emergency contacts will not be notified.',
          '',
          'If you disabled this by mistake, you can re-enable it from your Mental Wellness settings.',
          '',
          `Re-enable Guardian Mode: ${appUrl}/guardian`,
          '',
          `If you did not make this change, contact support: ${appUrl}/support`,
        ].join('\n'),
      };
    }

    // -----------------------------------------------------------------------
    default:
      return {
        subject: 'Nebula AI Notification',
        htmlBody: htmlWrapper('Notification', `
          <p style="margin:0 0 16px;font-size:15px;color:#444444;">Hi ${name},</p>
          <p style="margin:0;font-size:15px;color:#444444;">${data.message}</p>`,
          `<p style="margin:0;font-size:11px;color:#aaaaaa;">Nebula AI &mdash; Mental Wellness Platform</p>`),
        textBody: `Hi ${name},\n\n${data.message}`,
      };
  }
}
