/**
 * Notification Delivery Tests — Task 4.3.9
 *
 * Covers:
 * - In-app (ConsoleProvider) delivery
 * - Email delivery (stub behaviour)
 * - SMS delivery (stub behaviour)
 * - Push delivery (stub behaviour — no subscription → graceful failure)
 * - Retry logic (3 attempts on primary provider failure)
 * - Fallback logic (SMS fails → email)
 * - Consistent NotificationResult shape across all providers
 */

import { ConsoleProvider } from '../providers/ConsoleProvider';
import { EmailProvider } from '../providers/EmailProvider';
import { SMSProvider } from '../providers/SMSProvider';
import { PushProvider } from '../providers/PushProvider';
import { NotificationService } from '../NotificationService';
import { createNotificationService } from '../index';
import type {
  NotificationRequest,
  NotificationResult,
  NotificationProvider,
} from '../types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(overrides: Partial<NotificationRequest> = {}): NotificationRequest {
  return {
    recipient: {
      type: 'USER',
      userId: 'user-123',
      email: 'test@example.com',
      phone: '+15550001234',
    },
    payload: {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Time for your wellness check-in.',
    },
    ...overrides,
  };
}

/** Provider that always fails (used to test retry / fallback). */
class AlwaysFailProvider implements NotificationProvider {
  readonly name = 'AlwaysFailProvider';
  public callCount = 0;

  async send(_request: NotificationRequest): Promise<NotificationResult> {
    this.callCount++;
    return {
      success: false,
      provider: this.name,
      timestamp: new Date().toISOString(),
      error: 'Simulated failure',
    };
  }

  isAvailable(): boolean {
    return true;
  }
}

/** Provider that succeeds on the Nth call. */
class SucceedOnNthCallProvider implements NotificationProvider {
  readonly name = 'SucceedOnNthCallProvider';
  public callCount = 0;

  constructor(private readonly succeedOnCall: number) {}

  async send(_request: NotificationRequest): Promise<NotificationResult> {
    this.callCount++;
    const success = this.callCount >= this.succeedOnCall;
    return {
      success,
      provider: this.name,
      timestamp: new Date().toISOString(),
      error: success ? undefined : 'Not yet',
    };
  }

  isAvailable(): boolean {
    return true;
  }
}

// ---------------------------------------------------------------------------
// Shared result-shape assertion
// ---------------------------------------------------------------------------

function assertResultShape(result: NotificationResult, providerName: string): void {
  expect(typeof result.success).toBe('boolean');
  expect(result.provider).toBe(providerName);
  expect(typeof result.timestamp).toBe('string');
  // timestamp must be a valid ISO date
  expect(() => new Date(result.timestamp)).not.toThrow();
  expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  // error is optional but must be a string when present
  if (result.error !== undefined) {
    expect(typeof result.error).toBe('string');
  }
}

// ---------------------------------------------------------------------------
// ConsoleProvider (in-app)
// ---------------------------------------------------------------------------

