/**
 * Unit Tests: Emergency Contacts API
 *
 * Covers:
 * - POST / (add contact): success, missing name/relationship, missing phone+email, 3-contact limit, OTP sent
 * - GET / (list contacts): returns decrypted contacts
 * - DELETE /:id: removes contact (soft delete)
 * - POST /verify: OTP success, OTP wrong code
 */

import { NextRequest } from 'next/server';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock next/headers (required by supabase/server)
jest.mock('next/headers', () => ({
  cookies: jest.fn(() => ({
    get: jest.fn(),
    set: jest.fn(),
  })),
}));

// Mock Supabase server client
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

// Mock encryption utilities
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
}));

// Mock notification services
const mockNotifyEmergencyContact = jest.fn().mockResolvedValue(undefined);
jest.mock('@/lib/notifications', () => ({
  getSMSNotificationService: jest.fn(() => ({
    notifyEmergencyContact: mockNotifyEmergencyContact,
  })),
  getEmailNotificationService: jest.fn(() => ({
    notifyEmergencyContact: mockNotifyEmergencyContact,
  })),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeRequest(body: unknown, method = 'POST'): NextRequest {
  return new NextRequest('http://localhost/api/guardian/contacts', {
    method,
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeGetRequest(): NextRequest {
  return new NextRequest('http://localhost/api/guardian/contacts', { method: 'GET' });
}

function makeDeleteRequest(id: string): NextRequest {
  return new NextRequest(`http://localhost/api/guardian/contacts/${id}`, { method: 'DELETE' });
}

function makeVerifyRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost/api/guardian/contacts/verify', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a chainable Supabase query mock */
function buildQueryMock(result: { data?: unknown; error?: unknown }) {
  const chain: Record<string, jest.Mock> = {};
  const methods = ['select', 'insert', 'update', 'eq', 'order', 'single'];
  methods.forEach((m) => {
    chain[m] = jest.fn(() => chain);
  });
  // Terminal call resolves with result
  chain['single'] = jest.fn().mockResolvedValue(result);
  // Make the chain itself thenable so `await chain` works
  (chain as any).then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

const MOCK_USER = { id: 'user-123' };

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Emergency Contacts API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUser.mockResolvedValue({ data: { user: MOCK_USER }, error: null });
  });

  // ── POST / ──────────────────────────────────────────────────────────────────

  describe('POST / (add contact)', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('no session') });

      const { POST } = await import('../route');
      const res = await POST(makeRequest({ name: 'Alice', relationship: 'friend', phone: '555-0100' }));

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toBe('Unauthorized');
    });

    it('returns 400 when name is missing', async () => {
      const { POST } = await import('../route');
      const res = await POST(makeRequest({ relationship: 'friend', phone: '555-0100' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/name/i);
    });

    it('returns 400 when relationship is missing', async () => {
      const { POST } = await import('../route');
      const res = await POST(makeRequest({ name: 'Alice', phone: '555-0100' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/relationship/i);
    });

    it('returns 400 when neither phone nor email is provided', async () => {
      const { POST } = await import('../route');
      const res = await POST(makeRequest({ name: 'Alice', relationship: 'friend' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/phone or email/i);
    });

    it('returns 400 when 3-contact limit is reached', async () => {
      // Mock: existing contacts count = 3
      const countChain = buildQueryMock({ data: [{ id: '1' }, { id: '2' }, { id: '3' }], error: null });
      mockFrom.mockReturnValue(countChain);

      const { POST } = await import('../route');
      const res = await POST(makeRequest({ name: 'Alice', relationship: 'friend', phone: '555-0100' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/maximum 3/i);
    });

    it('adds contact successfully and sends OTP', async () => {
      // First call: count check (0 contacts)
      const countChain = buildQueryMock({ data: [], error: null });
      // Second call: insert
      const insertChain = buildQueryMock({
        data: { id: 'contact-abc', contact_name: 'Alice' },
        error: null,
      });

      mockFrom
        .mockReturnValueOnce(countChain)
        .mockReturnValueOnce(insertChain);

      const { POST } = await import('../route');
      const res = await POST(
        makeRequest({ name: 'Alice', relationship: 'friend', phone: '555-0100', email: 'alice@example.com' })
      );

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data.contactId).toBe('contact-abc');
      expect(json.data.verificationSent).toBe(true);

      // OTP notification should have been attempted
      expect(mockNotifyEmergencyContact).toHaveBeenCalled();
    });

    it('omits OTP from response in non-development mode', async () => {
      // Jest runs in 'test' mode, so OTP should not be included
      const countChain = buildQueryMock({ data: [], error: null });
      const insertChain = buildQueryMock({
        data: { id: 'contact-dev', contact_name: 'Bob' },
        error: null,
      });
      mockFrom.mockReturnValueOnce(countChain).mockReturnValueOnce(insertChain);

      const { POST } = await import('../route');
      const res = await POST(makeRequest({ name: 'Bob', relationship: 'sibling', phone: '555-0200' }));

      const json = await res.json();
      // In test/production mode, OTP must not be exposed
      expect(json.data.otp).toBeUndefined();
    });
  });

  // ── GET / ───────────────────────────────────────────────────────────────────

  describe('GET / (list contacts)', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('no session') });

      const { GET } = await import('../route');
      const res = await GET(makeGetRequest());

      expect(res.status).toBe(401);
    });

    it('returns decrypted contacts', async () => {
      const rawContacts = [
        {
          id: 'c1',
          contact_name: 'Alice',
          contact_phone: 'enc:555-0100',
          contact_email: 'enc:alice@example.com',
          verification_code: 'should-be-stripped',
          is_active: true,
        },
      ];

      const listChain = buildQueryMock({ data: rawContacts, error: null });
      mockFrom.mockReturnValue(listChain);

      const { GET } = await import('../route');
      const res = await GET(makeGetRequest());

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.data).toHaveLength(1);

      const contact = json.data[0];
      // verification_code must not be exposed
      expect(contact.verification_code).toBeUndefined();
      // phone/email should be decrypted (mock strips 'enc:' prefix)
      expect(contact.contact_phone).toBe('555-0100');
      expect(contact.contact_email).toBe('alice@example.com');
    });
  });

  // ── DELETE /:id ─────────────────────────────────────────────────────────────

  describe('DELETE /:id (remove contact)', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('no session') });

      const { DELETE } = await import('../[id]/route');
      const res = await DELETE(makeDeleteRequest('contact-abc'), { params: { id: 'contact-abc' } });

      expect(res.status).toBe(401);
    });

    it('soft-deletes the contact and returns success', async () => {
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValue(updateChain);

      const { DELETE } = await import('../[id]/route');
      const res = await DELETE(makeDeleteRequest('contact-abc'), { params: { id: 'contact-abc' } });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.message).toMatch(/removed/i);
    });

    it('returns 500 when database update fails', async () => {
      const errorChain = buildQueryMock({ data: null, error: new Error('db error') });
      mockFrom.mockReturnValue(errorChain);

      const { DELETE } = await import('../[id]/route');
      const res = await DELETE(makeDeleteRequest('contact-abc'), { params: { id: 'contact-abc' } });

      expect(res.status).toBe(500);
    });
  });

  // ── POST /verify ─────────────────────────────────────────────────────────────

  describe('POST /verify (verify OTP)', () => {
    it('returns 401 when unauthenticated', async () => {
      mockGetUser.mockResolvedValueOnce({ data: { user: null }, error: new Error('no session') });

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'c1', verificationCode: '123456' }));

      expect(res.status).toBe(401);
    });

    it('returns 400 when contactId or verificationCode is missing', async () => {
      const { POST } = await import('../verify/route');

      const res1 = await POST(makeVerifyRequest({ verificationCode: '123456' }));
      expect(res1.status).toBe(400);

      const res2 = await POST(makeVerifyRequest({ contactId: 'c1' }));
      expect(res2.status).toBe(400);
    });

    it('returns 404 when contact is not found', async () => {
      const notFoundChain = buildQueryMock({ data: null, error: new Error('not found') });
      mockFrom.mockReturnValue(notFoundChain);

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'missing', verificationCode: '123456' }));

      expect(res.status).toBe(404);
    });

    it('returns success when OTP is correct', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(true);

      const contact = {
        id: 'c1',
        user_id: MOCK_USER.id,
        is_verified: false,
        verification_code: 'salt:hashedotp',
        verification_sent_at: new Date().toISOString(),
      };

      const fetchChain = buildQueryMock({ data: contact, error: null });
      const updateChain = buildQueryMock({ data: null, error: null });
      mockFrom.mockReturnValueOnce(fetchChain).mockReturnValueOnce(updateChain);

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'c1', verificationCode: '123456' }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.verified).toBe(true);
    });

    it('returns 400 when OTP is wrong', async () => {
      const { verifyCode } = await import('@/lib/utils/guardian-encryption');
      (verifyCode as jest.Mock).mockReturnValueOnce(false);

      const contact = {
        id: 'c1',
        user_id: MOCK_USER.id,
        is_verified: false,
        verification_code: 'salt:hashedotp',
        verification_sent_at: new Date().toISOString(),
      };

      const fetchChain = buildQueryMock({ data: contact, error: null });
      mockFrom.mockReturnValue(fetchChain);

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'c1', verificationCode: '000000' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/invalid verification code/i);
    });

    it('returns success immediately when contact is already verified', async () => {
      const contact = {
        id: 'c1',
        user_id: MOCK_USER.id,
        is_verified: true,
        verification_code: null,
        verification_sent_at: new Date().toISOString(),
      };

      const fetchChain = buildQueryMock({ data: contact, error: null });
      mockFrom.mockReturnValue(fetchChain);

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'c1', verificationCode: '123456' }));

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.verified).toBe(true);
    });

    it('returns 400 when OTP has expired', async () => {
      const expiredTime = new Date(Date.now() - 20 * 60 * 1000).toISOString(); // 20 min ago
      const contact = {
        id: 'c1',
        user_id: MOCK_USER.id,
        is_verified: false,
        verification_code: 'salt:hashedotp',
        verification_sent_at: expiredTime,
      };

      const fetchChain = buildQueryMock({ data: contact, error: null });
      mockFrom.mockReturnValue(fetchChain);

      const { POST } = await import('../verify/route');
      const res = await POST(makeVerifyRequest({ contactId: 'c1', verificationCode: '123456' }));

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toMatch(/expired/i);
    });
  });
});
