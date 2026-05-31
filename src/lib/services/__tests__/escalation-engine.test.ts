/**
 * @jest-environment node
 *
 * Unit Tests: Escalation Engine Service
 *
 * Task 4.2.9 — Test escalation progression through all stages
 * Covers:
 *  - determineEscalationStage (pure function)
 *  - getUserEscalationState
 *  - countConsecutiveMissedCheckins
 *  - runEscalationEngine (integration)
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

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

const mockSupabaseFrom = jest.fn();
jest.mock('@/lib/supabase/server', () => ({
  createServiceClient: jest.fn(() => ({
    from: mockSupabaseFrom,
  })),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import {
  determineEscalationStage,
  getUserEscalationState,
  countConsecutiveMissedCheckins,
  runEscalationEngine,
  MISSED_CHECKIN_THRESHOLD_MS,
  STAGE_1_TIMEOUT_MS,
  STAGE_2_TIMEOUT_MS,
  STAGE_3_TIMEOUT_MS,
  STAGE_3_RISK_THRESHOLD,
  STAGE_4_RISK_THRESHOLD,
  STAGE_3_MIN_MISSES,
  type UserEscalationState,
} from '../escalation-engine';

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Returns a date that is `hours` hours before NOW */
function hoursBeforeNow(hours: number): Date {
  return new Date(NOW.getTime() - hours * 60 * 60 * 1000);
}

/** Returns a date that is `hours` hours before the real current time (for DB mocks) */
function hoursAgo(hours: number): Date {
  return new Date(Date.now() - hours * 60 * 60 * 1000);
}

function resetMocks() {
  mockNotifyUser.mockReset();
  mockNotifyEmergencyContact.mockReset();
  mockSupabaseFrom.mockReset();
}

const NOW = new Date('2024-06-01T12:00:00.000Z');

// ─── determineEscalationStage ─────────────────────────────────────────────────

describe('determineEscalationStage', () => {
  const noState: UserEscalationState = {
    currentStage: 0,
    stageTriggeredAt: null,
    hasResponded: false,
  };

  // Stage 0 → Stage 1
  it('returns 1 when there are missed check-ins and no current stage', () => {
    expect(determineEscalationStage(noState, 1, 0, NOW)).toBe(1);
  });

  it('returns null when there are no missed check-ins and no current stage', () => {
    expect(determineEscalationStage(noState, 0, 0, NOW)).toBeNull();
  });

  // Stage 1 → Stage 2
  it('returns 2 when Stage 1 has timed out (2+ hours)', () => {
    const state: UserEscalationState = {
      currentStage: 1,
      stageTriggeredAt: hoursBeforeNow(3),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 1, 0, NOW)).toBe(2);
  });

  it('returns null when Stage 1 has NOT timed out yet', () => {
    const state: UserEscalationState = {
      currentStage: 1,
      stageTriggeredAt: hoursBeforeNow(1),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 1, 0, NOW)).toBeNull();
  });

  // Stage 2 → Stage 3
  it('returns 3 when Stage 2 timed out AND risk > 40 AND 3+ misses', () => {
    const state: UserEscalationState = {
      currentStage: 2,
      stageTriggeredAt: hoursBeforeNow(5),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 50, NOW)).toBe(3);
  });

  it('returns null when Stage 2 timed out but risk is too low', () => {
    const state: UserEscalationState = {
      currentStage: 2,
      stageTriggeredAt: hoursBeforeNow(5),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 30, NOW)).toBeNull();
  });

  it('returns null when Stage 2 timed out but not enough misses', () => {
    const state: UserEscalationState = {
      currentStage: 2,
      stageTriggeredAt: hoursBeforeNow(5),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 2, 50, NOW)).toBeNull();
  });

  it('returns null when Stage 2 has NOT timed out yet', () => {
    const state: UserEscalationState = {
      currentStage: 2,
      stageTriggeredAt: hoursBeforeNow(2),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 50, NOW)).toBeNull();
  });

  // Stage 3 → Stage 4
  it('returns 4 when Stage 3 timed out AND risk > 60', () => {
    const state: UserEscalationState = {
      currentStage: 3,
      stageTriggeredAt: hoursBeforeNow(5),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 70, NOW)).toBe(4);
  });

  it('returns null when Stage 3 timed out but risk is not high enough', () => {
    const state: UserEscalationState = {
      currentStage: 3,
      stageTriggeredAt: hoursBeforeNow(5),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 55, NOW)).toBeNull();
  });

  it('returns null when Stage 3 has NOT timed out yet', () => {
    const state: UserEscalationState = {
      currentStage: 3,
      stageTriggeredAt: hoursBeforeNow(2),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 3, 70, NOW)).toBeNull();
  });

  // Terminal / responded states
  it('returns null when Stage 4 is already active (terminal)', () => {
    const state: UserEscalationState = {
      currentStage: 4,
      stageTriggeredAt: hoursAgo(1),
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 5, 90, NOW)).toBeNull();
  });

  it('returns null when user has already responded', () => {
    const state: UserEscalationState = {
      currentStage: 1,
      stageTriggeredAt: hoursAgo(3),
      hasResponded: true,
    };
    expect(determineEscalationStage(state, 2, 50, NOW)).toBeNull();
  });

  // Boundary: exactly at timeout
  it('returns 2 when Stage 1 triggered exactly at the 2-hour boundary', () => {
    const exactlyAtTimeout = new Date(NOW.getTime() - STAGE_1_TIMEOUT_MS);
    const state: UserEscalationState = {
      currentStage: 1,
      stageTriggeredAt: exactlyAtTimeout,
      hasResponded: false,
    };
    expect(determineEscalationStage(state, 1, 0, NOW)).toBe(2);
  });
});