describe('ConsoleProvider (in-app notification delivery)', () => {
  const provider = new ConsoleProvider();

  it('is always available', () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns success=true for a valid request', async () => {
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(true);
  });

  it('returns the correct provider name', async () => {
    const result = await provider.send(makeRequest());
    expect(result.provider).toBe('ConsoleProvider');
  });

  it('returns a consistent result shape', async () => {
    const result = await provider.send(makeRequest());
    assertResultShape(result, 'ConsoleProvider');
  });

  it('handles emergency-contact recipient type', async () => {
    const req = makeRequest({
      recipient: {
        type: 'EMERGENCY_CONTACT',
        contactId: 'contact-abc',
        email: 'contact@example.com',
        name: 'Jane Doe',
      },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(true);
    assertResultShape(result, 'ConsoleProvider');
  });
});

// ---------------------------------------------------------------------------
// EmailProvider (stub)
// ---------------------------------------------------------------------------

describe('EmailProvider (stub email delivery)', () => {
  const provider = new EmailProvider();

  it('is available only when AWS SES credentials are configured', () => {
    // In the test environment, AWS credentials are not set, so isAvailable() returns false
    const hasCredentials =
      !!process.env.AWS_ACCESS_KEY_ID &&
      !!process.env.AWS_SECRET_ACCESS_KEY &&
      !!process.env.AWS_SES_FROM_EMAIL;
    expect(provider.isAvailable()).toBe(hasCredentials);
  });

  it('returns success=false when credentials are not configured', async () => {
    // In test environment, credentials are absent — provider should report not configured
    if (provider.isAvailable()) {
      // Skip this assertion when real credentials are present
      return;
    }
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns success=false when no email is provided', async () => {
    const req = makeRequest({
      recipient: { type: 'USER', userId: 'user-123' },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no email/i);
  });

  it('returns the correct provider name', async () => {
    const result = await provider.send(makeRequest());
    expect(result.provider).toBe('EmailProvider');
  });

  it('returns a consistent result shape', async () => {
    const result = await provider.send(makeRequest());
    assertResultShape(result, 'EmailProvider');
  });
});

// ---------------------------------------------------------------------------
// SMSProvider (Twilio-backed)
// ---------------------------------------------------------------------------

describe('SMSProvider (Twilio SMS delivery)', () => {
  const provider = new SMSProvider();

  it('is available only when Twilio credentials are configured', () => {
    // In the test environment, Twilio credentials are not set, so isAvailable() returns false
    const hasCredentials =
      !!process.env.TWILIO_ACCOUNT_SID &&
      !!process.env.TWILIO_AUTH_TOKEN &&
      !!process.env.TWILIO_FROM_NUMBER;
    expect(provider.isAvailable()).toBe(hasCredentials);
  });

  it('returns success=false when credentials are not configured', async () => {
    // In test environment, credentials are absent — provider should report not configured
    if (provider.isAvailable()) {
      // Skip this assertion when real credentials are present
      return;
    }
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/not configured/i);
  });

  it('returns success=false when no phone is provided', async () => {
    const req = makeRequest({
      recipient: { type: 'USER', userId: 'user-123', email: 'test@example.com' },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no phone/i);
  });

  it('returns the correct provider name', async () => {
    const result = await provider.send(makeRequest());
    expect(result.provider).toBe('SMSProvider');
  });

  it('returns a consistent result shape', async () => {
    const result = await provider.send(makeRequest());
    assertResultShape(result, 'SMSProvider');
  });
});

// ---------------------------------------------------------------------------
// PushProvider (stub — no subscription stored)
// ---------------------------------------------------------------------------

describe('PushProvider (stub push delivery)', () => {
  const provider = new PushProvider();

  it('is available (stub always returns true)', () => {
    expect(provider.isAvailable()).toBe(true);
  });

  it('returns success=false when no push subscription exists (graceful fallback)', async () => {
    // The stub getPushSubscription always returns undefined
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no push subscription/i);
  });

  it('returns success=false when no userId is provided', async () => {
    const req = makeRequest({
      recipient: { type: 'USER' },
      payload: {
        userId: '',
        type: 'CHECKIN_REMINDER',
        message: 'Check in now.',
      },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/no userid/i);
  });

  it('returns the correct provider name', async () => {
    const result = await provider.send(makeRequest());
    expect(result.provider).toBe('PushProvider');
  });

  it('returns a consistent result shape', async () => {
    const result = await provider.send(makeRequest());
    assertResultShape(result, 'PushProvider');
  });
});

// ---------------------------------------------------------------------------
// Retry logic — 3 attempts on primary provider failure
// ---------------------------------------------------------------------------

describe('NotificationService retry logic', () => {
  it('retries exactly 3 times before giving up', async () => {
    const failProvider = new AlwaysFailProvider();
    const service = new NotificationService({
      provider: failProvider,
      retryAttempts: 3,
      retryDelayMs: 0, // no delay in tests
    });

    const result = await service.notifyUser('user-123', {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Test',
    });

    expect(result.success).toBe(false);
    expect(failProvider.callCount).toBe(3);
  });

  it('succeeds on the 3rd attempt without reaching fallback', async () => {
    const provider = new SucceedOnNthCallProvider(3);
    const service = new NotificationService({
      provider,
      retryAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await service.notifyUser('user-123', {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Test',
    });

    expect(result.success).toBe(true);
    expect(provider.callCount).toBe(3);
  });

  it('returns a consistent result shape on failure', async () => {
    const failProvider = new AlwaysFailProvider();
    const service = new NotificationService({
      provider: failProvider,
      retryAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await service.notifyUser('user-123', {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Test',
    });

    expect(typeof result.success).toBe('boolean');
    expect(typeof result.provider).toBe('string');
    expect(typeof result.timestamp).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// Fallback logic — SMS fails → email
// ---------------------------------------------------------------------------

describe('NotificationService fallback logic (SMS fails → email)', () => {
  it('uses fallback provider when primary fails all retries', async () => {
    const smsProvider = new AlwaysFailProvider();
    const emailProvider = new ConsoleProvider(); // always succeeds

    const service = new NotificationService({
      provider: smsProvider,
      fallbackProvider: emailProvider,
      retryAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await service.notifyUser(
      'user-123',
      { userId: 'user-123', type: 'ESCALATION_WARNING', message: 'Missed check-in' },
      'user@example.com',
      '+15550001234'
    );

    expect(result.success).toBe(true);
    expect(result.provider).toBe('ConsoleProvider');
  });

  it('does not call fallback when primary succeeds', async () => {
    const primaryProvider = new ConsoleProvider();
    const fallbackProvider = new AlwaysFailProvider();

    const service = new NotificationService({
      provider: primaryProvider,
      fallbackProvider: fallbackProvider,
      retryAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await service.notifyUser('user-123', {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Test',
    });

    expect(result.success).toBe(true);
    expect(fallbackProvider.callCount).toBe(0);
  });

  it('returns failure when both primary and fallback fail', async () => {
    const primary = new AlwaysFailProvider();
    const fallback = new AlwaysFailProvider();

    const service = new NotificationService({
      provider: primary,
      fallbackProvider: fallback,
      retryAttempts: 3,
      retryDelayMs: 0,
    });

    const result = await service.notifyUser('user-123', {
      userId: 'user-123',
      type: 'EMERGENCY_ALERT',
      message: 'Test',
    });

    expect(result.success).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Consistent result shape across all notification types
// ---------------------------------------------------------------------------

describe('Consistent NotificationResult shape across all notification types', () => {
  const notificationTypes = [
    'CHECKIN_REMINDER',
    'ESCALATION_WARNING',
    'EMERGENCY_ALERT',
    'CONTACT_VERIFICATION',
    'GUARDIAN_ENABLED',
    'GUARDIAN_DISABLED',
  ] as const;

  const provider = new ConsoleProvider();

  it.each(notificationTypes)(
    'returns a valid result shape for notification type: %s',
    async (type) => {
      const req = makeRequest({
        payload: {
          userId: 'user-123',
          type,
          message: `Test message for ${type}`,
        },
      });
      const result = await provider.send(req);
      assertResultShape(result, 'ConsoleProvider');
    }
  );
});

// ---------------------------------------------------------------------------
// createNotificationService factory
// ---------------------------------------------------------------------------

describe('createNotificationService factory', () => {
  it('creates a service with the given provider', async () => {
    const provider = new ConsoleProvider();
    const service = createNotificationService(provider);
    expect(service.getProviderName()).toBe('ConsoleProvider');
  });

  it('notifyEmergencyContact returns a valid result', async () => {
    const service = createNotificationService(new ConsoleProvider());
    const result = await service.notifyEmergencyContact(
      'contact-abc',
      { userId: 'user-123', type: 'EMERGENCY_ALERT', message: 'Please check on them.' },
      'contact@example.com',
      '+15550009999',
      'Jane Doe'
    );
    expect(result.success).toBe(true);
    assertResultShape(result, 'ConsoleProvider');
  });
});
