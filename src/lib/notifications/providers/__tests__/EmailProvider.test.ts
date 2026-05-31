/**
 * EmailProvider Unit Tests — Task 6.1.3
 *
 * Validates: Requirements 2.5
 *
 * Covers:
 * - isAvailable() returns false when env vars are missing
 * - isAvailable() returns true when all required env vars are set
 * - send() returns error when no email address provided
 * - send() returns error when provider not configured
 * - send() calls SES with correct parameters for each notification type
 * - send() returns success on successful SES response
 * - send() returns error with message on SES failure
 * - Correct subject line per notification type
 * - Correct recipient email is used
 */

import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { EmailProvider } from '../EmailProvider';
import type { NotificationRequest } from '../../types';

// ---------------------------------------------------------------------------
// Mock AWS SES SDK
// ---------------------------------------------------------------------------

jest.mock('@aws-sdk/client-ses', () => {
  const mockSend = jest.fn();
  const MockSESClient = jest.fn().mockImplementation(() => ({ send: mockSend }));
  const MockSendEmailCommand = jest.fn().mockImplementation((input) => ({ input }));
  return {
    SESClient: MockSESClient,
    SendEmailCommand: MockSendEmailCommand,
    __mockSend: mockSend,
  };
});

// Grab the mock send function for assertions
const { __mockSend: mockSesSend } = jest.requireMock('@aws-sdk/client-ses') as {
  __mockSend: jest.Mock;
  SESClient: jest.Mock;
  SendEmailCommand: jest.Mock;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const REQUIRED_ENV = {
  AWS_ACCESS_KEY_ID: 'test-key-id',
  AWS_SECRET_ACCESS_KEY: 'test-secret-key',
  AWS_SES_FROM_EMAIL: 'noreply@nebula-ai.com',
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
      email: 'user@example.com',
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
  clearEnv('AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY', 'AWS_SES_FROM_EMAIL', 'AWS_SES_FROM_NAME', 'AWS_SES_REGION', 'AWS_REGION');
});

// ---------------------------------------------------------------------------
// isAvailable()
// ---------------------------------------------------------------------------

describe('EmailProvider.isAvailable()', () => {
  it('returns false when all env vars are missing', () => {
    const provider = new EmailProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only AWS_ACCESS_KEY_ID is set', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'key' });
    const provider = new EmailProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are set', () => {
    setEnv({ AWS_ACCESS_KEY_ID: 'key', AWS_SECRET_ACCESS_KEY: 'secret' });
    const provider = new EmailProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns false when only AWS_SES_FROM_EMAIL is set', () => {
    setEnv({ AWS_SES_FROM_EMAIL: 'noreply@nebula-ai.com' });
    const provider = new EmailProvider();
    expect(provider.isAvailable()).toBe(false);
  });

  it('returns true when all required env vars are set', () => {
    setEnv(REQUIRED_ENV);
    const provider = new EmailProvider();
    expect(provider.isAvailable()).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// send() — guard conditions
// ---------------------------------------------------------------------------

describe('EmailProvider.send() — guard conditions', () => {
  it('returns error when no email address is provided', async () => {
    setEnv(REQUIRED_ENV);
    const provider = new EmailProvider();
    const req = makeRequest({
      recipient: { type: 'USER', userId: 'user-123' },
    });
    const result = await provider.send(req);
    expect(result.success).toBe(false);
    expect(result.provider).toBe('EmailProvider');
    expect(result.error).toMatch(/no email/i);
  });

  it('returns error when provider is not configured (missing env vars)', async () => {
    // No env vars set
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.provider).toBe('EmailProvider');
    expect(result.error).toMatch(/not configured/i);
  });

  it('does not call SES when no email address is provided', async () => {
    setEnv(REQUIRED_ENV);
    const provider = new EmailProvider();
    const req = makeRequest({ recipient: { type: 'USER', userId: 'user-123' } });
    await provider.send(req);
    expect(mockSesSend).not.toHaveBeenCalled();
  });

  it('does not call SES when provider is not configured', async () => {
    const provider = new EmailProvider();
    await provider.send(makeRequest());
    expect(mockSesSend).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// send() — successful SES delivery
// ---------------------------------------------------------------------------

describe('EmailProvider.send() — successful delivery', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockSesSend.mockResolvedValue({ MessageId: 'msg-abc-123' });
  });

  it('returns success=true on successful SES response', async () => {
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(true);
    expect(result.provider).toBe('EmailProvider');
    expect(result.error).toBeUndefined();
  });

  it('returns a valid ISO timestamp', async () => {
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it('calls SES send exactly once per request', async () => {
    const provider = new EmailProvider();
    await provider.send(makeRequest());
    expect(mockSesSend).toHaveBeenCalledTimes(1);
  });

  it('sends to the correct recipient email address', async () => {
    const provider = new EmailProvider();
    await provider.send(makeRequest({ recipient: { type: 'USER', email: 'specific@example.com' } }));

    const commandArg = (SendEmailCommand as jest.Mock).mock.calls[0][0];
    expect(commandArg.Destination.ToAddresses).toEqual(['specific@example.com']);
  });

  it('uses the configured from email as Source', async () => {
    setEnv({ ...REQUIRED_ENV, AWS_SES_FROM_NAME: 'Nebula AI' });
    const provider = new EmailProvider();
    await provider.send(makeRequest());

    const commandArg = (SendEmailCommand as jest.Mock).mock.calls[0][0];
    expect(commandArg.Source).toContain('noreply@nebula-ai.com');
  });
});

// ---------------------------------------------------------------------------
// send() — SES failure
// ---------------------------------------------------------------------------

describe('EmailProvider.send() — SES failure', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
  });

  it('returns error with message on SES failure', async () => {
    mockSesSend.mockRejectedValue(new Error('SES quota exceeded'));
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.provider).toBe('EmailProvider');
    expect(result.error).toMatch(/SES quota exceeded/);
  });

  it('prefixes error with "AWS SES error:"', async () => {
    mockSesSend.mockRejectedValue(new Error('InvalidParameterValue'));
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(result.error).toMatch(/^AWS SES error:/);
  });

  it('handles non-Error thrown values gracefully', async () => {
    mockSesSend.mockRejectedValue('string error');
    const provider = new EmailProvider();
    const result = await provider.send(makeRequest());
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/Unknown error/);
  });
});

// ---------------------------------------------------------------------------
// send() — correct subject per notification type
// ---------------------------------------------------------------------------

describe('EmailProvider.send() — subject lines per notification type', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockSesSend.mockResolvedValue({ MessageId: 'msg-123' });
  });

  const cases: Array<[NotificationRequest['payload']['type'], string]> = [
    ['CHECKIN_REMINDER', 'Guardian Mode: Time for your wellness check-in'],
    ['ESCALATION_WARNING', 'Guardian Mode: Missed check-in — please respond'],
    ['EMERGENCY_ALERT', 'Guardian Mode: Wellness check-in alert'],
    ['CONTACT_VERIFICATION', 'Guardian Mode: Verify your emergency contact role'],
    ['GUARDIAN_ENABLED', 'Guardian Mode has been enabled on your account'],
    ['GUARDIAN_DISABLED', 'Guardian Mode has been disabled on your account'],
  ];

  it.each(cases)('uses correct subject for %s', async (type, expectedSubject) => {
    const provider = new EmailProvider();
    const req = makeRequest({
      payload: { userId: 'user-123', type, message: `Test message for ${type}` },
    });
    await provider.send(req);

    const commandArg = (SendEmailCommand as jest.Mock).mock.calls[0][0];
    expect(commandArg.Message.Subject.Data).toContain(expectedSubject);
  });
});

