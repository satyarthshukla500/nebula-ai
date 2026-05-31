/**
 * @jest-environment node
 *
 * Risk Score Scenario Tests — Task 3.2.5
 *
 * Integration-style unit tests that verify risk score updates work correctly
 * in realistic usage patterns.
 *
 * Scenarios covered:
 *   1. User completes check-in with high mood → risk score decreases
 *   2. User misses multiple check-ins → risk score increases
 *   3. Risk score is stored in crisis_events on each update
 *   4. Risk score is clamped between 0–100
 *   5. Single event never triggers escalation threshold (score stays below 40)
 */

import {
  calculateRiskScore,
  updateRiskScoreOnMissedCheckin,
  type RiskFactors,
} from '../risk-scoring';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const baseFactors: RiskFactors = {
  consecutiveMissedCheckins: 0,
  distressLanguageFrequency: 0,
  decliningMoodTrend: false,
  explicitCrisisKeywords: 0,
  positiveCheckins: 0,
};

/** Build a minimal Supabase mock that records inserts to crisis_events */
function buildSupabaseMock(checkins: Array<{ mood_rating: number | null; status: string }>) {
  const crisisEventInserts: unknown[] = [];
  let settingsUpdatePayload: unknown = null;

  const mock = {
    from: jest.fn((table: string) => {
      if (table === 'wellness_checkins') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          gte: jest.fn().mockReturnThis(),
          order: jest.fn().mockReturnThis(),
          then: (resolve: (v: unknown) => void) =>
            resolve({ data: checkins, error: null }),
        };
      }
      if (table === 'guardian_settings') {
        return {
          update: jest.fn((payload: unknown) => {
            settingsUpdatePayload = payload;
            return {
              eq: jest.fn().mockReturnThis(),
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: null }),
            };
          }),
        };
      }
      if (table === 'crisis_events') {
        return {
          insert: jest.fn((payload: unknown) => {
            crisisEventInserts.push(payload);
            return {
              then: (resolve: (v: unknown) => void) =>
                resolve({ data: null, error: null }),
            };
          }),
        };
      }
      return {};
    }),
    _crisisEventInserts: crisisEventInserts,
    _getSettingsUpdate: () => settingsUpdatePayload,
  };

  return mock;
}

// ─── Scenario 1: High-mood check-in reduces risk score ───────────────────────

describe('Scenario 1: completing check-ins with high mood reduces risk score', () => {
  it('positive check-ins lower the score compared to baseline', () => {
    const baseline = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 2, // +30
    });

    const afterPositiveCheckins = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 2, // +30
      positiveCheckins: 2,           // -20
    });

    expect(afterPositiveCheckins.score).toBeLessThan(baseline.score);
    expect(afterPositiveCheckins.score).toBe(10);
  });

  it('a single high-mood check-in (mood ≥ 7) reduces score by 10 points', () => {
    const before = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 1, // +15
    });

    const after = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 1, // +15
      positiveCheckins: 1,           // -10
    });

    expect(after.score).toBe(before.score - 10);
  });

  it('three consecutive high-mood check-ins can fully offset one missed check-in', () => {
    // 1 missed (+15) vs 3 positive (-30) → clamped to 0
    const result = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 1,
      positiveCheckins: 3,
    });

    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('updateRiskScoreOnMissedCheckin reflects positive check-ins in the DB', async () => {
    // Simulate: 1 missed check-in followed by 2 completed high-mood check-ins
    const checkins = [
      { mood_rating: null, status: 'missed' },
      { mood_rating: 8, status: 'completed' },
      { mood_rating: 9, status: 'completed' },
    ];

    const supabase = buildSupabaseMock(checkins);
    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-abc');

    // 1 consecutive missed (+15), 2 positive (-20) → clamped to 0
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });
});

// ─── Scenario 2: Missing multiple check-ins increases risk score ──────────────

describe('Scenario 2: missing multiple check-ins increases risk score', () => {
  it('each additional missed check-in adds 15 points', () => {
    const one = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 1 });
    const two = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 2 });
    const three = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 3 });

    expect(two.score).toBe(one.score + 15);
    expect(three.score).toBe(two.score + 15);
  });

  it('3 consecutive missed check-ins reaches elevated level (45 points)', () => {
    const result = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 3 });
    expect(result.score).toBe(45);
    expect(result.level).toBe('elevated');
  });

  it('updateRiskScoreOnMissedCheckin counts consecutive misses from DB', async () => {
    // 3 consecutive missed check-ins (most recent first)
    const checkins = [
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
    ];

    const supabase = buildSupabaseMock(checkins);
    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-abc');

    expect(result.score).toBe(45);
    expect(result.level).toBe('elevated');
    expect(result.factors.missedCheckins).toBe(45);
  });

  it('a completed check-in breaks the consecutive miss streak', async () => {
    // Pattern: missed, completed, missed, missed — only 2 consecutive at the top
    const checkins = [
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
      { mood_rating: 6, status: 'completed' }, // breaks streak
      { mood_rating: null, status: 'missed' },
    ];

    const supabase = buildSupabaseMock(checkins);
    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-abc');

    // Only 2 consecutive missed at the top → 30 points
    expect(result.factors.missedCheckins).toBe(30);
  });

  it('risk score increases monotonically as more check-ins are missed', () => {
    const scores = [1, 2, 3, 4].map(
      (n) => calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: n }).score,
    );

    for (let i = 1; i < scores.length; i++) {
      expect(scores[i]).toBeGreaterThan(scores[i - 1]);
    }
  });
});

// ─── Scenario 3: Risk score stored in crisis_events on each update ────────────

