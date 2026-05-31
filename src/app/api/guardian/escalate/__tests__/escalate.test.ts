/**
 * @jest-environment node
 *
 * Guardian Escalation API Unit Tests
 *
 * Tests for task 2.4.8: Unit tests for escalation logic
 * Covers: POST /api/guardian/escalate
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers ──────────────────────────────────────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

// ─── Mock risk scoring ──────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  shouldEscalate: jest.fn(),
  updateRiskScoreOnMissedCheckin: jest.fn().mockResolvedValue({ score: 30 }),
}));

// ─── Mock notification services ─────────────────────────────────────────────
const mockNotifyUser = jest.fn();
const mockNotifyEmergencyContact = jest.fn();

jest.mock('@/lib/notifications', () => ({
  getNotificationService: jest.fn(() => ({
    notifyUser: mockNotifyUser,
    notifyEmergencyContact: mockNotifyEmergencyContact,
  })),
  getSMSNotificationService: jest.fn(() => ({
    notifyUser: mockNotifyUser,
  })),
  getEmailNotificationService: jest.fn(() => ({
    notifyUser: mockNotifyUser,
  })),
}));

// ─── Supabase mock ──────────────────────────────────────────────────────────
const mockFrom = jest.fn();

jest.mock('@/lib/supabase/server', () => ({
  createClient: jest.fn(() =>
    Promise.resolve({ from: mockFrom })
  ),
}));

// ─── Import route handler after mocks ───────────────────────────────────────
import { POST } from '../route';
import { shouldEscalate, updateRiskScoreOnMissedCheckin } from '@/lib/utils/risk-scoring';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const SERVICE_KEY = 'test-service-key';

const MOCK_SETTINGS = {
  id: 'settings-1',
  user_id: 'user-123',
  is_enabled: true,
};

const MOCK_PROFILE = {
  full_name: 'Test User',
  email: 'test@example.com',
};

const MOCK_CONTACTS = [
  { id: 'contact-1', contact_name: 'Emergency Contact', contact_email: 'ec@example.com', contact_phone: '+1234567890' },
];

function makeRequest(
  body: unknown,
  serviceKey: string | null = SERVICE_KEY,
): NextRequest {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (serviceKey !== null) {
    headers['x-service-key'] = serviceKey;
  }
  return new NextRequest('http://localhost/api/guardian/escalate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers,
  });
}

function resetMocks() {
  mockFrom.mockReset();
  mockNotifyUser.mockReset();
  mockNotifyEmergencyContact.mockReset();
  (shouldEscalate as jest.Mock).mockReset();
  (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 0 });
  (updateRiskScoreOnMissedCheckin as jest.Mock).mockReset();
  (updateRiskScoreOnMissedCheckin as jest.Mock).mockResolvedValue({ score: 30 });
  process.env.GUARDIAN_SERVICE_KEY = SERVICE_KEY;
}

// ─── Default supabase mock: settings enabled, profile present, no crisis events
function setupDefaultSupabase(overrides: {
  settings?: object | null;
  settingsError?: object | null;
  profile?: object | null;
  crisisEvents?: object[];
  contacts?: object[];
  insertError?: object | null;
} = {}) {
  const settings = 'settings' in overrides ? overrides.settings : MOCK_SETTINGS;
  const settingsError = overrides.settingsError ?? null;
  const profile = 'profile' in overrides ? overrides.profile : MOCK_PROFILE;
  const crisisEvents = overrides.crisisEvents ?? [];
  const contacts = overrides.contacts ?? MOCK_CONTACTS;

  mockFrom.mockImplementation((table: string) => {
    if (table === 'guardian_settings') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: settings, error: settingsError }),
      };
    }
    if (table === 'profiles') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: profile, error: null }),
      };
    }
    if (table === 'crisis_events') {
      // Could be a select (timeout check) or insert (logging)
      const selectChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        is: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: crisisEvents, error: overrides.insertError ?? null }),
      };
      return selectChain;
    }
    if (table === 'emergency_contacts') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: contacts, error: null }),
      };
    }
    return {
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: null }),
    };
  });
}

// ─── Auth tests ───────────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – authentication', () => {
  beforeEach(resetMocks);

  it('returns 403 when x-service-key header is missing', async () => {
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 1, currentRiskScore: 10 }, null));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns 403 when x-service-key is wrong', async () => {
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 1, currentRiskScore: 10 }, 'wrong-key'));
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Forbidden');
  });

  it('returns 403 when GUARDIAN_SERVICE_KEY env var is not set', async () => {
    delete process.env.GUARDIAN_SERVICE_KEY;
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 1, currentRiskScore: 10 }, SERVICE_KEY));
    expect(res.status).toBe(403);
  });
});

// ─── Validation tests ─────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – input validation', () => {
  beforeEach(resetMocks);

  it('returns 400 when userId is missing', async () => {
    const res = await POST(makeRequest({ missedCheckIns: 1, currentRiskScore: 10 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/userId/);
  });

  it('returns 400 when missedCheckIns is missing', async () => {
    const res = await POST(makeRequest({ userId: 'u1', currentRiskScore: 10 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/missedCheckIns/);
  });

  it('returns 400 when currentRiskScore is missing', async () => {
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 1 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/currentRiskScore/);
  });

  it('returns 400 when missedCheckIns is not a number', async () => {
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 'many', currentRiskScore: 10 }));
    expect(res.status).toBe(400);
  });

  it('returns 400 when currentRiskScore is not a number', async () => {
    const res = await POST(makeRequest({ userId: 'u1', missedCheckIns: 1, currentRiskScore: 'high' }));
    expect(res.status).toBe(400);
  });
});

// ─── Guardian Mode not enabled ────────────────────────────────────────────────

describe('POST /api/guardian/escalate – Guardian Mode disabled', () => {
  beforeEach(resetMocks);

  it('returns 400 when Guardian Mode is not enabled', async () => {
    setupDefaultSupabase({ settings: { ...MOCK_SETTINGS, is_enabled: false } });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 10 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Guardian Mode is not enabled/);
  });

  it('returns 400 when settings record does not exist', async () => {
    setupDefaultSupabase({ settings: null, settingsError: { code: 'PGRST116' } });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 10 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Guardian Mode is not enabled/);
  });
});

// ─── No escalation required ───────────────────────────────────────────────────

describe('POST /api/guardian/escalate – no escalation required', () => {
  beforeEach(resetMocks);

  it('returns "no escalation required" when thresholds not met', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 0 });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 0, currentRiskScore: 5 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.stageExecuted).toBeNull();
    expect(json.data.message).toMatch(/[Nn]o escalation/);
  });
});

// ─── Stage 1 ──────────────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – Stage 1', () => {
  beforeEach(resetMocks);

  it('triggers Stage 1 after 1 missed check-in', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
    mockNotifyUser.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data.stageExecuted).toBe(1);
  });

  it('Stage 1 sends in-app notification to user', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 }));

    expect(mockNotifyUser).toHaveBeenCalledWith(
      'user-123',
      expect.objectContaining({ type: 'ESCALATION_WARNING', metadata: expect.objectContaining({ stage: 1 }) }),
    );
  });

  it('Stage 1 logs to crisis_events', async () => {
    const insertMock = jest.fn().mockReturnThis();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PROFILE, error: null }),
        };
      }
      if (table === 'crisis_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          insert: insertMock,
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 }));

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'escalation_stage_1', escalation_stage: 1 }),
    );
  });
});

// ─── Stage 2 ──────────────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – Stage 2', () => {
  beforeEach(resetMocks);

  it('triggers Stage 2 after 2 missed check-ins', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
    mockNotifyUser.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.stageExecuted).toBe(2);
  });

  it('Stage 2 sends SMS and email notifications', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 }));

    // notifyUser called at least twice (SMS + email)
    expect(mockNotifyUser.mock.calls.length).toBeGreaterThanOrEqual(2);
    const payloads = mockNotifyUser.mock.calls.map((c: any[]) => c[1]);
    expect(payloads.every((p: any) => p.metadata?.stage === 2)).toBe(true);
  });

  it('Stage 2 logs to crisis_events', async () => {
    const insertMock = jest.fn().mockReturnThis();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PROFILE, error: null }),
        };
      }
      if (table === 'crisis_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          insert: insertMock,
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 }));

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'escalation_stage_2', escalation_stage: 2 }),
    );
  });
});

// ─── Stage 3 ──────────────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – Stage 3', () => {
  beforeEach(resetMocks);

  it('triggers Stage 3 after 3+ missed check-ins with high risk score', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
    mockNotifyUser.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.stageExecuted).toBe(3);
  });

  it('Stage 3 sends in-app, SMS, and email notifications', async () => {
    setupDefaultSupabase();
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 }));

    // notifyUser called at least 3 times (in-app + SMS + email)
    expect(mockNotifyUser.mock.calls.length).toBeGreaterThanOrEqual(3);
    const payloads = mockNotifyUser.mock.calls.map((c: any[]) => c[1]);
    expect(payloads.every((p: any) => p.metadata?.stage === 3)).toBe(true);
    expect(payloads.some((p: any) => p.type === 'EMERGENCY_ALERT')).toBe(true);
  });

  it('Stage 3 logs to crisis_events', async () => {
    const insertMock = jest.fn().mockReturnThis();
    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PROFILE, error: null }),
        };
      }
      if (table === 'crisis_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          insert: insertMock,
          then: (resolve: Function) => resolve({ data: [], error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
    mockNotifyUser.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 }));

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({ event_type: 'escalation_stage_3', escalation_stage: 3 }),
    );
  });
});

// ─── Stage 4 ──────────────────────────────────────────────────────────────────

describe('POST /api/guardian/escalate – Stage 4', () => {
  beforeEach(resetMocks);

  /**
   * Stage 4 is triggered when Stage 3 times out (no user response within 30 min)
   * AND currentRiskScore > 60. The route checks isStage3TimedOut() when currentStage === 3.
   */
  function setupStage4Supabase(contacts = MOCK_CONTACTS) {
    // Mock updateRiskScoreOnMissedCheckin to return score > 60 for Stage 4 to fire
    (updateRiskScoreOnMissedCheckin as jest.Mock).mockResolvedValue({ score: 70 });

    const timedOutEvent = [{ id: 'event-1', user_response: null, event_timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString() }];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PROFILE, error: null }),
        };
      }
      if (table === 'crisis_events') {
        const insertMock = jest.fn().mockReturnThis();
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          insert: insertMock,
          then: (resolve: Function) => resolve({ data: timedOutEvent, error: null }),
        };
      }
      if (table === 'emergency_contacts') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: contacts, error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });
  }

  it('triggers Stage 4 when Stage 3 times out', async () => {
    setupStage4Supabase();
    mockNotifyEmergencyContact.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.stageExecuted).toBe(4);
  });

  it('Stage 4 notifies emergency contacts', async () => {
    setupStage4Supabase();
    mockNotifyEmergencyContact.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 }));

    expect(mockNotifyEmergencyContact).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({ type: 'EMERGENCY_ALERT', metadata: expect.objectContaining({ stage: 4 }) }),
      expect.any(String),  // contact_email
      expect.any(String),  // contact_phone
      expect.any(String),  // contact_name
    );
  });

  it('Stage 4 returns count of notified contacts', async () => {
    setupStage4Supabase();
    mockNotifyEmergencyContact.mockResolvedValue({ success: true });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 }));
    const json = await res.json();
    expect(json.data.notifiedContacts).toBe(1);
  });

  it('Stage 4 logs to crisis_events with contact_notified=true', async () => {
    // Ensure risk score > 60 so Stage 4 fires via timeout check
    (updateRiskScoreOnMissedCheckin as jest.Mock).mockResolvedValue({ score: 70 });

    const insertMock = jest.fn().mockReturnThis();
    const timedOutEvent = [{ id: 'event-1', user_response: null, event_timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString() }];

    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_SETTINGS, error: null }),
        };
      }
      if (table === 'profiles') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_PROFILE, error: null }),
        };
      }
      if (table === 'crisis_events') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          is: jest.fn().mockReturnThis(),
          lt: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          limit: jest.fn().mockReturnThis(),
          insert: insertMock,
          then: (resolve: Function) => resolve({ data: timedOutEvent, error: null }),
        };
      }
      if (table === 'emergency_contacts') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: MOCK_CONTACTS, error: null }),
        };
      }
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    mockNotifyEmergencyContact.mockResolvedValue({ success: true });

    await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 }));

    expect(insertMock).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: 'escalation_stage_4',
        escalation_stage: 4,
        contact_notified: true,
      }),
    );
  });

  it('does not trigger Stage 4 when Stage 3 has not timed out', async () => {
    // crisis_events returns empty (no timed-out stage 3 event)
    setupDefaultSupabase({ crisisEvents: [] });
    // shouldEscalate returns no escalation (currentStage=3, risk=70 but no timeout)
    (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

    const res = await POST(makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.stageExecuted).toBeNull();
  });
});
