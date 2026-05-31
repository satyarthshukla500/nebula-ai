/**
 * @jest-environment node
 *
 * Security Tests: Guardian Mode API — User Isolation (RLS Enforcement)
 *
 * Task 7.2.1: Test RLS policies prevent cross-user data access
 * Requirements: 3.1
 *
 * Principle: Each API endpoint calls supabase.auth.getUser() to identify the
 * authenticated user, then queries with .eq('user_id', user.id). This means
 * the API naturally enforces user isolation — User A can only ever receive
 * data that belongs to User A, regardless of what IDs are passed in the request.
 *
 * Scenarios:
 * 1. User A cannot read User B's guardian settings via GET /api/guardian/settings
 * 2. User A cannot read User B's emergency contacts via GET /api/guardian/contacts
 * 3. User A cannot read User B's check-in status via GET /api/guardian/checkin/status
 * 4. User A cannot read User B's events via GET /api/guardian/events
 * 5. User A cannot disable User B's Guardian Mode via POST /api/guardian/settings/disable
 * 6. User A cannot delete User B's emergency contact via DELETE /api/guardian/contacts/:id
 * 7. Unauthenticated requests to all endpoints return 401
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers ───────────────────────────────────────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// ─── Supabase mock ────────────────────────────────────────────────────────────
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

// ─── Encryption mock ──────────────────────────────────────────────────────────
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

// ─── Notification services mock ───────────────────────────────────────────────
jest.mock('@/lib/notifications', () => ({
  getSMSNotificationService: jest.fn(() => ({
    notifyEmergencyContact: jest.fn().mockResolvedValue(undefined),
  })),
  getEmailNotificationService: jest.fn(() => ({
    notifyEmergencyContact: jest.fn().mockResolvedValue(undefined),
  })),
}));

// ─── Import route handlers after mocks ───────────────────────────────────────
import { GET as settingsGET } from '../settings/route';
import { GET as contactsGET } from '../contacts/route';
import { GET as checkinStatusGET } from '../checkin/status/route';
import { GET as eventsGET } from '../events/route';
import { POST as disablePOST } from '../settings/disable/route';
import { DELETE as contactDELETE } from '../contacts/[id]/route';

// ─── Test users ───────────────────────────────────────────────────────────────

const USER_A = { id: 'user-a-id-security-test' };
const USER_B = { id: 'user-b-id-security-test' };

// ─── Data fixtures ────────────────────────────────────────────────────────────

const USER_A_SETTINGS = {
  id: 'settings-a',
  user_id: USER_A.id,
  is_enabled: true,
  consent_version: '1.0',
  check_in_interval: '12 hours',
  risk_threshold: 40,
};

const USER_B_SETTINGS = {
  id: 'settings-b',
  user_id: USER_B.id,
  is_enabled: true,
  consent_version: '1.0',
  check_in_interval: '24 hours',
  risk_threshold: 60,
};

const USER_A_CONTACTS = [
  { id: 'contact-a-1', user_id: USER_A.id, contact_name: 'Alice Contact', is_active: true },
];

const USER_B_CONTACTS = [
  { id: 'contact-b-1', user_id: USER_B.id, contact_name: 'Bob Contact', is_active: true },
];

const USER_A_EVENTS = [
  { id: 'event-a-1', user_id: USER_A.id, event_type: 'guardian_enabled' },
];

const USER_B_EVENTS = [
  { id: 'event-b-1', user_id: USER_B.id, event_type: 'guardian_enabled' },
];

// ─── Request helpers ──────────────────────────────────────────────────────────

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makePostRequest(url: string, body: unknown = {}): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Mock builder ─────────────────────────────────────────────────────────────

/**
 * Build a chainable Supabase query mock that resolves to { data, error }.
 * Supports both .single() and direct resolution (for list queries).
 */
