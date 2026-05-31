/**
 * SMSProvider Unit Tests — Task 6.2.3
 *
 * Validates: Requirements 2.5
 *
 * Covers:
 * - isAvailable() returns false when env vars are missing
 * - isAvailable() returns true when all required env vars are set
 * - send() returns error when no phone number provided
 * - send() returns error when provider not configured
 * - send() calls Twilio with correct parameters for each notification type
 * - send() returns success on successful Twilio response
 * - send() returns error with message on Twilio failure
 * - Correct message body per notification type (TCPA opt-out in EMERGENCY_ALERT)
 * - Correct recipient phone is used
 * - All SMS messages are ≤160 characters
 */

import { SMSProvider } from '../SMSProvider';
import type { NotificationRequest } from '../../types';

// ---------------------------------------------------------------------------
// Mock Twilio SDK
// ---------------------------------------------------------------------------

const mockMessagesCreate = jest.fn();

jest.mock('twilio', () => {
  return jest.fn().mockImplementation(() => ({
    messages: {
      create: mockMessagesCreate,
    },
  }));
});

const mockTwilio = jest.requireMock('twilio') as jest.Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_ENV = {
  TWILIO_ACCOUNT_SID: 'ACtest123',
  TWILIO_AUTH_TOKEN: 'auth-token-test',
  TWILIO_FROM_NUMBER: '+15550000000',
};

function setEnv(vars: Record<string, string>): void {
  Object.entries(vars).forEach(([k, v]) => {
    process.env[k] = v;
  });
}

function clearEnv(...keys: string[]): void {
  keys.forEach((k) => delete process.env[k]);
}

function makeRequest(overrides: Partial<NotificationRequest> = {}): NotificationRequest {
  return {
    recipient: {
      type: 'USER',
      userId: 'user-123',
      phone: '+15551234567',
      name: 'Alice',
    },
    payload: {
      userId: 'user-123',
      type: 'CHECKIN_REMINDER',
      message: 'Time for your wellness check-in.',
    },
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup / teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
  clearEnv('TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'TWILIO_FROM_NUMBER');
});

// ---------------------------------------------------------------------------
// isAvailable()
// ---------------------------------------------------------------------------

describe('SMSProvider.isAvailable()', () => {
  it('returns false when all env vars are missing', () => {
    const provider = new SMSProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only TWILIO_ACCOUNT_SID is set', () => {
    setEnv({ TWILIO_ACCOUNT_SID: 'ACtest' });
    const provider = new SMSProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN are set', () => {
    setEnv({ TWILIO_ACCOUNT_SID: 'ACtest', TWILIO_AUTH_TOKEN: 'token' });
    const provider = new SMSProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only TWILIO_FROM_NUMBER is set', () => {
    setEnv({ TWILIO_FROM_NUMBER: '+15550000000' });
    const provider = new SMSProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns true when all required env vars are set', () => {
    setEnv(REQUIRED_ENV);
    const provider = new SMSProvider();
    expect(provider.isAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// send() — guard conditions
// ---------------------------------------------------------------------------

describe('SMSProvider.send() — guard conditions', () => {
  it('returns error when no phone number is provided', async () => {
    setEnv(REQUIRED_ENV);
    const provider = new SMSProvider();
    const req = makeRequest({
      recipient: { type: 'USER', userId: 'user-123' },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(false);
    expect(result.provider).toBe('SMSProvider');
    expect(result.error).toMatch(/no phone/i);
  });

  it('returns error when provider is not configured (missing env vars)', async () => {
    // No env vars set
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.provider).toBe('SMSProvider');
    expect(result.error).toMatch(/not configured/i);
  });

  it('does not call Twilio when no phone number is provided', async () => {
    setEnv(REQUIRED_ENV);
    const provider = new SMSProvider();
    const req = makeRequest({ recipient: { type: 'USER', userId: 'user-123' } });
    await provider.send(req);
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });

  it('does not call Twilio when provider is not configured', async () => {
    const provider = new SMSProvider();
    await provider.send(makeRequest());
    expect(mockMessagesCreate).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send() — successful Twilio delivery
// ---------------------------------------------------------------------------

describe('SMSProvider.send() — successful delivery', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockMessagesCreate.mockResolvedValue({ sid: 'SM123abc' });
  });

  it('returns success=true on successful Twilio response', async () => {
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(true);
    expect(result.provider).toBe('SMSProvider');
    expect(result.error).toBeUndefined();
  });

  it('returns a valid ISO timestamp', async () => {
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('calls Twilio messages.create exactly once per request', async () => {
    const provider = new SMSProvider();
    await provider.send(makeRequest());
    expect(mockMessagesCreate).toHaveBeenCalledTimes(1);
  });

  it('sends to the correct recipient phone number', async () => {
    const provider = new SMSProvider();
    await provider.send(makeRequest({ recipient: { type: 'USER', phone: '+15559876543' } }));
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ to: '+15559876543' })
    );
  });

  it('sends from the configured TWILIO_FROM_NUMBER', async () => {
    const provider = new SMSProvider();
    await provider.send(makeRequest());
    expect(mockMessagesCreate).toHaveBeenCalledWith(
      expect.objectContaining({ from: '+15550000000' })
    );
  });

  it('initialises the Twilio client with the correct credentials', async () => {
    const provider = new SMSProvider();
    await provider.send(makeRequest());
    expect(mockTwilio).toHaveBeenCalledWith('ACtest123', 'auth-token-test');
  });
});

// ---------------------------------------------------------------------------
// send() — Twilio failure
// ---------------------------------------------------------------------------

describe('SMSProvider.send() — Twilio failure', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
  });

  it('returns error with message on Twilio failure', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('Twilio quota exceeded'));
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.provider).toBe('SMSProvider');
    expect(result.error).toMatch(/Twilio quota exceeded/);
  });

  it('prefixes error with "Twilio error:"', async () => {
    mockMessagesCreate.mockRejectedValue(new Error('InvalidPhoneNumber'));
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(result.error).toMatch(/^Twilio error:/);
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockMessagesCreate.mockRejectedValue('string error');
    const provider = new SMSProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown error/);
  });
});