// ─── getUserEscalationState ───────────────────────────────────────────────────

describe('getUserEscalationState', () => {
  beforeEach(resetMocks);

  function makeSupabase(events: unknown[]) {
    const supabase = {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: events, error: null }),
      }),
    } as any;
    return supabase;
  }

  it('returns stage 0 when no escalation events exist', async () => {
    const supabase = makeSupabase([]);
    const state = await getUserEscalationState(supabase, 'user-1');
    expect(state.currentStage).toBe(0);
    expect(state.stageTriggeredAt).toBeNull();
    expect(state.hasResponded).toBe(false);
  });

  it('returns correct stage from most recent escalation event', async () => {
    const ts = '2024-06-01T10:00:00.000Z';
    const supabase = makeSupabase([
      {
        event_type: 'escalation_stage_2',
        event_timestamp: ts,
        user_response: null,
        escalation_stage: 2,
      },
    ]);
    const state = await getUserEscalationState(supabase, 'user-1');
    expect(state.currentStage).toBe(2);
    expect(state.stageTriggeredAt).toEqual(new Date(ts));
    expect(state.hasResponded).toBe(false);
  });

  it('marks hasResponded true when user_response is set', async () => {
    const supabase = makeSupabase([
      {
        event_type: 'escalation_stage_3',
        event_timestamp: '2024-06-01T08:00:00.000Z',
        user_response: "I'm okay",
        escalation_stage: 3,
      },
    ]);
    const state = await getUserEscalationState(supabase, 'user-1');
    expect(state.hasResponded).toBe(true);
  });
});

// ─── countConsecutiveMissedCheckins ──────────────────────────────────────────

