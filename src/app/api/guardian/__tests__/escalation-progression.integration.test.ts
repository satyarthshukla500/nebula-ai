/**
 * @jest-environment node
 *
 * Integration Tests: Guardian Mode Escalation Progression Stage 1 → 4
 *
 * Task 7.1.4: Test escalation progression Stage 1 → 4 via API
 * Requirements: 1.4
 *
 * Covers:
 * 1. Stage 1 progression: 1 missed check-in → Stage 1 fires (in-app notification)
 * 2. Stage 2 progression: Stage 1 already fired, 2 missed check-ins → Stage 2 fires (SMS + email to user)
 * 3. Stage 3 progression: Stage 2 already fired, 3+ missed check-ins, risk > 40 → Stage 3 fires (confirmation prompt)
 * 4. Stage 4 progression: Stage 3 timed out (no response in 30+ min), risk > 60 → Stage 4 fires (notify emergency contact)
 * 5. User responds at Stage 1 → escalation stops (no further stages)
 * 6. Stage 4 does NOT fire if Stage 3 has not timed out
 * 7. Stage 4 does NOT fire if risk score is ≤ 60 even if Stage 3 timed out
 * 8. No escalation when 0 missed check-ins and low risk score
 * 9. Emergency contact message does NOT include private messages or medical info
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers ──────────────────────────────────────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
}));

// ─── Mock risk scoring ──────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  shouldEscalate: jest.fn(),
  updateRiskScoreOnMissedCheckin: jest.fn(),
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

// ─── Import route handler and mocked functions after mocks ──────────────────
import { POST } from '../escalate/route';
import { shouldEscalate, updateRiskScoreOnMissedCheckin } from '@/lib/utils/risk-scoring';

// ─── Constants ────────────────────────────────────────────────────────────────

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
  {
    id: 'contact-1',
    contact_name: 'Emergency Contact',
    contact_email: 'ec@example.com',
    contact_phone: '+1234567890',
  },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
  (updateRiskScoreOnMissedCheckin as jest.Mock).mockReset();
  process.env.GUARDIAN_SERVICE_KEY = SERVICE_KEY;
}

/**
 * Build a standard Supabase mock for stages 1–3 (no Stage 3 timeout event).
 * crisis_events returns empty (no timed-out stage 3 event).
 */
function setupStandardSupabase(overrides: {
  crisisEvents?: object[];
  contacts?: object[];
  riskScore?: number;
} = {}) {
  const crisisEvents = overrides.crisisEvents ?? [];
  const contacts = overrides.contacts ?? MOCK_CONTACTS;
  const riskScore = overrides.riskScore ?? 30;

  (updateRiskScoreOnMissedCheckin as jest.Mock).mockResolvedValue({ score: riskScore });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'guardian_settings') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
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
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: crisisEvents, error: null }),
      };
    }
    if (table === 'emergency_contacts') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: contacts, error: null }),
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
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: null }),
    };
  });
}

/**
 * Build a Supabase mock that simulates a timed-out Stage 3 event.
 * crisis_events returns a stage 3 event with no user_response older than 30 min.
 */