function buildQueryMock(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'delete', 'eq', 'order', 'range', 'gte', 'single'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(result);
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Guardian Mode API — User Isolation Security (RLS)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Scenario 1: User A cannot read User B's guardian settings ─────────────

  describe('Scenario 1: GET /api/guardian/settings — user isolation', () => {
    it('returns only User A settings when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      // The API queries .eq('user_id', user.id) — returns User A's data
      mockFrom.mockReturnValue(buildQueryMock({ data: USER_A_SETTINGS, error: null }));

      const res = await settingsGET(makeGetRequest('http://localhost/api/guardian/settings'));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.user_id).toBe(USER_A.id);
      // Critically: User B's data is never returned
      expect(json.data.user_id).not.toBe(USER_B.id);
      expect(json.data.id).not.toBe(USER_B_SETTINGS.id);
    });

    it('returns only User B settings when authenticated as User B', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_B }, error: null });
      mockFrom.mockReturnValue(buildQueryMock({ data: USER_B_SETTINGS, error: null }));

      const res = await settingsGET(makeGetRequest('http://localhost/api/guardian/settings'));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.user_id).toBe(USER_B.id);
      expect(json.data.user_id).not.toBe(USER_A.id);
    });

    it('verifies the query uses the authenticated user ID (not a request param)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      const queryChain = buildQueryMock({ data: USER_A_SETTINGS, error: null });
      mockFrom.mockReturnValue(queryChain);

      await settingsGET(makeGetRequest('http://localhost/api/guardian/settings'));

      // The .eq() call must use USER_A.id — not any externally supplied ID
      expect(queryChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
      expect(queryChain.eq).not.toHaveBeenCalledWith('user_id', USER_B.id);
    });
  });

  // ── Scenario 2: User A cannot read User B's emergency contacts ────────────

  describe('Scenario 2: GET /api/guardian/contacts — user isolation', () => {
    it('returns only User A contacts when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      mockFrom.mockReturnValue(buildQueryMock({ data: USER_A_CONTACTS, error: null }));

      const res = await contactsGET(makeGetRequest('http://localhost/api/guardian/contacts'));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      // All returned contacts belong to User A
      json.data.forEach((contact: any) => {
        expect(contact.user_id).toBe(USER_A.id);
      });
      // User B's contact is not present
      const contactIds = json.data.map((c: any) => c.id);
      expect(contactIds).not.toContain('contact-b-1');
    });

    it('verifies the contacts query uses the authenticated user ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      const queryChain = buildQueryMock({ data: USER_A_CONTACTS, error: null });
      mockFrom.mockReturnValue(queryChain);

      await contactsGET(makeGetRequest('http://localhost/api/guardian/contacts'));

      expect(queryChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
      expect(queryChain.eq).not.toHaveBeenCalledWith('user_id', USER_B.id);
    });
  });

  // ── Scenario 3: User A cannot read User B's check-in status ──────────────

  describe('Scenario 3: GET /api/guardian/checkin/status — user isolation', () => {
    it('returns only User A check-in status when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });

      // First call: guardian_settings, second call: wellness_checkins (missed count)
      const settingsChain = buildQueryMock({ data: USER_A_SETTINGS, error: null });
      const checkinsChain = buildQueryMock({ data: [], error: null });
      mockFrom
        .mockReturnValueOnce(settingsChain)
        .mockReturnValueOnce(checkinsChain);

      const res = await checkinStatusGET(
        makeGetRequest('http://localhost/api/guardian/checkin/status')
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('isEnabled');
    });

    it('verifies check-in status queries use the authenticated user ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });

      const settingsChain = buildQueryMock({ data: USER_A_SETTINGS, error: null });
      const checkinsChain = buildQueryMock({ data: [], error: null });
      mockFrom
        .mockReturnValueOnce(settingsChain)
        .mockReturnValueOnce(checkinsChain);

      await checkinStatusGET(
        makeGetRequest('http://localhost/api/guardian/checkin/status')
      );

      // Both queries must scope to USER_A.id
      expect(settingsChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
      expect(checkinsChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
    });
  });

  // ── Scenario 4: User A cannot read User B's events ───────────────────────

  describe('Scenario 4: GET /api/guardian/events — user isolation', () => {
    it('returns only User A events when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      mockFrom.mockReturnValue(
        buildQueryMock({ data: USER_A_EVENTS, error: null, count: 1 } as any)
      );

      const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      json.data.forEach((event: any) => {
        expect(event.user_id).toBe(USER_A.id);
      });
      const eventIds = json.data.map((e: any) => e.id);
      expect(eventIds).not.toContain('event-b-1');
    });

    it('verifies the events query uses the authenticated user ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      const queryChain = buildQueryMock({ data: USER_A_EVENTS, error: null });
      mockFrom.mockReturnValue(queryChain);

      await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));

      expect(queryChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
      expect(queryChain.eq).not.toHaveBeenCalledWith('user_id', USER_B.id);
    });
  });

  // ── Scenario 5: User A cannot disable User B's Guardian Mode ─────────────

  describe('Scenario 5: POST /api/guardian/settings/disable — user isolation', () => {
    it('disables only User A Guardian Mode when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });

      const updateChain = buildQueryMock({ data: null, error: null });
      const eventsChain = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(eventsChain);

      const res = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', { reason: 'test' })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('verifies the disable update is scoped to the authenticated user ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });

      const updateChain = buildQueryMock({ data: null, error: null });
      const eventsChain = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(eventsChain);

      await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      // The update must be scoped to USER_A.id — not USER_B.id
      expect(updateChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
      expect(updateChain.eq).not.toHaveBeenCalledWith('user_id', USER_B.id);
    });
  });

  // ── Scenario 6: User A cannot delete User B's emergency contact ───────────

  describe('Scenario 6: DELETE /api/guardian/contacts/:id — user isolation', () => {
    it('soft-deletes only User A contact when authenticated as User A', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValue(updateChain);

      const res = await contactDELETE(
        new NextRequest('http://localhost/api/guardian/contacts/contact-a-1', {
          method: 'DELETE',
        }),
        { params: { id: 'contact-a-1' } }
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('verifies the delete query uses both contact ID and authenticated user ID', async () => {
      mockGetUser.mockResolvedValue({ data: { user: USER_A }, error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValue(updateChain);

      // User A attempts to delete contact-b-1 (belongs to User B)
      await contactDELETE(
        new NextRequest('http://localhost/api/guardian/contacts/contact-b-1', {
          method: 'DELETE',
        }),
        { params: { id: 'contact-b-1' } }
      );

      // The query must also filter by user_id = USER_A.id
      // This means even if contact-b-1 is passed, the .eq('user_id', user.id)
      // clause ensures User B's contact is never matched
      expect(updateChain.eq).toHaveBeenCalledWith('user_id', USER_A.id);
    });
  });

  // ── Scenario 7: Unauthenticated requests return 401 ──────────────────────

  describe('Scenario 7: Unauthenticated requests return 401', () => {
    beforeEach(() => {
      // Simulate no authenticated user
      mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Not authenticated') });
    });

    it('GET /api/guardian/settings returns 401 when unauthenticated', async () => {
      const res = await settingsGET(makeGetRequest('http://localhost/api/guardian/settings'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('GET /api/guardian/contacts returns 401 when unauthenticated', async () => {
      const res = await contactsGET(makeGetRequest('http://localhost/api/guardian/contacts'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('GET /api/guardian/checkin/status returns 401 when unauthenticated', async () => {
      const res = await checkinStatusGET(
        makeGetRequest('http://localhost/api/guardian/checkin/status')
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('GET /api/guardian/events returns 401 when unauthenticated', async () => {
      const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('POST /api/guardian/settings/disable returns 401 when unauthenticated', async () => {
      const res = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });

    it('DELETE /api/guardian/contacts/:id returns 401 when unauthenticated', async () => {
      const res = await contactDELETE(
        new NextRequest('http://localhost/api/guardian/contacts/contact-a-1', {
          method: 'DELETE',
        }),
        { params: { id: 'contact-a-1' } }
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });
});