describe('countConsecutiveMissedCheckins', () => {
  beforeEach(resetMocks);

  const oldEnough = new Date(Date.now() - MISSED_CHECKIN_THRESHOLD_MS - 60_000).toISOString();
  const tooRecent = new Date(Date.now() - 30 * 60 * 1000).toISOString(); // 30 min ago

  function makeSupabase(checkins: unknown[]) {
    return {
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: checkins, error: null }),
      }),
    } as any;
  }

  it('returns 0 when no check-ins exist', async () => {
    const supabase = makeSupabase([]);
    expect(await countConsecutiveMissedCheckins(supabase, 'user-1')).toBe(0);
  });

  it('counts consecutive pending check-ins older than 1 hour', async () => {
    const supabase = makeSupabase([
      { status: 'pending', scheduled_time: oldEnough },
      { status: 'pending', scheduled_time: oldEnough },
      { status: 'pending', scheduled_time: oldEnough },
    ]);
    expect(await countConsecutiveMissedCheckins(supabase, 'user-1')).toBe(3);
  });

  it('stops counting at a completed check-in', async () => {
    const supabase = makeSupabase([
      { status: 'pending', scheduled_time: oldEnough },
      { status: 'completed', scheduled_time: oldEnough },
      { status: 'pending', scheduled_time: oldEnough },
    ]);
    expect(await countConsecutiveMissedCheckins(supabase, 'user-1')).toBe(1);
  });

  it('does not count pending check-ins that are too recent (< 1 hour)', async () => {
    const supabase = makeSupabase([
      { status: 'pending', scheduled_time: tooRecent },
    ]);
    expect(await countConsecutiveMissedCheckins(supabase, 'user-1')).toBe(0);
  });
});

// ─── runEscalationEngine ──────────────────────────────────────────────────────