// ---------------------------------------------------------------------------
// send() — correct message body per notification type
// ---------------------------------------------------------------------------

describe('SMSProvider.send() — message body per notification type', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockMessagesCreate.mockResolvedValue({ sid: 'SM123' });
  });

  const notificationTypes: NotificationRequest['payload']['type'][] = [
    'CHECKIN_REMINDER',
    'ESCALATION_WARNING',
    'EMERGENCY_ALERT',
    'CONTACT_VERIFICATION',
    'GUARDIAN_ENABLED',
    'GUARDIAN_DISABLED',
  ];

  it.each(notificationTypes)('sends a non-empty body for %s', async (type) => {
    const provider = new SMSProvider();
    const req = makeRequest({
      payload: { userId: 'user-123', type, message: `Test message for ${type}` },
    });
    await provider.send(req);

    const callArg = mockMessagesCreate.mock.calls[0][0];
    expect(callArg.body).toBeTruthy();
    expect(typeof callArg.body).toBe('string');
  });

  it('includes TCPA opt-out text in EMERGENCY_ALERT body', async () => {
    const provider = new SMSProvider();
    const req = makeRequest({
      recipient: { type: 'EMERGENCY_CONTACT', contactId: 'c-1', phone: '+15559990000', name: 'Bob' },
      payload: {
        userId: 'user-123',
        type: 'EMERGENCY_ALERT',
        message: 'Please check on them.',
        metadata: { userName: 'Alice', optOutUrl: 'https://nebula-ai.com/guardian/contact-optout' },
      },
    });
    await provider.send(req);

    const callArg = mockMessagesCreate.mock.calls[0][0];
    expect(callArg.body).toMatch(/Reply STOP to opt out/i);
  });

  it('uses the emergency contact phone (not user phone) for EMERGENCY_ALERT', async () => {
    const provider = new SMSProvider();
    const req = makeRequest({
      recipient: { type: 'EMERGENCY_CONTACT', contactId: 'c-1', phone: '+15559990000', name: 'Bob' },
      payload: { userId: 'user-123', type: 'EMERGENCY_ALERT', message: 'Please check on them.' },
    });
    await provider.send(req);

    const callArg = mockMessagesCreate.mock.calls[0][0];
    expect(callArg.to).toBe('+15559990000');
  });
});

// ---------------------------------------------------------------------------
// SMS length constraint — all messages ≤160 characters
// ---------------------------------------------------------------------------

describe('SMSProvider — all messages ≤160 characters', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockMessagesCreate.mockResolvedValue({ sid: 'SM123' });
  });

  const cases: Array<[NotificationRequest['payload']['type'], Partial<NotificationRequest>]> = [
    ['CHECKIN_REMINDER', {}],
    ['ESCALATION_WARNING', {}],
    [
      'EMERGENCY_ALERT',
      {
        recipient: { type: 'EMERGENCY_CONTACT', contactId: 'c-1', phone: '+15559990000', name: 'Bob' },
        payload: {
          userId: 'user-123',
          type: 'EMERGENCY_ALERT',
          message: 'Please check on them.',
          metadata: { userName: 'Alice', optOutUrl: 'https://nebula-ai.com/guardian/contact-optout' },
        },
      },
    ],
    [
      'CONTACT_VERIFICATION',
      {
        payload: { userId: 'user-123', type: 'CONTACT_VERIFICATION', message: '', metadata: { otp: '123456' } },
      },
    ],
    ['GUARDIAN_ENABLED', {}],
    ['GUARDIAN_DISABLED', {}],
  ];

  it.each(cases)('body for %s is ≤160 characters', async (type, overrides) => {
    const provider = new SMSProvider();
    const req = makeRequest({
      payload: { userId: 'user-123', type, message: '' },
      ...overrides,
    });
    await provider.send(req);

    const callArg = mockMessagesCreate.mock.calls[0][0];
    expect(callArg.body.length).toBeLessThanOrEqual(160);
  });
});
