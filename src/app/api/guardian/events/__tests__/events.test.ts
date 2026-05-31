/**
 * @jest-environment node
 *
 * Guardian Events API Unit Tests
 *
 * Tests for tasks 2.5.1–2.5.5:
 *   GET /api/guardian/events        — paginated event list
 *   GET /api/guardian/events/export — CSV export
 */

import { NextRequest } from 'next/server';

// ─── Mock next/headers ──────────────────────────────────────────────────────
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({ get: jest.fn(), set: jest.fn() })),
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
import { GET as eventsGET } from '../route';
import { GET as exportGET } from '../export/route';

// ─── Helpers ────────────────────────────────────────────────────────────────

const MOCK_USER = { id: 'user-abc' };

const MOCK_EVENTS = [
  {
    id: 'evt-1',
    event_type: 'check_in_completed',
    event_timestamp: '2024-01-15T10:00:00Z',
    risk_score_at_event: 10,
    escalation_stage: null,
    contact_notified: false,
    user_id: MOCK_USER.id,
  },
  {
    id: 'evt-2',
    event_type: 'check_in_missed',
    event_timestamp: '2024-01-14T10:00:00Z',
    risk_score_at_event: 25,
    escalation_stage: 1,
    contact_notified: false,
    user_id: MOCK_USER.id,
  },
];

function makeGetRequest(url: string): NextRequest {
  return new NextRequest(url, { method: 'GET' });
}

function resetMocks() {
  mockGetUser.mockReset();
  mockFrom.mockReset();
}

// ─── GET /api/guardian/events ────────────────────────────────────────────────

describe('GET /api/guardian/events', () => {
  beforeEach(resetMocks);

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns paginated events with default page/limit', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: MOCK_EVENTS, error: null, count: 2 }),
    });

    const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.data).toHaveLength(2);
    expect(json.pagination.page).toBe(1);
    expect(json.pagination.limit).toBe(20);
    expect(json.pagination.total).toBe(2);
    expect(json.pagination.totalPages).toBe(1);
  });

  it('respects custom page and limit query params', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const rangeMock = jest.fn().mockReturnThis();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: rangeMock,
      then: (resolve: Function) =>
        resolve({ data: [MOCK_EVENTS[0]], error: null, count: 10 }),
    });

    const res = await eventsGET(
      makeGetRequest('http://localhost/api/guardian/events?page=2&limit=5')
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.pagination.page).toBe(2);
    expect(json.pagination.limit).toBe(5);
    expect(json.pagination.totalPages).toBe(2);
    // range should be called with offset=5, end=9
    expect(rangeMock).toHaveBeenCalledWith(5, 9);
  });

  it('filters events by type when ?type= is provided', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const eqMock = jest.fn().mockReturnThis();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: eqMock,
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: [MOCK_EVENTS[0]], error: null, count: 1 }),
    });

    const res = await eventsGET(
      makeGetRequest('http://localhost/api/guardian/events?type=check_in_completed')
    );
    expect(res.status).toBe(200);
    expect(eqMock).toHaveBeenCalledWith('event_type', 'check_in_completed');
  });

  it('returns 500 when database query fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: null, error: new Error('DB error'), count: null }),
    });

    const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch events');
  });

  it('returns empty list with correct pagination when no events exist', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      range: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: [], error: null, count: 0 }),
    });

    const res = await eventsGET(makeGetRequest('http://localhost/api/guardian/events'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data).toHaveLength(0);
    expect(json.pagination.total).toBe(0);
    expect(json.pagination.totalPages).toBe(0);
  });
});

// ─── GET /api/guardian/events/export ────────────────────────────────────────

describe('GET /api/guardian/events/export', () => {
  beforeEach(resetMocks);

  it('returns 401 when unauthenticated', async () => {
    mockGetUser.mockResolvedValue({ data: { user: null }, error: new Error('No session') });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('Unauthorized');
  });

  it('returns CSV with correct headers and Content-Type', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: MOCK_EVENTS, error: null }),
    });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toBe('text/csv');
    expect(res.headers.get('Content-Disposition')).toBe(
      'attachment; filename="guardian-events.csv"'
    );

    const text = await res.text();
    const lines = text.split('\n');
    expect(lines[0]).toBe('id,event_type,event_timestamp,risk_score_at_event,escalation_stage,contact_notified');
    expect(lines).toHaveLength(3); // header + 2 events
  });

  it('CSV rows contain correct event data', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: [MOCK_EVENTS[0]], error: null }),
    });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    const text = await res.text();
    const [, dataRow] = text.split('\n');
    expect(dataRow).toContain('evt-1');
    expect(dataRow).toContain('check_in_completed');
    expect(dataRow).toContain('2024-01-15T10:00:00Z');
    expect(dataRow).toContain('10');
    expect(dataRow).toContain('false');
  });

  it('returns only header row when no events match', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: [], error: null }),
    });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    expect(res.status).toBe(200);
    const text = await res.text();
    const lines = text.split('\n');
    expect(lines).toHaveLength(1);
    expect(lines[0]).toBe('id,event_type,event_timestamp,risk_score_at_event,escalation_stage,contact_notified');
  });

  it('applies startDate filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const gteMock = jest.fn().mockReturnThis();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      gte: gteMock,
      then: (resolve: Function) => resolve({ data: [], error: null }),
    });

    await exportGET(
      makeGetRequest('http://localhost/api/guardian/events/export?startDate=2024-01-01')
    );
    expect(gteMock).toHaveBeenCalledWith('event_timestamp', '2024-01-01');
  });

  it('applies endDate filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const lteMock = jest.fn().mockReturnThis();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      lte: lteMock,
      then: (resolve: Function) => resolve({ data: [], error: null }),
    });

    await exportGET(
      makeGetRequest('http://localhost/api/guardian/events/export?endDate=2024-01-31')
    );
    expect(lteMock).toHaveBeenCalledWith('event_timestamp', '2024-01-31');
  });

  it('applies eventType filter', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const eqMock = jest.fn().mockReturnThis();
    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: eqMock,
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) => resolve({ data: [], error: null }),
    });

    await exportGET(
      makeGetRequest('http://localhost/api/guardian/events/export?eventType=check_in_missed')
    );
    expect(eqMock).toHaveBeenCalledWith('event_type', 'check_in_missed');
  });

  it('returns 500 when database query fails', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: null, error: new Error('DB error') }),
    });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toBe('Failed to fetch events');
  });

  it('escapes commas and quotes in CSV values', async () => {
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });

    const eventWithSpecialChars = {
      ...MOCK_EVENTS[0],
      event_type: 'type,with,commas',
      escalation_stage: 'stage "quoted"',
    };

    mockFrom.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      then: (resolve: Function) =>
        resolve({ data: [eventWithSpecialChars], error: null }),
    });

    const res = await exportGET(makeGetRequest('http://localhost/api/guardian/events/export'));
    const text = await res.text();
    const [, dataRow] = text.split('\n');
    expect(dataRow).toContain('"type,with,commas"');
    expect(dataRow).toContain('"stage ""quoted"""');
  });
});
