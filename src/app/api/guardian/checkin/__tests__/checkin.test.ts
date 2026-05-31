/**
 * @jest-environment node
 *
 * Guardian Check-in API Unit Tests
 *
 * Tests for task 2.3.7: Unit tests for check-in API
 * Covers: POST /complete, GET /status, POST /snooze
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers (required by supabase/server) ───────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// ─── Mock encryption (avoid needing real keys in tests) ────────────────────
jest.mock('@/lib/utils/guardian-encryption', () => ({
  encrypt: jest.fn((text: string) => `encrypted:${text}`),
  decrypt: jest.fn((text: string) => text.replace('encrypted:', '')),
}));

// ─── Mock risk scoring ─────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  calculateRiskScore: jest.fn(() => ({ score: 10 })),
  analyzeDistressLanguage: jest.fn(() => 0),
  analyzeCrisisKeywords: jest.fn(() => 0),
}));

// ─── Supabase mock factory ──────────────────────────────────────────────────
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

// ─── Import route handlers after mocks ─────────────────────────────────────
import { POST as completePOST } from '../complete/route';
import { GET as statusGET } from '../status/route';
import { POST as snoozePOST } from '../snooze/route';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-123' };

const MOCK_SETTINGS = {
  id: 'settings-1',
  user_id: MOCK_USER.id,
  is_enabled: true,
  check_in_interval: '12 hours',
  current_risk_score: 5,
  next_check_in_due: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  last_check_in: new Date().toISOString(),
};

const MOCK_PENDING_CHECKIN = {
  id: 'checkin-1',
  user_id: MOCK_USER.id,
  status: 'pending',
  scheduled_time: new Date().toISOString(),
};

function makeRequest(body: unknown, method = 'POST', url = 'http://localhost'): NextRequest {
  return new NextRequest(url, {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest(url = 'http://localhost'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function resetMocks() {
  mockGetUser.mockReset();
  mockFrom.mockReset();
}

// ─── POST /complete ──────────────────────────────────────────────────────────

describe('POST /api/guardian/checkin/complete', () => {
  beforeEach(resetMocks);

  const validBody = { moodRating: 7, notes: 'Feeling okay today' };

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid mood rating (out of range)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await completePOST(makeRequest({ moodRating: 11 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/moodRating/);
  });

  it('returns 400 for invalid mood rating (non-number)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await completePOST(makeRequest({ moodRating: 'high' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/moodRating/);
  });

  it('returns 400 when Guardian Mode is not enabled', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: { ...MOCK_SETTINGS, is_enabled: false }, error: null }),
    });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Guardian Mode is not enabled/);
  });

  it('returns 400 when no settings exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Guardian Mode is not enabled/);
  });

  it('creates new check-in when no pending check-in exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const createdCheckin = { id: 'new-checkin-1', ...validBody, status: 'completed' };
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings' && callCount === 1) {
        // First call: fetch settings
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        // Second call: find pending check-in → none found
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) =>
            resolve({ data: null, error: { code: 'PGRST116' } }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 3) {
        // Third call: insert new check-in
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: createdCheckin, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        // Recent check-ins query
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      // guardian_settings update + crisis_events insert
      return {
        update: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('checkinId');
    expect(json.data).toHaveProperty('nextCheckInDue');
    expect(json.data).toHaveProperty('riskScore');
  });

  it('updates existing pending check-in when one exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const updatedCheckin = { id: 'checkin-1', status: 'completed', mood_rating: 7 };
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings' && callCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        // Pending check-in found
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PENDING_CHECKIN, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 3) {
        // Update pending check-in
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: updatedCheckin, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        // Recent check-ins
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      return {
        update: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.checkinId).toBe('checkin-1');
  });

  it('calculates risk score and sets next check-in time', async () => {
    const { calculateRiskScore } = require('@/lib/utils/risk-scoring');
    (calculateRiskScore as jest.Mock).mockReturnValue({ score: 25 });

    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings' && callCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PENDING_CHECKIN, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 3) {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) =>
            resolve({ data: { id: 'checkin-1', status: 'completed' }, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      return {
        update: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await completePOST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.riskScore).toBe(25);
    // next check-in should be ~12 hours from now
    const nextDue = new Date(json.data.nextCheckInDue).getTime();
    const now = Date.now();
    expect(nextDue).toBeGreaterThan(now + 11 * 60 * 60 * 1000);
    expect(nextDue).toBeLessThan(now + 13 * 60 * 60 * 1000);
  });
});

// ─── GET /status ─────────────────────────────────────────────────────────────

describe('GET /api/guardian/checkin/status', () => {
  beforeEach(resetMocks);

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await statusGET(makeGetRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns defaults when no settings exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await statusGET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isEnabled).toBe(false);
    expect(json.data.nextCheckInDue).toBeNull();
    expect(json.data.lastCheckIn).toBeNull();
    expect(json.data.currentRiskScore).toBe(0);
    expect(json.data.missedCheckIns).toBe(0);
  });

  it('returns current status with risk score and missed count', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const missedCheckins = [{ id: 'missed-1' }, { id: 'missed-2' }];
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      // wellness_checkins missed count
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: missedCheckins, error: null }),
      };
    });

    const res = await statusGET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.isEnabled).toBe(true);
    expect(json.data.currentRiskScore).toBe(MOCK_SETTINGS.current_risk_score);
    expect(json.data.missedCheckIns).toBe(2);
    expect(json.data.nextCheckInDue).toBe(MOCK_SETTINGS.next_check_in_due);
    expect(json.data.lastCheckIn).toBe(MOCK_SETTINGS.last_check_in);
  });

  it('returns 0 missed check-ins when query errors', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        gte: jest.fn().mockReturnThis(),
        then: (resolve: Function) =>
          resolve({ data: null, error: new Error('DB error') }),
      };
    });

    const res = await statusGET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.missedCheckIns).toBe(0);
  });
});

// ─── POST /snooze ─────────────────────────────────────────────────────────────

describe('POST /api/guardian/checkin/snooze', () => {
  beforeEach(resetMocks);

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await snoozePOST(makeRequest({}));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid snoozeDuration (too large)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await snoozePOST(makeRequest({ snoozeDuration: 200 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/snoozeDuration/);
  });

  it('returns 400 for invalid snoozeDuration (zero)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await snoozePOST(makeRequest({ snoozeDuration: 0 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/snoozeDuration/);
  });

  it('returns 400 for invalid snoozeDuration (non-integer)', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await snoozePOST(makeRequest({ snoozeDuration: 15.5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/snoozeDuration/);
  });

  it('returns 400 when Guardian Mode is not enabled', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: { ...MOCK_SETTINGS, is_enabled: false }, error: null }),
    });

    const res = await snoozePOST(makeRequest({ snoozeDuration: 30 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Guardian Mode is not enabled/);
  });

  it('returns 404 when no pending check-in exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      // No pending check-in
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: Function) =>
          resolve({ data: null, error: { code: 'PGRST116' } }),
      };
    });

    const res = await snoozePOST(makeRequest({ snoozeDuration: 30 }));
    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toMatch(/No pending check-in/);
  });

  it('updates scheduled_time on successful snooze', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        // Pending check-in found
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PENDING_CHECKIN, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        // Update scheduled_time
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }
      // crisis_events insert
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const before = Date.now();
    const res = await snoozePOST(makeRequest({ snoozeDuration: 45 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.snoozeDurationMinutes).toBe(45);
    const newTime = new Date(json.data.newScheduledTime).getTime();
    expect(newTime).toBeGreaterThan(before + 44 * 60 * 1000);
    expect(newTime).toBeLessThan(before + 46 * 60 * 1000);
  });

  it('logs a crisis event on successful snooze', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const insertMock = jest.fn().mockReturnThis();
    let callCount = 0;

    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PENDING_CHECKIN, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }
      // crisis_events
      return {
        insert: insertMock,
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    await snoozePOST(makeRequest({ snoozeDuration: 30 }));
    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'check_in_snoozed' })
    );
  });

  it('uses default 30-minute snooze when snoozeDuration is omitted', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'wellness_checkins' && callCount === 2) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PENDING_CHECKIN, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await snoozePOST(makeRequest({}));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.snoozeDurationMinutes).toBe(30);
  });
});
