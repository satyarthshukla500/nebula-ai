/**
 * @jest-environment node
 *
 * Integration Tests: Guardian Mode Disable Flow
 *
 * Task 7.1.5: Test Guardian Mode disable flow clears active escalations
 * Requirements: 1.1
 *
 * Covers:
 * 1. Disable Guardian Mode → returns success, is_enabled becomes false
 * 2. Disable Guardian Mode → GET /settings shows is_enabled=false
 * 3. Disable Guardian Mode → logs guardian_disabled event to crisis_events
 * 4. Disable Guardian Mode with reason → reason is stored/logged
 * 5. Disable Guardian Mode → subsequent escalation calls return 400 (Guardian Mode not enabled)
 * 6. Disable Guardian Mode → unauthenticated request returns 401
 * 7. Disable Guardian Mode when already disabled → still returns success (idempotent)
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

// ─── Notification services mock ─────────────────────────────────────────────
jest.mock('@/lib/notifications', () => ({
  getNotificationService: jest.fn(() => ({
    notifyUser: jest.fn().mockResolvedValue({ success: true }),
    notifyEmergencyContact: jest.fn().mockResolvedValue({ success: true }),
  })),
  getSMSNotificationService: jest.fn(() => ({
    notifyUser: jest.fn().mockResolvedValue({ success: true }),
    notifyEmergencyContact: jest.fn().mockResolvedValue({ success: true }),
  })),
  getEmailNotificationService: jest.fn(() => ({
    notifyUser: jest.fn().mockResolvedValue({ success: true }),
    notifyEmergencyContact: jest.fn().mockResolvedValue({ success: true }),
  })),
}));

// ─── Risk scoring mock ───────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  shouldEscalate: jest.fn(() => ({ shouldEscalate: false, nextStage: null })),
  updateRiskScoreOnMissedCheckin: jest.fn().mockResolvedValue({ score: 10 }),
}));

// ─── Import route handlers after mocks ──────────────────────────────────────
import { POST as disablePOST } from '../settings/disable/route';
import { GET as settingsGET } from '../settings/route';
import { POST as escalatePOST } from '../escalate/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-disable-test' };
const SETTINGS_ID = 'settings-disable-1';
const SERVICE_KEY = 'test-service-key';

// ─── Request helpers ─────────────────────────────────────────────────────────

function makePostRequest(url: string, body: unknown, headers?: Record<string, string>): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

// ─── Mock builder helpers ────────────────────────────────────────────────────

/** Build a chainable Supabase query mock that resolves to { data, error } */
function buildQueryMock(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'single', 'is', 'lt', 'limit'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(result);
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Guardian Mode Disable Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    // Set service key env var for escalation route tests
    process.env.GUARDIAN_SERVICE_KEY = SERVICE_KEY;
  });

  afterAll(() => {
    delete process.env.GUARDIAN_SERVICE_KEY;
  });

  // ── Scenario 1: Disable returns success and is_enabled becomes false ─────

  describe('Scenario 1: Disable Guardian Mode → returns success, is_enabled becomes false', () => {
    it('returns 200 with success=true and message confirming disable', async () => {
      const updateChain = buildQueryMock({ data: null, error: null });
      const crisisChain = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain)  // guardian_settings update
        .mockReturnValueOnce(crisisChain); // crisis_events insert

      const res = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/disabled/i);
    });

    it('the update call sets is_enabled to false', async () => {
      const updateChain = buildQueryMock({ data: null, error: null });
      const crisisChain = buildQueryMock({ data: null, error: null });

      let capturedUpdate: unknown;
      const updateMock = jest.fn((data: unknown) => {
        capturedUpdate = data;
        return updateChain;
      });
      updateChain['update'] = updateMock;

      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(crisisChain);

      await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      expect(capturedUpdate).toMatchObject({ is_enabled: false });
    });
  });

  // ── Scenario 2: GET /settings shows is_enabled=false after disable ───────

  describe('Scenario 2: Disable Guardian Mode → GET /settings shows is_enabled=false', () => {
    it('GET /settings returns is_enabled=false after disabling', async () => {
      // First: disable
      const updateChain = buildQueryMock({ data: null, error: null });
      const crisisChain = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(crisisChain);

      const disableRes = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );
      expect(disableRes.status).toBe(200);

      // Then: GET /settings returns disabled state
      const disabledSettings = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: false,
        consent_version: '1.0',
      };
      mockFrom.mockReturnValue(buildQueryMock({ data: disabledSettings, error: null }));

      const settingsRes = await settingsGET(
        makeGetRequest('http://localhost/api/guardian/settings')
      );

      expect(settingsRes.status).toBe(200);
      const json = await settingsRes.json();
      expect(json.success).toBe(true);
      expect(json.data.is_enabled).toBe(false);
    });
  });

  // ── Scenario 3: Disable logs guardian_disabled event ────────────────────

  describe('Scenario 3: Disable Guardian Mode → logs guardian_disabled event to crisis_events', () => {
    it('inserts a guardian_disabled event into crisis_events', async () => {
      const updateChain = buildQueryMock({ data: null, error: null });

      let capturedInsert: unknown;
      const crisisChain = buildQueryMock({ data: null, error: null });
      const insertMock = jest.fn((data: unknown) => {
        capturedInsert = data;
        return crisisChain;
      });
      crisisChain['insert'] = insertMock;

      mockFrom
        .mockReturnValueOnce(updateChain)   // guardian_settings update
        .mockReturnValueOnce(crisisChain);  // crisis_events insert

      await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      expect(capturedInsert).toMatchObject({
        user_id: MOCK_USER.id,
        event_type: 'guardian_disabled',
      });
    });
  });

  // ── Scenario 4: Disable with reason → reason is stored/logged ───────────

  describe('Scenario 4: Disable Guardian Mode with reason → reason is stored/logged', () => {
    it('includes the provided reason in the crisis_events metadata', async () => {
      const updateChain = buildQueryMock({ data: null, error: null });

      let capturedInsert: unknown;
      const crisisChain = buildQueryMock({ data: null, error: null });
      const insertMock = jest.fn((data: unknown) => {
        capturedInsert = data;
        return crisisChain;
      });
      crisisChain['insert'] = insertMock;

      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(crisisChain);

      const reason = 'No longer needed';
      await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', { reason })
      );

      expect(capturedInsert).toMatchObject({
        user_id: MOCK_USER.id,
        event_type: 'guardian_disabled',
        metadata: { reason },
      });
    });
  });

  // ── Scenario 5: Subsequent escalation calls return 400 ───────────────────

  describe('Scenario 5: Disable Guardian Mode → subsequent escalation calls return 400', () => {
    it('escalation returns 400 when Guardian Mode is not enabled', async () => {
      // Disable first
      const updateChain = buildQueryMock({ data: null, error: null });
      const crisisChain = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain)
        .mockReturnValueOnce(crisisChain);

      await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      // Now escalation should fail — settings show is_enabled=false
      const disabledSettings = {
        id: SETTINGS_ID,
        user_id: MOCK_USER.id,
        is_enabled: false,
      };
      mockFrom.mockReturnValue(buildQueryMock({ data: disabledSettings, error: null }));

      const escalateRes = await escalatePOST(
        makePostRequest(
          'http://localhost/api/guardian/escalate',
          { userId: MOCK_USER.id, missedCheckIns: 1, currentRiskScore: 10 },
          { 'x-service-key': SERVICE_KEY }
        )
      );

      expect(escalateRes.status).toBe(400);
      const json = await escalateRes.json();
      expect(json.error).toMatch(/not enabled/i);
    });

    it('escalation returns 400 when settings record does not exist', async () => {
      // No settings record at all (null data)
      mockFrom.mockReturnValue(buildQueryMock({ data: null, error: { code: 'PGRST116' } }));

      const escalateRes = await escalatePOST(
        makePostRequest(
          'http://localhost/api/guardian/escalate',
          { userId: MOCK_USER.id, missedCheckIns: 1, currentRiskScore: 10 },
          { 'x-service-key': SERVICE_KEY }
        )
      );

      expect(escalateRes.status).toBe(400);
      const json = await escalateRes.json();
      expect(json.error).toMatch(/not enabled/i);
    });
  });

  // ── Scenario 6: Unauthenticated request returns 401 ─────────────────────

  describe('Scenario 6: Disable Guardian Mode → unauthenticated request returns 401', () => {
    it('returns 401 when user is not authenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('Not authenticated') });

      const res = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Scenario 7: Idempotent — disabling when already disabled ────────────

  describe('Scenario 7: Disable Guardian Mode when already disabled → still returns success (idempotent)', () => {
    it('returns 200 success even when Guardian Mode is already disabled', async () => {
      // First disable
      const updateChain1 = buildQueryMock({ data: null, error: null });
      const crisisChain1 = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain1)
        .mockReturnValueOnce(crisisChain1);

      const firstRes = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );
      expect(firstRes.status).toBe(200);

      // Second disable (already disabled)
      const updateChain2 = buildQueryMock({ data: null, error: null });
      const crisisChain2 = buildQueryMock({ data: null, error: null });
      mockFrom
        .mockReturnValueOnce(updateChain2)
        .mockReturnValueOnce(crisisChain2);

      const secondRes = await disablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );

      expect(secondRes.status).toBe(200);
      const json = await secondRes.json();
      expect(json.success).toBe(true);
    });
  });
});