// ---------------------------------------------------------------------------
// send() — SES command parameters per notification type
// ---------------------------------------------------------------------------

describe('EmailProvider.send() — SES command parameters', () => {
  beforeEach(() => {
    setEnv(REQUIRED_ENV);
    mockSesSend.mockResolvedValue({ MessageId: 'msg-123' });
  });

  const notificationTypes: NotificationRequest['payload']['type'][] = [
    'CHECKIN_REMINDER',
    'ESCALATION_WARNING',
    'EMERGENCY_ALERT',
    'CONTACT_VERIFICATION',
    'GUARDIAN_ENABLED',
    'GUARDIAN_DISABLED',
  ];

  it.each(notificationTypes)('sends valid SES command for %s', async (type) => {
    const provider = new EmailProvider();
    const req = makeRequest({
      payload: { userId: 'user-123', type, message: `Message for ${type}` },
    });
    await provider.send(req);

    expect(mockSesSend).toHaveBeenCalledTimes(1);
    const commandArg = (SendEmailCommand as jest.Mock).mock.calls[0][0];

    // Destination
    expect(commandArg.Destination.ToAddresses).toEqual(['user@example.com']);

    // Subject
    expect(commandArg.Message.Subject.Data).toBeTruthy();
    expect(commandArg.Message.Subject.Charset).toBe('UTF-8');

    // HTML body
    expect(commandArg.Message.Body.Html.Data).toBeTruthy();
    expect(commandArg.Message.Body.Html.Charset).toBe('UTF-8');

    // Text body
    expect(commandArg.Message.Body.Text.Data).toBeTruthy();
    expect(commandArg.Message.Body.Text.Charset).toBe('UTF-8');
  });

  it('passes the recipient email as the sole ToAddress', async () => {
    const provider = new EmailProvider();
    const req = makeRequest({
      recipient: { type: 'EMERGENCY_CONTACT', contactId: 'c-1', email: 'contact@example.com', name: 'Bob' },
      payload: { userId: 'user-123', type: 'EMERGENCY_ALERT', message: 'Please check on them.' },
    });
    await provider.send(req);

    const commandArg = (SendEmailCommand as jest.Mock).mock.calls[0][0];
    expect(commandArg.Destination.ToAddresses).toEqual(['contact@example.com']);
  });
});