describe('Scenario 3: risk score is stored in crisis_events on each update', () => {
  it('updateRiskScoreOnMissedCheckin inserts a risk_score_updated event', async () => {
    const checkins = [{ mood_rating: null, status: 'missed' }];
    const supabase = buildSupabaseMock(checkins);

    await updateRiskScoreOnMissedCheckin(supabase as any, 'user-xyz');

    expect(supabase._crisisEventInserts).toHaveLength(1);
    const event = supabase._crisisEventInserts[0] as Record<string, unknown>;
    expect(event.event_type).toBe('risk_score_updated');
    expect(event.user_id).toBe('user-xyz');
  });

  it('the crisis_events insert includes the computed risk score', async () => {
    const checkins = [
      { mood_rating: null, status: 'missed' },
      { mood_rating: null, status: 'missed' },
    ];
    const supabase = buildSupabaseMock(checkins);

    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-xyz');

    const event = supabase._crisisEventInserts[0] as Record<string, unknown>;
    expect(event.risk_score_at_event).toBe(result.score);
  });

  it('the crisis_events metadata contains trigger, score, level, and factors', async () => {
    const checkins = [{ mood_rating: null, status: 'missed' }];
    const supabase = buildSupabaseMock(checkins);

    await updateRiskScoreOnMissedCheckin(supabase as any, 'user-xyz');

    const event = supabase._crisisEventInserts[0] as Record<string, unknown>;
    const metadata = event.metadata as Record<string, unknown>;
    expect(metadata.trigger).toBe('missed_checkin');
    expect(metadata).toHaveProperty('score');
    expect(metadata).toHaveProperty('level');
    expect(metadata).toHaveProperty('factors');
    expect(metadata).toHaveProperty('explanation');
  });

  it('guardian_settings.current_risk_score is updated with the new score', async () => {
    const checkins = [{ mood_rating: null, status: 'missed' }];
    const supabase = buildSupabaseMock(checkins);

    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-xyz');

    const settingsUpdate = supabase._getSettingsUpdate() as Record<string, unknown>;
    expect(settingsUpdate).not.toBeNull();
    expect(settingsUpdate.current_risk_score).toBe(result.score);
  });
});

// ─── Scenario 4: Risk score is clamped between 0–100 ─────────────────────────

describe('Scenario 4: risk score is clamped between 0 and 100', () => {
  it('score never exceeds 100 regardless of how many factors are stacked', () => {
    const result = calculateRiskScore({
      consecutiveMissedCheckins: 10, // +150
      distressLanguageFrequency: 10, // +100
      decliningMoodTrend: true,       // +20
      explicitCrisisKeywords: 10,     // +250
      positiveCheckins: 0,
    });

    expect(result.score).toBe(100);
  });

  it('score never goes below 0 even with many positive check-ins and no risk factors', () => {
    const result = calculateRiskScore({
      ...baseFactors,
      positiveCheckins: 100,
    });

    expect(result.score).toBe(0);
  });

  it('score stays at 0 when positive check-ins exceed all risk factors', () => {
    const result = calculateRiskScore({
      ...baseFactors,
      consecutiveMissedCheckins: 1, // +15
      positiveCheckins: 5,           // -50 → clamped to 0
    });

    expect(result.score).toBe(0);
  });

  it('updateRiskScoreOnMissedCheckin returns a score within [0, 100]', async () => {
    // Extreme case: many missed check-ins
    const checkins = Array.from({ length: 20 }, () => ({
      mood_rating: null,
      status: 'missed',
    }));

    const supabase = buildSupabaseMock(checkins);
    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-abc');

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

// ─── Scenario 5: Single event never triggers escalation threshold ─────────────

describe('Scenario 5: single event never triggers escalation threshold (score < 40)', () => {
  it('a single missed check-in alone keeps score below 40', () => {
    const result = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 1 });
    expect(result.score).toBe(15);
    expect(result.score).toBeLessThan(40);
  });

  it('a single distress language occurrence alone keeps score at 0', () => {
    const result = calculateRiskScore({ ...baseFactors, distressLanguageFrequency: 1 });
    expect(result.score).toBe(0);
    expect(result.score).toBeLessThan(40);
  });

  it('two distress language occurrences alone keep score at 0', () => {
    const result = calculateRiskScore({ ...baseFactors, distressLanguageFrequency: 2 });
    expect(result.score).toBe(0);
    expect(result.score).toBeLessThan(40);
  });

  it('a single declining mood trend alone keeps score below 40', () => {
    const result = calculateRiskScore({ ...baseFactors, decliningMoodTrend: true });
    expect(result.score).toBe(20);
    expect(result.score).toBeLessThan(40);
  });

  it('a single crisis keyword alone keeps score below 40', () => {
    const result = calculateRiskScore({ ...baseFactors, explicitCrisisKeywords: 1 });
    expect(result.score).toBe(25);
    expect(result.score).toBeLessThan(40);
  });

  it('updateRiskScoreOnMissedCheckin with a single missed check-in stays below 40', async () => {
    const checkins = [{ mood_rating: null, status: 'missed' }];
    const supabase = buildSupabaseMock(checkins);

    const result = await updateRiskScoreOnMissedCheckin(supabase as any, 'user-abc');

    expect(result.score).toBeLessThan(40);
  });

  it('level stays below elevated for a single missed check-in', () => {
    const result = calculateRiskScore({ ...baseFactors, consecutiveMissedCheckins: 1 });
    expect(result.level).toBe('low');
  });

  it('level stays below elevated for a single crisis keyword', () => {
    const result = calculateRiskScore({ ...baseFactors, explicitCrisisKeywords: 1 });
    expect(result.level).toBe('moderate');
    expect(result.score).toBeLessThan(40);
  });
});