describe('runEscalationEngine', () => {
  beforeEach(resetMocks);

  const oldEnough = new Date(Date.now() - MISSED_CHECKIN_THRESHOLD_MS - 60_000).toISOString();

  /** Build a chainable Supabase mock that resolves with the given data */
  function makeChain(data: unknown, error: unknown = null) {
    const chain: Record<string, jest.Mock> = {};
    const methods = ['select', 'eq', 'in', 'lt', 'order', 'limit', 'single', 'insert', 'update'];
    for (const m of methods) {
      chain[m] = jest.fn().mockReturnValue(chain);
    }
    (chain as any).then = (resolve: Function) => resolve({ data, error });
    return chain;
  }

  it('returns zero counts when no missed check-ins exist', async () => {
    mockSupabaseFrom.mockReturnValue(makeChain([]));

    const result = await runEscalationEngine();

    expect(result.usersFound).toBe(0);
    expect(result.escalationsExecuted).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('throws when the initial DB fetch fails', async () => {
    mockSupabaseFrom.mockReturnValue(makeChain(null, { message: 'DB down' }));

    await expect(runEscalationEngine()).rejects.toThrow('Escalation engine DB fetch failed');
  });

  it('deduplicates users with multiple missed check-ins', async () => {
    // Two missed check-ins for the same user
    const missedRows = [
      { id: 'c1', user_id: 'user-1', scheduled_time: oldEnough },
      { id: 'c2', user_id: 'user-1', scheduled_time: oldEnough },
    ];

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) {
        return makeChain(missedRows);
      }
      // crisis_events (escalation state) — no prior events
      if (table === 'crisis_events') return makeChain([]);
      // wellness_checkins (consecutive count)
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      // guardian_settings
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: true });
      // profiles
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      return makeChain(null);
    });

    mockNotifyUser.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    // Only 1 unique user even though 2 rows
    expect(result.usersFound).toBe(1);
  });

  it('executes Stage 1 for a user with no prior escalation', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') return makeChain([]);
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: true });
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      return makeChain(null);
    });

    mockNotifyUser.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(1);
    expect(mockNotifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'ESCALATION_WARNING', metadata: expect.objectContaining({ stage: 1 }) }),
    );
  });

  it('escalates to Stage 2 when Stage 1 has timed out', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];
    const stage1TriggeredAt = new Date(Date.now() - STAGE_1_TIMEOUT_MS - 60_000).toISOString();

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') {
        return makeChain([{
          event_type: 'escalation_stage_1',
          event_timestamp: stage1TriggeredAt,
          user_response: null,
          escalation_stage: 1,
        }]);
      }
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: true });
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      return makeChain(null);
    });

    mockNotifyUser.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(1);
    expect(mockNotifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ metadata: expect.objectContaining({ stage: 2 }) }),
      expect.any(String),
      undefined,
    );
  });

  it('escalates to Stage 3 when Stage 2 timed out, risk > 40, and 3+ misses', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];
    const stage2TriggeredAt = new Date(Date.now() - STAGE_2_TIMEOUT_MS - 60_000).toISOString();

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') {
        return makeChain([{
          event_type: 'escalation_stage_2',
          event_timestamp: stage2TriggeredAt,
          user_response: null,
          escalation_stage: 2,
        }]);
      }
      if (table === 'wellness_checkins') {
        // 3 consecutive missed check-ins
        return makeChain([
          { status: 'pending', scheduled_time: oldEnough },
          { status: 'pending', scheduled_time: oldEnough },
          { status: 'pending', scheduled_time: oldEnough },
        ]);
      }
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 50, is_enabled: true });
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      return makeChain(null);
    });

    mockNotifyUser.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(1);
    expect(mockNotifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'EMERGENCY_ALERT', metadata: expect.objectContaining({ stage: 3 }) }),
      expect.any(String),
      undefined,
    );
  });

  it('escalates to Stage 4 and notifies emergency contact', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];
    const stage3TriggeredAt = new Date(Date.now() - STAGE_3_TIMEOUT_MS - 60_000).toISOString();

    const mockContacts = [
      { id: 'contact-1', contact_name: 'Jane Doe', contact_email: 'jane@example.com', contact_phone: '+15551234567' },
    ];

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') {
        return makeChain([{
          event_type: 'escalation_stage_3',
          event_timestamp: stage3TriggeredAt,
          user_response: null,
          escalation_stage: 3,
        }]);
      }
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 70, is_enabled: true });
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      if (table === 'emergency_contacts') return makeChain(mockContacts);
      return makeChain(null);
    });

    mockNotifyEmergencyContact.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(1);
    expect(mockNotifyEmergencyContact).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({ type: 'EMERGENCY_ALERT', metadata: expect.objectContaining({ stage: 4 }) }),
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
  });

  it('skips escalation when Guardian Mode is disabled for user', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') return makeChain([]);
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: false });
      return makeChain(null);
    });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(0);
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it('continues processing other users when one fails', async () => {
    const missedRows = [
      { id: 'c1', user_id: 'user-1', scheduled_time: oldEnough },
      { id: 'c2', user_id: 'user-2', scheduled_time: oldEnough },
    ];

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);

      // For user-1: crisis_events throws
      if (table === 'crisis_events' && callCount <= 3) {
        const chain = makeChain(null, { message: 'DB error' });
        // Override then to throw
        (chain as any).then = (_resolve: Function, reject?: Function) => {
          throw new Error('Simulated DB error for user-1');
        };
        return chain;
      }

      if (table === 'crisis_events') return makeChain([]);
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: true });
      if (table === 'profiles') return makeChain({ full_name: 'Test User', email: 'test@example.com' });
      return makeChain(null);
    });

    mockNotifyUser.mockResolvedValue({ success: true });

    const result = await runEscalationEngine();

    expect(result.usersFound).toBe(2);
    // At least one error recorded
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
  });

  it('does not escalate when user has already responded to current stage', async () => {
    const missedRows = [{ id: 'c1', user_id: 'user-1', scheduled_time: oldEnough }];
    const stage1TriggeredAt = new Date(Date.now() - STAGE_1_TIMEOUT_MS - 60_000).toISOString();

    let callCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'wellness_checkins' && callCount === 1) return makeChain(missedRows);
      if (table === 'crisis_events') {
        return makeChain([{
          event_type: 'escalation_stage_1',
          event_timestamp: stage1TriggeredAt,
          user_response: "I'm okay",
          escalation_stage: 1,
        }]);
      }
      if (table === 'wellness_checkins') return makeChain([{ status: 'pending', scheduled_time: oldEnough }]);
      if (table === 'guardian_settings') return makeChain({ current_risk_score: 0, is_enabled: true });
      return makeChain(null);
    });

    const result = await runEscalationEngine();

    expect(result.escalationsExecuted).toBe(0);
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });
});
