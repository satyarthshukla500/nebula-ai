/**
 * @jest-environment node
 *
 * Risk Score Endpoint Tests - Task 3.2.4
 *
 * Tests for GET /api/guardian/risk-score endpoint
 * Covers:
 *   - Authentication requirement
 *   - Guardian Mode enabled check
 *   - Risk score breakdown response shape
 *   - updateRiskScoreOnMissedCheckin() scenarios
 */

import { NextRequest } from 'next/server';

// Mock next/headers
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

// Supabase mock
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

import { updateRiskScoreOnMissedCheckin } from '@/lib/utils/risk-scoring';
import { GET } from '../route';

const MOCK_USER = { id: 'user-123' };

const MOCK_SETTINGS_ENABLED = {
  id: 'settings-1',
  user_id: MOCK_USER.id,
  is_enabled: true,
  current_risk_score: 30,
  updated_at: new Date().toISOString(),
};

function makeGetRequest(url = 'http://localhost/api/guardian/risk-score'): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function makeQueryChain(data: unknown, error: unknown = null) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'eq', 'gte', 'order', 'limit', 'single', 'is', 'lt', 'update'];
  for (const m of methods) {
    chain[m] = jest.fn().mockReturnValue(chain);
  }
  chain['insert'] = jest.fn().mockResolvedValue({ data, error });
  (chain as any).then = (resolve: Function) => resolve({ data, error });
  return chain;
}

function resetMocks() {
  mockGetUser.mockReset();
  mockFrom.mockReset();
}

// --- updateRiskScoreOnMissedCheckin ------------------------------------------

describe('updateRiskScoreOnMissedCheckin', () => {
  function setupCheckinMock(checkins: Array<{ mood_rating: number | null; status: string }>) {
    const updateChain: Record<string, jest.Mock> = {};
    for (const m of ['eq', 'update']) {
      updateChain[m] = jest.fn().mockReturnValue(updateChain);
    }
    (updateChain as any).then = (resolve: Function) => resolve({ data: null, error: null });
    const insertMock = jest.fn().mockResolvedValue({ data: null, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'wellness_checkins') {
        const chain: Record<string, jest.Mock> = {};
        for (const m of ['select', 'eq', 'gte', 'order']) {
          chain[m] = jest.fn().mockReturnValue(chain);
        }
        (chain as any).then = (resolve: Function) => resolve({ data: checkins, error: null });
        return chain;
      }
      if (table === 'guardian_settings') {
        return { update: jest.fn().mockReturnValue(updateChain) };
      }
      if (table === 'crisis_events') {
        return { insert: insertMock };
      }
      return makeQueryChain(null);
    });

    return { insertMock };
  }

  beforeEach(resetMocks);

  it('calculates score of 30 for 2 consecutive missed check-ins (no positive check-ins)', async () => {
    setupCheckinMock([
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
    ]);

    const result = await updateRiskScoreOnMissedCheckin({ from: mockFrom }, MOCK_USER.id);
    // 2 missed × 15 = 30
    expect(result.score).toBe(30);
    expect(result.level).toBe('moderate');
  });

  it('reduces score to 0 when positive check-ins outweigh misses', async () => {
    setupCheckinMock([
      { mood_rating: null, status: 'missed' },
      { mood_rating: 9, status: 'completed' },
      { mood_rating: 8, status: 'completed' },
      { mood_rating: 8, status: 'completed' },
    ]);

    const result = await updateRiskScoreOnMissedCheckin({ from: mockFrom }, MOCK_USER.id);
    // 1 missed � 15 = 15, 3 positive � -10 = -30 ? clamped to 0
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('logs risk_score_updated event to crisis_events', async () => {
    const { insertMock } = setupCheckinMock([
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
    ]);

    await updateRiskScoreOnMissedCheckin({ from: mockFrom }, MOCK_USER.id);

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: MOCK_USER.id,
        event_type: 'risk_score_updated',
        risk_score_at_event: expect.any(Number),
        metadata: expect.objectContaining({
          trigger: 'missed_checkin',
          score: expect.any(Number),
          level: expect.stringMatching(/^(low|moderate|elevated|high)$/),
        }),
      }),
    );
  });
});

// --- GET /api/guardian/risk-score --------------------------------------------

describe('GET /api/guardian/risk-score', () => {
  beforeEach(resetMocks);

  it('returns 401 when not authenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('Unauthorized') });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error).toBe('Unauthorized');
  });

  it('returns 400 when Guardian Mode is not enabled', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return makeQueryChain({ ...MOCK_SETTINGS_ENABLED, is_enabled: false });
      }
      return makeQueryChain(null);
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe('Guardian Mode is not enabled');
  });

  it('returns 400 when no guardian settings exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return makeQueryChain(null, { code: 'PGRST116' });
      }
      return makeQueryChain(null);
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(400);
  });

  it('returns risk score breakdown with all required fields', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return makeQueryChain(MOCK_SETTINGS_ENABLED);
      }
      if (table === 'wellness_checkins') {
        return makeQueryChain([
          { mood_rating: null, status: 'missed' },
          { mood_rating: null, status: 'missed' },
          { mood_rating: 8, status: 'completed' },
        ]);
      }
      if (table === 'crisis_events') {
        return makeQueryChain(null, { code: 'PGRST116' });
      }
      return makeQueryChain(null);
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      score: expect.any(Number),
      level: expect.stringMatching(/^(low|moderate|elevated|high)$/),
      levelDescription: expect.any(String),
      factors: expect.objectContaining({
        consecutiveMissedCheckins: expect.any(Number),
        distressLanguageFrequency: expect.any(Number),
        decliningMoodTrend: expect.any(Boolean),
        explicitCrisisKeywords: expect.any(Number),
        positiveCheckins: expect.any(Number),
      }),
      scoreBreakdown: expect.objectContaining({
        missedCheckins: expect.any(Number),
        distressLanguage: expect.any(Number),
        moodTrend: expect.any(Number),
        crisisKeywords: expect.any(Number),
        positiveReduction: expect.any(Number),
      }),
      explanation: expect.any(String),
      storedScore: expect.any(Number),
      lastUpdated: expect.any(String),
    });
  });

  it('score is clamped between 0 and 100', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return makeQueryChain(MOCK_SETTINGS_ENABLED);
      }
      if (table === 'wellness_checkins') {
        return makeQueryChain([]);
      }
      if (table === 'crisis_events') {
        return makeQueryChain(null, { code: 'PGRST116' });
      }
      return makeQueryChain(null);
    });

    const res = await GET(makeGetRequest());
    const body = await res.json();
    expect(body.data.score).toBeGreaterThanOrEqual(0);
    expect(body.data.score).toBeLessThanOrEqual(100);
  });

  it('returns 500 on unexpected database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return makeQueryChain(null, { code: 'UNEXPECTED', message: 'DB error' });
      }
      return makeQueryChain(null);
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});
