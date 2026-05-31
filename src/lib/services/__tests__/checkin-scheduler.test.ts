/**
 * @jest-environment node
 *
 * Unit Tests: Check-in Scheduler Service
 *
 * Tasks: 4.1.9 — Test scheduler with various intervals
 * Covers: isQuietHours, parseIntervalMs, runCheckInScheduler
 */

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNotifyUser = jest.fn();
jest.mock('@/lib/notifications', () => ({
  getNotificationService: jest.fn(() => ({
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
  isQuietHours,
  parseIntervalMs,
  runCheckInScheduler,
  GuardianSettingsRow,
} from '../checkin-scheduler';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeTime(hour: number, minute = 0): Date {
  const d = new Date('2024-01-15T00:00:00.000Z');
  d.setUTCHours(hour, minute, 0, 0);
  // Use local hours for isQuietHours (it reads getHours/getMinutes)
  const local = new Date();
  local.setHours(hour, minute, 0, 0);
  return local;
}

function resetMocks() {
  mockNotifyUser.mockReset();
  mockSupabaseFrom.mockReset();
}

// ─── isQuietHours ─────────────────────────────────────────────────────────────

describe('isQuietHours', () => {
  it('returns false when current time is outside quiet hours (same-day range)', () => {
    const noon = makeTime(12, 0);
    expect(isQuietHours(noon, '22:00', '08:00')).toBe(false);
  });

  it('returns true when current time is within overnight quiet hours (after start)', () => {
    const lateNight = makeTime(23, 0);
    expect(isQuietHours(lateNight, '22:00', '08:00')).toBe(true);
  });

  it('returns true when current time is within overnight quiet hours (before end)', () => {
    const earlyMorning = makeTime(6, 0);
    expect(isQuietHours(earlyMorning, '22:00', '08:00')).toBe(true);
  });

  it('returns false exactly at quiet hours end boundary', () => {
    const atEnd = makeTime(8, 0);
    expect(isQuietHours(atEnd, '22:00', '08:00')).toBe(false);
  });

  it('returns true exactly at quiet hours start boundary', () => {
    const atStart = makeTime(22, 0);
    expect(isQuietHours(atStart, '22:00', '08:00')).toBe(true);
  });

  it('handles same-day quiet hours range (e.g. 13:00 – 15:00)', () => {
    const inside = makeTime(14, 0);
    const outside = makeTime(16, 0);
    expect(isQuietHours(inside, '13:00', '15:00')).toBe(true);
    expect(isQuietHours(outside, '13:00', '15:00')).toBe(false);
  });

  it('returns false at midnight when quiet hours are 01:00 – 06:00', () => {
    const midnight = makeTime(0, 0);
    expect(isQuietHours(midnight, '01:00', '06:00')).toBe(false);
  });
});

// ─── parseIntervalMs ──────────────────────────────────────────────────────────

describe('parseIntervalMs', () => {
  it('parses "6 hours" correctly', () => {
    expect(parseIntervalMs('6 hours')).toBe(6 * 60 * 60 * 1000);
  });

  it('parses "12 hours" correctly', () => {
    expect(parseIntervalMs('12 hours')).toBe(12 * 60 * 60 * 1000);
  });

  it('parses "24 hours" correctly', () => {
    expect(parseIntervalMs('24 hours')).toBe(24 * 60 * 60 * 1000);
  });

  it('parses singular "1 hour" correctly', () => {
    expect(parseIntervalMs('1 hour')).toBe(1 * 60 * 60 * 1000);
  });

  it('falls back to 12 hours for unrecognised format', () => {
    expect(parseIntervalMs('daily')).toBe(12 * 60 * 60 * 1000);
    expect(parseIntervalMs('')).toBe(12 * 60 * 60 * 1000);
    expect(parseIntervalMs('30 minutes')).toBe(12 * 60 * 60 * 1000);
  });
});

// ─── runCheckInScheduler ──────────────────────────────────────────────────────

describe('runCheckInScheduler', () => {
  beforeEach(resetMocks);

  const makeSetting = (overrides: Partial<GuardianSettingsRow> = {}): GuardianSettingsRow => ({
    id: 'settings-1',
    user_id: 'user-1',
    is_enabled: true,
    check_in_interval: '12 hours',
    next_check_in_due: new Date(Date.now() - 1000).toISOString(),
    notification_preferences: {
      in_app: true,
      quiet_hours_start: '22:00',
      quiet_hours_end: '08:00',
    },
    ...overrides,
  });

  function setupMocks(settings: GuardianSettingsRow[], checkinId = 'checkin-1') {
    mockNotifyUser.mockResolvedValue({ success: true, provider: 'console', timestamp: new Date().toISOString() });

    mockSupabaseFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          update: jest.fn().mockReturnThis(),
          // Resolve based on whether update was called
          then: (resolve: Function) => resolve({ data: settings, error: null }),
        };
      }
      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: checkinId }, error: null }),
        };
      }
      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });
  }

  it('returns zero counts when no users are due', async () => {
    mockSupabaseFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: [], error: null }),
    }));

    const result = await runCheckInScheduler();

    expect(result.usersFound).toBe(0);
    expect(result.checkInsCreated).toBe(0);
    expect(result.notificationsSent).toBe(0);
    expect(result.errors).toHaveLength(0);
  });

  it('throws when the initial DB fetch fails', async () => {
    mockSupabaseFrom.mockImplementation(() => ({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      lte: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: { message: 'DB down' } }),
    }));

    await expect(runCheckInScheduler()).rejects.toThrow('Scheduler DB fetch failed');
  });

  it('creates a check-in record and sends notification for a due user', async () => {
    // Use quiet hours that will never match the current test execution time
    // by setting quiet_hours_start == quiet_hours_end (zero-width window = never quiet)
    const now = new Date();
    const currentHour = now.getHours();
    // Pick a quiet window that starts and ends at the same minute — effectively disabled
    const neverQuietStart = `${String(currentHour).padStart(2, '0')}:00`;
    const neverQuietEnd = neverQuietStart;

    const setting = makeSetting({
      notification_preferences: {
        in_app: true,
        quiet_hours_start: neverQuietStart,
        quiet_hours_end: neverQuietEnd,
      },
    });

    let fromCallCount = 0;
    mockNotifyUser.mockResolvedValue({ success: true, provider: 'console', timestamp: new Date().toISOString() });

    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [setting], error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: 'checkin-1' }, error: null }),
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    const result = await runCheckInScheduler();

    expect(result.usersFound).toBe(1);
    expect(result.checkInsCreated).toBe(1);
    expect(result.notificationsSent).toBe(1);
    expect(result.errors).toHaveLength(0);
    expect(mockNotifyUser).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ type: 'CHECKIN_REMINDER' })
    );
  });

  it('skips notification during quiet hours but still creates check-in', async () => {
    // Pin the system clock to 23:00 local time — firmly inside the 22:00–08:00 quiet window.
    // jest.useFakeTimers replaces `new Date()` inside runCheckInScheduler so the
    // quiet-hours check always sees 23:00 regardless of when the test suite runs.
    const FAKE_NOW = new Date();
    FAKE_NOW.setHours(23, 0, 0, 0);
    jest.useFakeTimers({ now: FAKE_NOW });

    try {
      const setting = makeSetting({
        notification_preferences: {
          in_app: true,
          quiet_hours_start: '22:00',
          quiet_hours_end: '08:00',
        },
      });

      let fromCallCount = 0;
      mockSupabaseFrom.mockImplementation((table: string) => {
        fromCallCount++;

        if (table === 'guardian_settings' && fromCallCount === 1) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            lte: jest.fn().mockReturnThis(),
            then: (resolve: Function) => resolve({ data: [setting], error: null }),
          };
        }

        if (table === 'wellness_checkins') {
          return {
            insert: jest.fn().mockReturnThis(),
            select: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            then: (resolve: Function) => resolve({ data: { id: 'checkin-1' }, error: null }),
          };
        }

        if (table === 'guardian_settings') {
          return {
            update: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            then: (resolve: Function) => resolve({ data: null, error: null }),
          };
        }

        return { then: (resolve: Function) => resolve({ data: null, error: null }) };
      });

      const result = await runCheckInScheduler();

      // Check-in record must be created even during quiet hours
      expect(result.checkInsCreated).toBe(1);
      // Notification must be suppressed because 23:00 is inside 22:00–08:00
      expect(result.notificationsSent).toBe(0);
      expect(mockNotifyUser).not.toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });

  it('skips notification when in_app is disabled', async () => {
    const setting = makeSetting({
      notification_preferences: {
        in_app: false,
        quiet_hours_start: '22:00',
        quiet_hours_end: '08:00',
      },
    });

    let fromCallCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [setting], error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: 'checkin-1' }, error: null }),
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    const result = await runCheckInScheduler();

    expect(result.checkInsCreated).toBe(1);
    expect(result.notificationsSent).toBe(0);
    expect(mockNotifyUser).not.toHaveBeenCalled();
  });

  it('continues processing other users when one fails', async () => {
    const user1 = makeSetting({ user_id: 'user-1' });
    const user2 = makeSetting({ user_id: 'user-2', id: 'settings-2' });

    let fromCallCount = 0;
    mockNotifyUser.mockResolvedValue({ success: true, provider: 'console', timestamp: new Date().toISOString() });

    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [user1, user2], error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        // First user's insert fails; second succeeds
        const callIndex = fromCallCount;
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => {
            if (callIndex === 2) {
              // user-1 insert fails
              resolve({ data: null, error: { message: 'Insert failed' } });
            } else {
              resolve({ data: { id: 'checkin-2' }, error: null });
            }
          },
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    const result = await runCheckInScheduler();

    expect(result.usersFound).toBe(2);
    // user-1 failed, user-2 succeeded
    expect(result.errors.length).toBeGreaterThanOrEqual(1);
    expect(result.errors[0].userId).toBe('user-1');
  });

  it('updates next_check_in_due based on check_in_interval', async () => {
    const setting = makeSetting({ check_in_interval: '6 hours' });

    const updateMock = jest.fn().mockReturnThis();
    const eqMock = jest.fn().mockReturnThis();
    let fromCallCount = 0;

    mockNotifyUser.mockResolvedValue({ success: true, provider: 'console', timestamp: new Date().toISOString() });

    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [setting], error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: 'checkin-1' }, error: null }),
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: updateMock,
          eq: eqMock,
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    const before = Date.now();
    await runCheckInScheduler();

    // Verify update was called with a next_check_in_due ~6 hours from now
    expect(updateMock).toHaveBeenCalledWith(
      expect.objectContaining({
        next_check_in_due: expect.any(String),
      })
    );

    const updateCall = updateMock.mock.calls[0][0];
    const nextDue = new Date(updateCall.next_check_in_due).getTime();
    const expectedMin = before + 5.9 * 60 * 60 * 1000;
    const expectedMax = before + 6.1 * 60 * 60 * 1000;
    expect(nextDue).toBeGreaterThan(expectedMin);
    expect(nextDue).toBeLessThan(expectedMax);
  });

  it('handles notification failure gracefully (non-fatal)', async () => {
    const setting = makeSetting();
    mockNotifyUser.mockRejectedValue(new Error('Notification service down'));

    let fromCallCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [setting], error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: 'checkin-1' }, error: null }),
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    // Should not throw — notification failure is non-fatal
    const result = await runCheckInScheduler();
    expect(result.checkInsCreated).toBe(1);
    expect(result.notificationsSent).toBe(0);
    expect(result.errors).toHaveLength(0); // notification failure doesn't count as user error
  });

  it('processes multiple users and aggregates counts', async () => {
    const users = [
      makeSetting({ user_id: 'user-1' }),
      makeSetting({ user_id: 'user-2', id: 'settings-2' }),
      makeSetting({ user_id: 'user-3', id: 'settings-3' }),
    ];

    mockNotifyUser.mockResolvedValue({ success: true, provider: 'console', timestamp: new Date().toISOString() });

    let fromCallCount = 0;
    mockSupabaseFrom.mockImplementation((table: string) => {
      fromCallCount++;

      if (table === 'guardian_settings' && fromCallCount === 1) {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          lte: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: users, error: null }),
        };
      }

      if (table === 'wellness_checkins') {
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: { id: `checkin-${fromCallCount}` }, error: null }),
        };
      }

      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }

      return { then: (resolve: Function) => resolve({ data: null, error: null }) };
    });

    const result = await runCheckInScheduler();

    expect(result.usersFound).toBe(3);
    expect(result.checkInsCreated).toBe(3);
    expect(result.errors).toHaveLength(0);
  });
});
