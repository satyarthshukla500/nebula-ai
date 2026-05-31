/**
 * @jest-environment node
 *
 * Integration Tests: Guardian Mode Consent Flow
 *
 * Task 7.1.1: Test complete consent flow (enable → contact add → verify → activate)
 * Requirements: 1.1, 2.4
 *
 * Covers:
 * 1. Full happy path: add contact → verify OTP → enable Guardian Mode → verify settings show enabled
 * 2. Cannot enable without any emergency contact
 * 3. Cannot enable with only an unverified contact
 * 4. Enabling after contact verification succeeds
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
  generateOTP: jest.fn(() => '123456'),
  hashVerificationCode: jest.fn(() => 'salt:hashedotp'),
  generateOptOutToken: jest.fn(() => 'opt-out-token-abc'),
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
import { POST as enablePOST } from '../settings/enable/route';
import { GET as settingsGET } from '../settings/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-integration-test' };

const CONTACT_ID = 'contact-integration-1';
const SETTINGS_ID = 'settings-integration-1';

const VALID_ENABLE_BODY = {
  consentVersion: '1.0',
  checkInInterval: '12 hours',
  preferredTimes: ['09:00', '21:00'],
  riskThreshold: 40,
};

// ─── Request helpers ─────────────────────────────────────────────────────────

function makePostRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
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

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Guardian Mode Consent Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
  });

  // ── Scenario 1: Full happy path ──────────────────────────────────────────

  describe('Scenario 1: Full happy path — add contact → verify OTP → enable → confirm active', () => {
    it('Step 1: adds an emergency contact and sends OTP', async () => {
      // No existing contacts (count check)
      const countChain = buildQueryMock({ data: [], error: null });
      // Insert returns new contact
      const insertChain = buildQueryMock({
        data: { id: CONTACT_ID, contact_name: 'Alice', user_id: MOCK_USER.id },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const res = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Alice',
          relationship: 'friend',
          phone: '555-0100',
          email: 'alice@example.com',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.contactId).toBe(CONTACT_ID);
      expect(json.data.verificationSent).toBe(true);
    });

    it('Step 2: verifies the contact via OTP', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const unverifiedContact = {
        id: CONTACT_ID,
        user_id: MOCK_USER.id,
        is_verified: false,
        verification_code: 'salt:hashedotp',
        verification_sent_at: new Date().toISOString(),
      };

      const fetchChain = buildQueryMock({ data: unverifiedContact, error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const res = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '123456',
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
    });

    it('Step 3: enables Guardian Mode after contact is verified', async () => {
      const settingsRecord = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: true,
        consent_version: '1.0',
        check_in_interval: '12 hours',
      };

      let callIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        callIndex++;
        if (table === 'emergency_contacts') {
          // Returns one verified contact
          return buildQueryMock({ data: [{ id: CONTACT_ID }], error: null });
        }
        if (table === 'guardian_settings') {
          if (callIndex === 2) {
            // Check existing settings — none found
            return buildQueryMock({ data: null, error: { code: 'PGRST116' } });
          }
          // Insert new settings
          return buildQueryMock({ data: settingsRecord, error: null });
        }
        // crisis_events insert
        return buildQueryMock({ data: null, error: null });
      });

      const res = await enablePOST(
        makePostRequest('http://localhost/api/guardian/settings/enable', VALID_ENABLE_BODY)
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('settingsId');
      expect(json.data).toHaveProperty('nextCheckInDue');
    });

    it('Step 4: GET /settings confirms Guardian Mode is now active', async () => {
      const activeSettings = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: true,
        consent_version: '1.0',
        check_in_interval: '12 hours',
        preferred_check_in_times: ['09:00', '21:00'],
        risk_threshold: 40,
      };

      mockFrom.mockReturnValue(buildQueryMock({ data: activeSettings, error: null }));

      const res = await settingsGET(
        makeGetRequest('http://localhost/api/guardian/settings')
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).not.toBeNull();
      expect(json.data.is_enabled).toBe(true);
      expect(json.data.consent_version).toBe('1.0');
    });
  });

  // ── Scenario 2: Cannot enable without any emergency contact ─────────────

  describe('Scenario 2: Cannot enable Guardian Mode without any emergency contact', () => {
    it('returns 400 when no contacts exist at all', async () => {
      // emergency_contacts query returns empty array
      mockFrom.mockReturnValue(buildQueryMock({ data: [], error: null }));

      const res = await enablePOST(
        makePostRequest('http://localhost/api/guardian/settings/enable', VALID_ENABLE_BODY)
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/verified emergency contact/i);
    });
  });

  // ── Scenario 3: Cannot enable with only an unverified contact ───────────

  describe('Scenario 3: Cannot enable Guardian Mode with only an unverified contact', () => {
    it('returns 400 when the only contact is not yet verified', async () => {
      // The enable route queries: .eq('is_verified', true).eq('is_active', true)
      // An unverified contact would not appear in this filtered query → empty result
      mockFrom.mockReturnValue(buildQueryMock({ data: [], error: null }));

      const res = await enablePOST(
        makePostRequest('http://localhost/api/guardian/settings/enable', VALID_ENABLE_BODY)
      );

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/verified emergency contact/i);
    });

    it('GET /settings still shows Guardian Mode as disabled (null)', async () => {
      // No settings record exists yet
      mockFrom.mockReturnValue(
        buildQueryMock({ data: null, error: { code: 'PGRST116' } })
      );

      const res = await settingsGET(
        makeGetRequest('http://localhost/api/guardian/settings')
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toBeNull();
    });
  });

  // ── Scenario 4: Enabling after contact verification succeeds ────────────

  describe('Scenario 4: Enabling after contact verification succeeds', () => {
    it('add contact → verify OTP → enable succeeds in sequence', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');

      // --- Step A: Add contact ---
      const countChain = buildQueryMock({ data: [], error: null });
      const insertChain = buildQueryMock({
        data: { id: CONTACT_ID, contact_name: 'Bob', user_id: MOCK_USER.id },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const addRes = await addContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          name: 'Bob',
          relationship: 'sibling',
          phone: '555-0200',
        })
      );
      expect(addRes.status).toBe(200);
      const addJson = await addRes.json();
      expect(addJson.data.contactId).toBe(CONTACT_ID);

      // --- Step B: Verify OTP ---
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const unverifiedContact = {
        id: CONTACT_ID,
        user_id: MOCK_USER.id,
        is_verified: false,
        verification_code: 'salt:hashedotp',
        verification_sent_at: new Date().toISOString(),
      };
      const fetchChain = buildQueryMock({ data: unverifiedContact, error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const verifyRes = await verifyContactPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: CONTACT_ID,
          verificationCode: '123456',
        })
      );
      expect(verifyRes.status).toBe(200);
      const verifyJson = await verifyRes.json();
      expect(verifyJson.verified).toBe(true);

      // --- Step C: Enable Guardian Mode ---
      const settingsRecord = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: true,
      };

      let enableCallIndex = 0;
      mockFrom.mockImplementation((table: string) => {
        enableCallIndex++;
        if (table === 'emergency_contacts') {
          return buildQueryMock({ data: [{ id: CONTACT_ID }], error: null });
        }
        if (table === 'guardian_settings') {
          if (enableCallIndex === 2) {
            return buildQueryMock({ data: null, error: { code: 'PGRST116' } });
          }
          return buildQueryMock({ data: settingsRecord, error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const enableRes = await enablePOST(
        makePostRequest('http://localhost/api/guardian/settings/enable', VALID_ENABLE_BODY)
      );
      expect(enableRes.status).toBe(200);
      const enableJson = await enableRes.json();
      expect(enableJson.success).toBe(true);
      expect(enableJson.data.settingsId).toBe(SETTINGS_ID);

      // --- Step D: Confirm settings show enabled ---
      const activeSettings = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: true,
        consent_version: '1.0',
      };
      mockFrom.mockReturnValue(buildQueryMock({ data: activeSettings, error: null }));

      const settingsRes = await settingsGET(
        makeGetRequest('http://localhost/api/guardian/settings')
      );
      expect(settingsRes.status).toBe(200);
      const settingsJson = await settingsRes.json();
      expect(settingsJson.data.is_enabled).toBe(true);
    });
  });
});
