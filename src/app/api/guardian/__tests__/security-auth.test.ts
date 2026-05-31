/**
 * @jest-environment node
 *
 * Security Tests: Guardian Mode API — Authentication Enforcement
 *
 * Task 7.2.4: Test all API endpoints reject unauthenticated requests
 * Requirements: 3.1
 *
 * All Guardian Mode API endpoints must return 401 when the user is not
 * authenticated (getUser returns null user).
 *
 * The escalation endpoint uses a different auth mechanism (x-service-key header)
 * and returns 403 when the service key is missing or wrong.
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers ────────────────────────────────────────────────────────
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
  encrypt: jest.fn((v: string) => `enc:${v}`),
}));

// ─── Notification services mock ───────────────────────────────────────────────
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

// ─── Risk scoring mock ────────────────────────────────────────────────────────
jest.mock('@/lib/utils/risk-scoring', () => ({
  calculateRiskScore: jest.fn(() => ({ score: 0, level: 'low', factors: {}, explanation: '' })),
  analyzeDistressLanguage: jest.fn(() => 0),
  analyzeCrisisKeywords: jest.fn(() => 0),
  detectDecliningMoodTrend: jest.fn(() => false),
  getRiskLevelDescription: jest.fn(() => 'Low risk'),
  shouldEscalate: jest.fn(() => ({ shouldEscalate: false, nextStage: null })),
  updateRiskScoreOnMissedCheckin: jest.fn(() => Promise.resolve({ score: 0 })),
}));

// ─── Import route handlers after mocks ───────────────────────────────────────
import { GET as settingsGET, PATCH as settingsPATCH } from '../settings/route';
import { POST as settingsEnablePOST } from '../settings/enable/route';
import { POST as settingsDisablePOST } from '../settings/disable/route';
import { GET as contactsGET, POST as contactsPOST } from '../contacts/route';
import { DELETE as contactDELETE } from '../contacts/[id]/route';
import { POST as contactsVerifyPOST } from '../contacts/verify/route';
import { POST as checkinCompletePOST } from '../checkin/complete/route';
import { GET as checkinStatusGET } from '../checkin/status/route';
import { POST as checkinSnoozePOST } from '../checkin/snooze/route';
import { GET as eventsGET } from '../events/route';
import { GET as eventsExportGET } from '../events/export/route';
import { GET as riskScoreGET } from '../risk-score/route';
import { POST as escalatePOST } from '../escalate/route';

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

function makePatchRequest(url: string, body: unknown = {}): NextRequest {
  return new NextRequest(url, {
    method: 'PATCH',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Guardian Mode API — Authentication Enforcement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: unauthenticated
    mockGetUser.mockResolvedValue({
      data: { user: null },
      error: new Error('Not authenticated'),
    });
  });

  // ── Settings endpoints ────────────────────────────────────────────────────

  describe('GET /api/guardian/settings', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await settingsGET(makeGetRequest('http://localhost/api/guardian/settings'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('PATCH /api/guardian/settings', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await settingsPATCH(
        makePatchRequest('http://localhost/api/guardian/settings', { riskThreshold: 50 })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/guardian/settings/enable', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await settingsEnablePOST(
        makePostRequest('http://localhost/api/guardian/settings/enable', {
          consentVersion: '1.0',
          checkInInterval: '12 hours',
          preferredTimes: ['09:00'],
        })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/guardian/settings/disable', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await settingsDisablePOST(
        makePostRequest('http://localhost/api/guardian/settings/disable', {})
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Contacts endpoints ────────────────────────────────────────────────────

  describe('GET /api/guardian/contacts', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await contactsGET(makeGetRequest('http://localhost/api/guardian/contacts'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/guardian/contacts', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await contactsPOST(
        makePostRequest('http://localhost/api/guardian/contacts', {
          contactName: 'Alice',
          contactPhone: '+1234567890',
          relationship: 'friend',
        })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('DELETE /api/guardian/contacts/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await contactDELETE(
        new NextRequest('http://localhost/api/guardian/contacts/contact-123', {
          method: 'DELETE',
        }),
        { params: { id: 'contact-123' } }
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/guardian/contacts/verify', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await contactsVerifyPOST(
        makePostRequest('http://localhost/api/guardian/contacts/verify', {
          contactId: 'contact-123',
          verificationCode: '123456',
        })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Check-in endpoints ────────────────────────────────────────────────────

  describe('POST /api/guardian/checkin/complete', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await checkinCompletePOST(
        makePostRequest('http://localhost/api/guardian/checkin/complete', { moodRating: 7 })
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('GET /api/guardian/checkin/status', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await checkinStatusGET(
        makeGetRequest('http://localhost/api/guardian/checkin/status')
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('POST /api/guardian/checkin/snooze', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await checkinSnoozePOST(
        makePostRequest('http://localhost/api/guardian/checkin/snooze', {})
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Events endpoints ──────────────────────────────────────────────────────

  describe('GET /api/guardian/events', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  describe('GET /api/guardian/events/export', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await eventsExportGET(
        makeGetRequest('http://localhost/api/guardian/events/export')
      );
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Risk score endpoint ───────────────────────────────────────────────────

  describe('GET /api/guardian/risk-score', () => {
    it('returns 401 when unauthenticated', async () => {
      const res = await riskScoreGET(makeGetRequest('http://localhost/api/guardian/risk-score'));
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toMatch(/unauthorized/i);
    });
  });

  // ── Escalation endpoint (service-key auth, not user auth) ─────────────────

  describe('POST /api/guardian/escalate — service-key auth', () => {
    const validBody = {
      userId: 'user-123',
      missedCheckIns: 3,
      currentRiskScore: 50,
    };

    it('returns 403 when x-service-key header is missing', async () => {
      const originalKey = process.env.GUARDIAN_SERVICE_KEY;
      process.env.GUARDIAN_SERVICE_KEY = 'secret-key';

      const res = await escalatePOST(
        new NextRequest('http://localhost/api/guardian/escalate', {
          method: 'POST',
          body: JSON.stringify(validBody),
          headers: { 'Content-Type': 'application/json' },
          // No x-service-key header
        })
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/forbidden/i);

      process.env.GUARDIAN_SERVICE_KEY = originalKey;
    });

    it('returns 403 when x-service-key header is wrong', async () => {
      const originalKey = process.env.GUARDIAN_SERVICE_KEY;
      process.env.GUARDIAN_SERVICE_KEY = 'secret-key';

      const res = await escalatePOST(
        new NextRequest('http://localhost/api/guardian/escalate', {
          method: 'POST',
          body: JSON.stringify(validBody),
          headers: {
            'Content-Type': 'application/json',
            'x-service-key': 'wrong-key',
          },
        })
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/forbidden/i);

      process.env.GUARDIAN_SERVICE_KEY = originalKey;
    });

    it('returns 403 when GUARDIAN_SERVICE_KEY env var is not set', async () => {
      const originalKey = process.env.GUARDIAN_SERVICE_KEY;
      delete process.env.GUARDIAN_SERVICE_KEY;

      const res = await escalatePOST(
        new NextRequest('http://localhost/api/guardian/escalate', {
          method: 'POST',
          body: JSON.stringify(validBody),
          headers: {
            'Content-Type': 'application/json',
            'x-service-key': 'any-key',
          },
        })
      );

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toMatch(/forbidden/i);

      process.env.GUARDIAN_SERVICE_KEY = originalKey;
    });
  });
});
