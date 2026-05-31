/**
 * @jest-environment node
 *
 * Integration Tests: Guardian Mode Check-in Flow
 *
 * Task 7.1.3: Test check-in completion flow (status → complete → updated score)
 * Requirements: 1.2
 *
 * Covers:
 * 1. Full flow: GET status (enabled, no check-in done) → POST complete (mood 8) → GET status (updated next check-in, updated risk score)
 * 2. Risk score decreases after positive check-in (mood >= 7)
 * 3. Risk score reflects distress language in notes
 * 4. Completing check-in with notes encrypts them (verify encrypt was called)
 * 5. Snooze flow: GET status → POST snooze → GET status (next check-in pushed forward)
 * 6. Cannot complete check-in when Guardian Mode is disabled
 * 7. Mood rating validation: 0 → 400, 11 → 400, 1 → 200, 10 → 200
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
  encrypt: jest.fn((text: string) => `encrypted:${text}`),
  decrypt: jest.fn((text: string) => text.replace('encrypted:', '')),
}));

// ─── Risk scoring mock ───────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  calculateRiskScore: jest.fn(() => ({ score: 10, level: 'low', factors: [], explanation: '' })),
  analyzeDistressLanguage: jest.fn(() => 0),
  analyzeCrisisKeywords: jest.fn(() => 0),
}));

// ─── Import route handlers after mocks ──────────────────────────────────────
import { POST as completePOST } from '../checkin/complete/route';
import { GET as statusGET } from '../checkin/status/route';
import { POST as snoozePOST } from '../checkin/snooze/route';

// ─── Constants ───────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-checkin-integration' };

const MOCK_SETTINGS_ENABLED = {
  id: 'settings-checkin-1',
  user_id: MOCK_USER.id,
  is_enabled: true,
  check_in_interval: '12 hours',
  current_risk_score: 20,
  next_check_in_due: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  last_check_in: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
};

const MOCK_PENDING_CHECKIN = {
  id: 'checkin-pending-1',
  user_id: MOCK_USER.id,
  status: 'pending',
  scheduled_time: new Date().toISOString(),
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
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'limit', 'single', 'gte'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  chain['single'] = jest.fn().mockResolvedValue(result);
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

/** Build a settings mock that returns the given settings on first call, then a generic mock */
function buildSettingsMock(settings: object | null, settingsError?: object) {
  return buildQueryMock({ data: settings, error: settingsError ?? null });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('Guardian Mode Check-in Flow Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    const riskScoring = require('@/lib/utils/risk-scoring');
    (riskScoring.calculateRiskScore as jest.Mock).mockReturnValue({ score: 10, level: 'low', factors: [], explanation: '' });
    (riskScoring.analyzeDistressLanguage as jest.Mock).mockReturnValue(0);
    (riskScoring.analyzeCrisisKeywords as jest.Mock).mockReturnValue(0);
  });

  // ── Scenario 1: Full flow ────────────────────────────────────────────────

  describe('Scenario 1: Full flow — GET status → POST complete → GET status (updated)', () => {
    it('Step 1: GET /status shows enabled state with no recent check-in', async () => {
      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings') {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        // missed check-ins query
        return buildQueryMock({ data: [], error: null });
      });

      const res = await statusGET(makeGetRequest('http://localhost/api/guardian/checkin/status'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.isEnabled).toBe(true);
      expect(json.data.currentRiskScore).toBe(MOCK_SETTINGS_ENABLED.current_risk_score);
      expect(json.data.nextCheckInDue).toBe(MOCK_SETTINGS_ENABLED.next_check_in_due);
    });

    it('Step 2: POST /complete with mood 8 succeeds', async () => {
      const { calculateRiskScore } = require('@/lib/utils/risk-scoring');
      (calculateRiskScore as jest.Mock).mockReturnValue({ score: 15, level: 'low', factors: [], explanation: '' });

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          // No pending check-in
          return buildQueryMock({ data: null, error: { code: 'PGRST116' } });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          // Insert new check-in
          return buildQueryMock({ data: { id: 'new-checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          // Recent check-ins
          return buildQueryMock({ data: [], error: null });
        }
        // guardian_settings update + crisis_events inserts
        return buildQueryMock({ data: null, error: null });
      });

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 8 })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveProperty('checkinId');
      expect(json.data).toHaveProperty('nextCheckInDue');
      expect(json.data.riskScore).toBe(15);
    });

    it('Step 3: GET /status after completion shows updated risk score and next check-in', async () => {
      const updatedSettings = {
        ...MOCK_SETTINGS_ENABLED,
        current_risk_score: 15,
        last_check_in: new Date().toISOString(),
        next_check_in_due: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
      };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'guardian_settings') {
          return buildQueryMock({ data: updatedSettings, error: null });
        }
        return buildQueryMock({ data: [], error: null });
      });

      const res = await statusGET(makeGetRequest('http://localhost/api/guardian/checkin/status'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.currentRiskScore).toBe(15);
      expect(json.data.nextCheckInDue).toBe(updatedSettings.next_check_in_due);
      expect(json.data.lastCheckIn).toBe(updatedSettings.last_check_in);
    });
  });

  // ── Scenario 2: Risk score decreases after positive check-in ────────────

  describe('Scenario 2: Risk score decreases after positive check-in (mood >= 7)', () => {
    it('calculateRiskScore is called with positiveCheckins > 0 for mood >= 7', async () => {
      const { calculateRiskScore } = require('@/lib/utils/risk-scoring');
      (calculateRiskScore as jest.Mock).mockReturnValue({ score: 5, level: 'low', factors: [], explanation: '' });

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: { ...MOCK_SETTINGS_ENABLED, current_risk_score: 30 }, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          // Recent check-ins include one with mood >= 7
          return buildQueryMock({
            data: [{ mood_rating: 8, status: 'completed', created_at: new Date().toISOString() }],
            error: null,
          });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 8 })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.riskScore).toBe(5);

      // Verify calculateRiskScore was called with positiveCheckins > 0
      const riskScoringMod = require('@/lib/utils/risk-scoring');
      expect(riskScoringMod.calculateRiskScore).toHaveBeenCalledWith(
        expect.objectContaining({ positiveCheckins: expect.any(Number) })
      );
      const callArgs = (riskScoringMod.calculateRiskScore as jest.Mock).mock.calls[0][0];
      expect(callArgs.positiveCheckins).toBeGreaterThan(0);
    });
  });

  // ── Scenario 3: Risk score reflects distress language in notes ───────────

  describe('Scenario 3: Risk score reflects distress language in notes', () => {
    it('analyzeDistressLanguage is called with notes content', async () => {
      const { analyzeDistressLanguage, analyzeCrisisKeywords, calculateRiskScore } = require('@/lib/utils/risk-scoring');
      (analyzeDistressLanguage as jest.Mock).mockReturnValue(3);
      (analyzeCrisisKeywords as jest.Mock).mockReturnValue(1);
      (calculateRiskScore as jest.Mock).mockReturnValue({ score: 50, level: 'elevated', factors: ['distress'], explanation: '' });

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: [], error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const distressNotes = 'I feel hopeless and cannot cope anymore';
      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', {
          moodRating: 3,
          notes: distressNotes,
        })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.riskScore).toBe(50);

      expect(analyzeDistressLanguage).toHaveBeenCalledWith(distressNotes);
      expect(analyzeCrisisKeywords).toHaveBeenCalledWith(distressNotes);
      expect(calculateRiskScore).toHaveBeenCalledWith(
        expect.objectContaining({
          distressLanguageFrequency: 3,
          explicitCrisisKeywords: 1,
        })
      );
    });
  });

  // ── Scenario 4: Notes are encrypted ─────────────────────────────────────

  describe('Scenario 4: Completing check-in with notes encrypts them', () => {
    it('encrypt is called with the notes text', async () => {
      const { encrypt } = require('@/lib/utils/guardian-encryption');

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: [], error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const notes = 'Feeling a bit anxious today';
      await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', {
          moodRating: 6,
          notes,
        })
      );

      expect(encrypt).toHaveBeenCalledWith(notes);
    });

    it('encrypt is NOT called when no notes are provided', async () => {
      const { encrypt } = require('@/lib/utils/guardian-encryption');

      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: [], error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 7 })
      );

      expect(encrypt).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 5: Snooze flow ──────────────────────────────────────────────

  describe('Scenario 5: Snooze flow — GET status → POST snooze → GET status (next check-in pushed forward)', () => {
    it('Step 1: GET /status shows current next check-in time', async () => {
      const nextCheckIn = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // 30 min from now
      const settingsWithNextCheckin = { ...MOCK_SETTINGS_ENABLED, next_check_in_due: nextCheckIn };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'guardian_settings') {
          return buildQueryMock({ data: settingsWithNextCheckin, error: null });
        }
        return buildQueryMock({ data: [], error: null });
      });

      const res = await statusGET(makeGetRequest('http://localhost/api/guardian/checkin/status'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.nextCheckInDue).toBe(nextCheckIn);
    });

    it('Step 2: POST /snooze pushes next check-in forward', async () => {
      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings') {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: null, error: null });
        }
        // crisis_events insert
        return buildQueryMock({ data: null, error: null });
      });

      const before = Date.now();
      const res = await snoozePOST(
        makePostRequest('http://localhost/api/guardian/checkin/snooze', { snoozeDuration: 60 })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.snoozeDurationMinutes).toBe(60);

      const newTime = new Date(json.data.newScheduledTime).getTime();
      expect(newTime).toBeGreaterThan(before + 59 * 60 * 1000);
      expect(newTime).toBeLessThan(before + 61 * 60 * 1000);
    });

    it('Step 3: GET /status after snooze reflects updated next check-in', async () => {
      const snoozedNextCheckIn = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const updatedSettings = { ...MOCK_SETTINGS_ENABLED, next_check_in_due: snoozedNextCheckIn };

      mockFrom.mockImplementation((table: string) => {
        if (table === 'guardian_settings') {
          return buildQueryMock({ data: updatedSettings, error: null });
        }
        return buildQueryMock({ data: [], error: null });
      });

      const res = await statusGET(makeGetRequest('http://localhost/api/guardian/checkin/status'));
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.nextCheckInDue).toBe(snoozedNextCheckIn);
    });
  });

  // ── Scenario 6: Cannot complete when Guardian Mode is disabled ───────────

  describe('Scenario 6: Cannot complete check-in when Guardian Mode is disabled', () => {
    it('returns 400 when is_enabled is false', async () => {
      mockFrom.mockReturnValue(
        buildQueryMock({ data: { ...MOCK_SETTINGS_ENABLED, is_enabled: false }, error: null })
      );

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 7 })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Guardian Mode is not enabled/i);
    });

    it('returns 400 when no settings record exists', async () => {
      mockFrom.mockReturnValue(
        buildQueryMock({ data: null, error: { code: 'PGRST116' } })
      );

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 7 })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/Guardian Mode is not enabled/i);
    });
  });

  // ── Scenario 7: Mood rating validation ──────────────────────────────────

  describe('Scenario 7: Mood rating validation', () => {
    it('returns 400 for mood rating 0 (below minimum)', async () => {
      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 0 })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/moodRating/i);
    });

    it('returns 400 for mood rating 11 (above maximum)', async () => {
      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 11 })
      );
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/moodRating/i);
    });

    it('returns 200 for mood rating 1 (minimum valid)', async () => {
      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: [], error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 1 })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('returns 200 for mood rating 10 (maximum valid)', async () => {
      let callCount = 0;
      mockFrom.mockImplementation((table: string) => {
        callCount++;
        if (table === 'guardian_settings' && callCount === 1) {
          return buildQueryMock({ data: MOCK_SETTINGS_ENABLED, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 2) {
          return buildQueryMock({ data: MOCK_PENDING_CHECKIN, error: null });
        }
        if (table === 'wellness_checkins' && callCount === 3) {
          return buildQueryMock({ data: { id: 'checkin-1', status: 'completed' }, error: null });
        }
        if (table === 'wellness_checkins') {
          return buildQueryMock({ data: [], error: null });
        }
        return buildQueryMock({ data: null, error: null });
      });

      const res = await completePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 10 })
      );
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });
  });
});
