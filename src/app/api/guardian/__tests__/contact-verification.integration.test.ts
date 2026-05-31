/**
 * @jest-environment node
 *
 * Integration Tests: Emergency Contact Verification Flow
 *
 * Task 7.1.2: Test emergency contact verification flow (add → OTP → verify)
 * Requirements: 1.3
 *
 * Covers:
 * 1. Add contact with phone → OTP sent → verify with correct OTP → contact is verified
 * 2. Add contact with email only → OTP sent → verify with correct OTP → contact is verified
 * 3. Add contact → verify with wrong OTP → returns 400 invalid code
 * 4. Add contact → verify with expired OTP (sent 20+ minutes ago) → returns 400 expired
 * 5. Add contact → verify with correct OTP → try to verify again → already verified returns success
 * 6. Cannot add 4th contact when 3 already exist → 400 limit reached
 * 7. Add contact without phone or email → 400 validation error
 * 8. OTP is not exposed in response (security check)
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers (required by supabase/server) ───────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// ─── Supabase mock ──────────────────────────────────────────────────────────
const mockGetUser = jest.fn();
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() =>
    Promise.resolve({
      auth: { getUser: mockGetUser },
      from: mockFrom,
    })
  ),
}));

// ─── Encryption mock ────────────────────────────────────────────────────────
jest.mock('@/lib/utils/guardian-encryption', () => ({
  encryptContactData: jest.fn((data) => ({
    phone: data.phone ? `enc:${data.phone}` : undefined,
    email: data.email ? `enc:${data.email}` : undefined,
  })),
  decryptContactData: jest.fn((data) => data),
  generateOTP: jest.fn(() => '654321'),
  hashVerificationCode: jest.fn(() => 'salt:hashedotp'),
  generateOptOutToken: jest.fn(() => 'opt-out-token-xyz'),
  verifyCode: jest.fn(),
  decrypt: jest.fn((v: string) => v.replace(/^enc:/, '')),
}));

// ─── Notification services mock ─────────────────────────────────────────────
const mockNotifyEmergencyContact = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/notifications', () => ({
  getSMSNotificationService: jest.fn(() => ({
    notifyEmergencyContact: mockNotifyEmergencyContact,
  })),
  getEmailNotificationService: jest.fn(() => ({
    notifyEmergencyContact: mockNotifyEmergencyContact,
  })),
}));

// ─── Import route handlers after mocks ──────────────────────────────────────
import { POST as addContactPOST } from '../contacts/route';
import { POST as verifyContactPOST } from '../contacts/verify/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-contact-verification-test' };
const CONTACT_ID = 'contact-verify-test-1';

// ─── Request helpers ─────────────────────────────────────────────────────────

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Mock builder helpers ────────────────────────────────────────────────────

/** Build a chainable Supabase query mock that resolves to { data, error } */
function buildQueryMock(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'single'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(result);
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

/** Build a contact record for use in verify tests */
function buildContactRecord(overrides: Record<string, unknown> = {}) {
  return {
    id: CONTACT_ID,
    user_id: MOCK_USER.id,
    is_verified: false,
    verification_code: 'salt:hashedotp',
    verification_sent_at: new Date().toISOString(),
    ...overrides,
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Emergency Contact Verification Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
  });

  // ── Scenario 1: Add contact with phone → OTP sent → verify with correct OTP ─

  describe('Scenario 1: Add contact with phone → OTP sent → verify with correct OTP → contact is verified', () => {
    it('Step 1: adds a contact with phone and sends OTP', async () => {
      const countChain = buildQueryMock({ data: [], error: null });
      const insertChain = buildQueryMock({
        data: { id: CONTACT_ID, contact_name: 'Charlie', user_id: MOCK_USER.id },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Charlie',
          relationship: 'friend',
          phone: '555-1111',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.contactId).toBe(CONTACT_ID);
      expect(json.data.verificationSent).toBe(true);
    });

    it('Step 2: verifies the contact with the correct OTP', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const fetchChain = buildQueryMock({ data: buildContactRecord(), error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '654321',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
    });
  });

  // ── Scenario 2: Add contact with email only → OTP sent → verify ─────────

  describe('Scenario 2: Add contact with email only → OTP sent → verify with correct OTP → contact is verified', () => {
    it('Step 1: adds a contact with email only and sends OTP', async () => {
      const countChain = buildQueryMock({ data: [], error: null });
      const insertChain = buildQueryMock({
        data: { id: CONTACT_ID, contact_name: 'Dana', user_id: MOCK_USER.id },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Dana',
          relationship: 'sibling',
          email: 'dana@example.com',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.contactId).toBe(CONTACT_ID);
      expect(json.data.verificationSent).toBe(true);
    });

    it('Step 2: verifies the email-only contact with the correct OTP', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const fetchChain = buildQueryMock({ data: buildContactRecord(), error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '654321',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
    });
  });

  // ── Scenario 3: Verify with wrong OTP → 400 invalid code ────────────────

  describe('Scenario 3: Add contact → verify with wrong OTP → returns 400 invalid code', () => {
    it('returns 400 when the verification code is incorrect', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(false);

      const fetchChain = buildQueryMock({ data: buildContactRecord(), error: null });
      mockFrom.mockReturnValueOnce(fetchChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '000000',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid verification code/i);
    });
  });

  // ── Scenario 4: Verify with expired OTP → 400 expired ───────────────────

  describe('Scenario 4: Add contact → verify with expired OTP (sent 20+ minutes ago) → returns 400 expired', () => {
    it('returns 400 when the OTP was sent more than 15 minutes ago', async () => {
      const twentyMinutesAgo = new Date(Date.now() - 20 * 60 * 1000).toISOString();

      const fetchChain = buildQueryMock({
        data: buildContactRecord({ verification_sent_at: twentyMinutesAgo }),
        error: null,
      });
      mockFrom.mockReturnValueOnce(fetchChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '654321',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/expired/i);
    });
  });

  // ── Scenario 5: Verify again after already verified → success ───────────

  describe('Scenario 5: Add contact → verify with correct OTP → try to verify again → already verified returns success', () => {
    it('returns success when contact is already verified', async () => {
      const fetchChain = buildQueryMock({
        data: buildContactRecord({ is_verified: true }),
        error: null,
      });
      mockFrom.mockReturnValueOnce(fetchChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '654321',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
      expect(json.message).toMatch(/already verified/i);
    });
  });

  // ── Scenario 6: Cannot add 4th contact when 3 already exist ─────────────

  describe('Scenario 6: Cannot add 4th contact when 3 already exist → 400 limit reached', () => {
    it('returns 400 when 3 contacts already exist', async () => {
      const threeContacts = [
        { id: 'c1' },
        { id: 'c2' },
        { id: 'c3' },
      ];
      const countChain = buildQueryMock({ data: threeContacts, error: null });
      mockFrom.mockReturnValueOnce(countChain);

      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Fourth Contact',
          relationship: 'colleague',
          phone: '555-9999',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/maximum 3/i);
    });
  });

  // ── Scenario 7: Add contact without phone or email → 400 validation ──────

  describe('Scenario 7: Add contact without phone or email → 400 validation error', () => {
    it('returns 400 when neither phone nor email is provided', async () => {
      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'No Contact Method',
          relationship: 'friend',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/phone or email/i);
    });

    it('returns 400 when name is missing', async () => {
      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          relationship: 'friend',
          phone: '555-0000',
        })
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/missing required fields/i);
    });
  });

  // ── Scenario 8: OTP is not exposed in response (security check) ──────────

  describe('Scenario 8: OTP is not exposed in response (security check)', () => {
    it('does not include the raw OTP in the add-contact response in production', async () => {
      const originalEnv = process.env.NODE_ENV;
      // Simulate production environment
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: 'production',
        writable: true,
        configurable: true,
      });

      const countChain = buildQueryMock({ data: [], error: null });
      const insertChain = buildQueryMock({
        data: { id: CONTACT_ID, contact_name: 'Eve', user_id: MOCK_USER.id },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Eve',
          relationship: 'parent',
          phone: '555-2222',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.otp).toBeUndefined();

      // Restore env
      Object.defineProperty(process.env, 'NODE_ENV', {
        value: originalEnv,
        writable: true,
        configurable: true,
      });
    });

    it('does not include the hashed verification_code in the verify response', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const fetchChain = buildQueryMock({ data: buildContactRecord(), error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '654321',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.verification_code).toBeUndefined();
      expect(json.data?.verification_code).toBeUndefined();
    });
  });
});