function setupStage4Supabase(riskScore = 70) {
  const timedOutEvent = [
    {
      id: 'event-stage3',
      user_response: null,
      event_timestamp: new Date(Date.now() - 35 * 60 * 1000).toISOString(),
    },
  ];

  (updateRiskScoreOnMissedCheckin as jest.Mock).mockResolvedValue({ score: riskScore });

  mockFrom.mockImplementation((table: string) => {
    if (table === 'guardian_settings') {
      return {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
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
        insert: jest.fn().mockReturnThis(),
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
      select: jest.fn().mockReturnThis(),
      insert: jest.fn().mockReturnThis(),
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: null }),
    };
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Guardian Mode Escalation Progression Integration', () => {
  beforeEach(resetMocks);

  // ── Scenario 1: Stage 1 progression ────────────────────────────────────────

  describe('Scenario 1: Stage 1 — 1 missed check-in fires in-app notification', () => {
    it('returns stageExecuted=1 for 1 missed check-in', async () => {
      setupStandardSupabase({ riskScore: 15 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
      mockNotifyUser.mockResolvedValue({ success: true });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.stageExecuted).toBe(1);
    });

    it('Stage 1 sends an in-app notification to the user', async () => {
      setupStandardSupabase({ riskScore: 15 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 })
      );

      expect(mockNotifyUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          type: 'ESCALATION_WARNING',
          metadata: expect.objectContaining({ stage: 1 }),
        }),
      );
    });

    it('Stage 1 does NOT notify emergency contacts', async () => {
      setupStandardSupabase({ riskScore: 15 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 1 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 1, currentRiskScore: 15, currentStage: 0 })
      );

      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 2: Stage 2 progression ────────────────────────────────────────

  describe('Scenario 2: Stage 2 — Stage 1 already fired, 2 missed check-ins fires SMS + email', () => {
    it('returns stageExecuted=2 when currentStage=1 and 2 missed check-ins', async () => {
      setupStandardSupabase({ riskScore: 30 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
      mockNotifyUser.mockResolvedValue({ success: true });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBe(2);
    });

    it('Stage 2 sends both SMS and email notifications to the user', async () => {
      setupStandardSupabase({ riskScore: 30 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 })
      );

      // notifyUser called at least twice (SMS + email)
      expect(mockNotifyUser.mock.calls.length).toBeGreaterThanOrEqual(2);
      const payloads = mockNotifyUser.mock.calls.map((c: any[]) => c[1]);
      expect(payloads.every((p: any) => p.metadata?.stage === 2)).toBe(true);
    });

    it('Stage 2 does NOT notify emergency contacts', async () => {
      setupStandardSupabase({ riskScore: 30 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 2 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 2, currentRiskScore: 30, currentStage: 1 })
      );

      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 3: Stage 3 progression ────────────────────────────────────────

  describe('Scenario 3: Stage 3 — Stage 2 fired, 3+ missed check-ins, risk > 40 fires confirmation prompt', () => {
    it('returns stageExecuted=3 when currentStage=2, 3 missed check-ins, risk > 40', async () => {
      setupStandardSupabase({ riskScore: 55 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
      mockNotifyUser.mockResolvedValue({ success: true });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBe(3);
    });

    it('Stage 3 sends in-app, SMS, and email notifications (3 channels)', async () => {
      setupStandardSupabase({ riskScore: 55 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 })
      );

      // notifyUser called at least 3 times (in-app + SMS + email)
      expect(mockNotifyUser.mock.calls.length).toBeGreaterThanOrEqual(3);
      const payloads = mockNotifyUser.mock.calls.map((c: any[]) => c[1]);
      expect(payloads.every((p: any) => p.metadata?.stage === 3)).toBe(true);
    });

    it('Stage 3 sends an EMERGENCY_ALERT type notification', async () => {
      setupStandardSupabase({ riskScore: 55 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 })
      );

      const payloads = mockNotifyUser.mock.calls.map((c: any[]) => c[1]);
      expect(payloads.some((p: any) => p.type === 'EMERGENCY_ALERT')).toBe(true);
    });

    it('Stage 3 does NOT notify emergency contacts', async () => {
      setupStandardSupabase({ riskScore: 55 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: true, nextStage: 3 });
      mockNotifyUser.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 2 })
      );

      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 4: Stage 4 progression ────────────────────────────────────────

  describe('Scenario 4: Stage 4 — Stage 3 timed out (30+ min), risk > 60 fires emergency contact notification', () => {
    it('returns stageExecuted=4 when Stage 3 timed out and risk > 60', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBe(4);
    });

    it('Stage 4 notifies the emergency contact', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      expect(mockNotifyEmergencyContact).toHaveBeenCalledWith(
        'contact-1',
        expect.objectContaining({
          type: 'EMERGENCY_ALERT',
          metadata: expect.objectContaining({ stage: 4 }),
        }),
        expect.any(String), // contact_email
        expect.any(String), // contact_phone
        expect.any(String), // contact_name
      );
    });

    it('Stage 4 returns the count of notified contacts', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      const json = await res.json();
      expect(json.data.notifiedContacts).toBe(1);
    });
  });

  // ── Scenario 5: User responds at Stage 1 → escalation stops ────────────────

  describe('Scenario 5: User responds at Stage 1 → escalation stops', () => {
    it('returns no escalation when shouldEscalate returns false (user already responded)', async () => {
      setupStandardSupabase({ riskScore: 10 });
      // Simulate user responded — shouldEscalate returns false
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 1 });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 0, currentRiskScore: 10, currentStage: 1 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBeNull();
    });

    it('does not send any notifications when escalation stops after user response', async () => {
      setupStandardSupabase({ riskScore: 10 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 1 });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 0, currentRiskScore: 10, currentStage: 1 })
      );

      expect(mockNotifyUser).not.toHaveBeenCalled();
      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 6: Stage 4 does NOT fire if Stage 3 has not timed out ──────────

  describe('Scenario 6: Stage 4 does NOT fire if Stage 3 has not timed out', () => {
    it('returns stageExecuted=null when currentStage=3 but no timed-out Stage 3 event exists', async () => {
      // crisis_events returns empty — no timed-out stage 3 event
      setupStandardSupabase({ crisisEvents: [], riskScore: 70 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBeNull();
    });

    it('does not notify emergency contacts when Stage 3 has not timed out', async () => {
      setupStandardSupabase({ crisisEvents: [], riskScore: 70 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 7: Stage 4 does NOT fire if risk score ≤ 60 ───────────────────

  describe('Scenario 7: Stage 4 does NOT fire if risk score is ≤ 60 even if Stage 3 timed out', () => {
    it('returns stageExecuted=null when Stage 3 timed out but risk score is exactly 60', async () => {
      // Stage 3 timed out but risk score is 60 (not > 60, so Stage 4 should NOT fire)
      // The route checks isStage3TimedOut first; if risk ≤ 60 it falls through to shouldEscalate
      setupStage4Supabase(60);
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 60, currentStage: 3 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBeNull();
    });

    it('returns stageExecuted=null when Stage 3 timed out but risk score is below 60', async () => {
      setupStage4Supabase(50);
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 50, currentStage: 3 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.data.stageExecuted).toBeNull();
    });

    it('does not notify emergency contacts when risk score is ≤ 60', async () => {
      setupStage4Supabase(55);
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 3 });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 55, currentStage: 3 })
      );

      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 8: No escalation when 0 missed check-ins and low risk score ────

  describe('Scenario 8: No escalation when 0 missed check-ins and low risk score', () => {
    it('returns stageExecuted=null for 0 missed check-ins and risk score of 5', async () => {
      setupStandardSupabase({ riskScore: 5 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 0 });

      const res = await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 0, currentRiskScore: 5, currentStage: 0 })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.stageExecuted).toBeNull();
      expect(json.data.message).toMatch(/[Nn]o escalation/);
    });

    it('sends no notifications when no escalation is required', async () => {
      setupStandardSupabase({ riskScore: 5 });
      (shouldEscalate as jest.Mock).mockReturnValue({ shouldEscalate: false, nextStage: 0 });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 0, currentRiskScore: 5, currentStage: 0 })
      );

      expect(mockNotifyUser).not.toHaveBeenCalled();
      expect(mockNotifyEmergencyContact).not.toHaveBeenCalled();
    });
  });

  // ── Scenario 9: Emergency contact message does NOT include private info ──────

  describe('Scenario 9: Emergency contact message does NOT include private messages or medical info', () => {
    it('Stage 4 message does not contain private message content', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      expect(mockNotifyEmergencyContact).toHaveBeenCalled();
      const [, payload] = mockNotifyEmergencyContact.mock.calls[0];

      // Must not contain private message content indicators
      expect(payload.message).not.toMatch(/private message/i);
      expect(payload.message).not.toMatch(/chat history/i);
      expect(payload.message).not.toMatch(/conversation/i);
    });

    it('Stage 4 message does not contain medical or diagnostic information', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      const [, payload] = mockNotifyEmergencyContact.mock.calls[0];

      // Must not contain medical/diagnostic terms or private health information
      expect(payload.message).not.toMatch(/diagnos/i);
      expect(payload.message).not.toMatch(/mental health condition/i);
      expect(payload.message).not.toMatch(/risk score/i);
      // "medical emergency" is acceptable (it clarifies this is NOT one); bare "medical" as a claim is not
      expect(payload.message).not.toMatch(/medical (diagnosis|condition|record|history)/i);
    });

    it('Stage 4 message contains only the user name and a safe wellness check message', async () => {
      setupStage4Supabase(70);
      mockNotifyEmergencyContact.mockResolvedValue({ success: true });

      await POST(
        makeRequest({ userId: 'user-123', missedCheckIns: 3, currentRiskScore: 70, currentStage: 3 })
      );

      const [, payload] = mockNotifyEmergencyContact.mock.calls[0];

      // Should mention the user's name and missed check-ins in a safe way
      expect(payload.message).toMatch(/Test User/);
      expect(payload.message).toMatch(/missed.*check-in|check-in.*missed/i);
      // Should clarify this is not a medical emergency alert
      expect(payload.message).toMatch(/not a medical emergency/i);
    });
  });
});
