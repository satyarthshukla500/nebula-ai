/**
 * @jest-environment node
 *
 * Guardian Settings API Unit Tests
 *
 * Tests for task 2.1.9: Unit tests for settings API
 * Covers: POST /enable, POST /disable, GET /, PATCH /
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers (required by supabase/server) ───────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
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

// ─── Import route handlers after mocks are set up ──────────────────────────
import { POST as enablePOST } from '../enable/route';
import { POST as disablePOST } from '../disable/route';
import { GET, PATCH } from '../route';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-123' };

function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/guardian/settings', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a chainable Supabase query mock that resolves to { data, error } */
function makeQuery(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'single'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  // Terminal call resolves the promise
  Object.defineProperty(chain, 'then', {
    get: () =>
      (resolve: (v: unknown) => void) =>
        resolve(result),
  });
  // Make the chain itself thenable so `await chain` works
  (chain as any)[Symbol.toStringTag] = 'Promise';
  return chain;
}

/** Reset all query mocks between tests */
function resetMocks() {
  mockGetUser.mockReset();
  mockFrom.mockReset();
}

// ─── POST /enable ────────────────────────────────────────────────────────────

describe('POST /api/guardian/settings/enable', () => {
  beforeEach(resetMocks);

  const validBody = {
    consentVersion: '1.0',
    checkInInterval: '12 hours',
    preferredTimes: ['09:00', '21:00'],
    riskThreshold: 40,
  };

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await enablePOST(makeRequest(validBody));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 when consentVersion is missing', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await enablePOST(makeRequest({ ...validBody, consentVersion: undefined }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Missing required fields/);
  });

  it('returns 400 when checkInInterval is invalid', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await enablePOST(makeRequest({ ...validBody, checkInInterval: '3 hours' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid checkInInterval/);
  });

  it('returns 400 when preferredTimes is empty', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await enablePOST(makeRequest({ ...validBody, preferredTimes: [] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/preferredTimes/);
  });

  it('returns 400 when riskThreshold is out of range', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await enablePOST(makeRequest({ ...validBody, riskThreshold: 150 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/riskThreshold/);
  });

  it('returns 400 when no verified emergency contact exists', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    // contacts query returns empty array
    const contactsChain = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: [], error: null }),
    };
    mockFrom.mockReturnValue(contactsChain);

    const res = await enablePOST(makeRequest(validBody));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/verified emergency contact/);
  });

  it('enables Guardian Mode and returns settingsId + nextCheckInDue', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const settingsRecord = {
      id: 'settings-abc',
      user_id: MOCK_USER.id,
      is_enabled: true,
    };

    let callCount = 0;
    mockFrom.mockImplementation((table: string) => {
      callCount++;
      if (table === 'emergency_contacts') {
        return {
          select: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: [{ id: 'contact-1' }], error: null }),
        };
      }
      if (table === 'guardian_settings') {
        // First call: check existing (returns null → insert path)
        // Second call: insert
        if (callCount === 2) {
          return {
            select: jest.fn().mockReturnThis(),
            eq: jest.fn().mockReturnThis(),
            single: jest.fn().mockReturnThis(),
            then: (resolve: Function) => resolve({ data: null, error: { code: 'PGRST116' } }),
          };
        }
        return {
          insert: jest.fn().mockReturnThis(),
          select: jest.fn().mockReturnThis(),
          single: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: settingsRecord, error: null }),
        };
      }
      // crisis_events insert
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await enablePOST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveProperty('settingsId');
    expect(json.data).toHaveProperty('nextCheckInDue');
  });
});

// ─── POST /disable ───────────────────────────────────────────────────────────

describe('POST /api/guardian/settings/disable', () => {
  beforeEach(resetMocks);

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await disablePOST(makeRequest({}));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('disables Guardian Mode and returns success message', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockImplementation((table: string) => {
      if (table === 'guardian_settings') {
        return {
          update: jest.fn().mockReturnThis(),
          eq: jest.fn().mockReturnThis(),
          then: (resolve: Function) => resolve({ data: null, error: null }),
        };
      }
      // crisis_events
      return {
        insert: jest.fn().mockReturnThis(),
        then: (resolve: Function) => resolve({ data: null, error: null }),
      };
    });

    const res = await disablePOST(makeRequest({ reason: 'No longer needed' }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.message).toMatch(/disabled/i);
  });

  it('returns 500 when database update fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockImplementation(() => ({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: new Error('DB error') }),
    }));

    const res = await disablePOST(makeRequest({}));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toMatch(/Failed to disable/);
  });
});

// ─── GET /api/guardian/settings ──────────────────────────────────────────────

describe('GET /api/guardian/settings', () => {
  beforeEach(resetMocks);

  function makeGetRequest(): NextRequest {
    return new NextRequest('http://localhost/api/guardian/settings', { method: 'GET' });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns null data when no settings exist yet', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: { code: 'PGRST116' } }),
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toBeNull();
  });

  it('returns settings when they exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const settings = { id: 'settings-1', user_id: MOCK_USER.id, is_enabled: true };
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: settings, error: null }),
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(settings);
  });

  it('returns 500 on unexpected database error', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: { code: 'UNEXPECTED' } }),
    });

    const res = await GET(makeGetRequest());
    expect(res.status).toBe(500);
  });
});

// ─── PATCH /api/guardian/settings ────────────────────────────────────────────

describe('PATCH /api/guardian/settings', () => {
  beforeEach(resetMocks);

  function makePatchRequest(body: unknown): NextRequest {
    return new NextRequest('http://localhost/api/guardian/settings', {
      method: 'PATCH',
      body: JSON.stringify(body),
      headers: { 'Content-Type': 'application/json' },
    });
  }

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await PATCH(makePatchRequest({ checkInInterval: '12 hours' }));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns 400 for invalid checkInInterval', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await PATCH(makePatchRequest({ checkInInterval: '3 hours' }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/Invalid checkInInterval/);
  });

  it('returns 400 for empty preferredTimes array', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await PATCH(makePatchRequest({ preferredTimes: [] }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/preferredTimes/);
  });

  it('returns 400 for riskThreshold out of range', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const res = await PATCH(makePatchRequest({ riskThreshold: -5 }));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.error).toMatch(/riskThreshold/);
  });

  it('updates settings and returns updated data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const updated = { id: 'settings-1', user_id: MOCK_USER.id, risk_threshold: 60 };
    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: updated, error: null }),
    });

    const res = await PATCH(makePatchRequest({ riskThreshold: 60 }));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toEqual(updated);
  });

  it('returns 500 when database update fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      update: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      select: jest.fn().mockReturnThis(),
      single: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: null, error: new Error('DB error') }),
    });

    const res = await PATCH(makePatchRequest({ riskThreshold: 50 }));
    expect(res.status).toBe(500);
  });
});
