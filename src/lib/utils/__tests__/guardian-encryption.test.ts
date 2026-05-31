/**
 * @jest-environment node
 *
 * Guardian Mode Encryption Tests
 *
 * Tests for tasks 1.3.4, 1.3.5, and 7.2.2:
 * - 1.3.4: Test encryption/decryption functions
 * - 1.3.5: Verify encrypted data cannot be read without key
 * - 7.2.2: Test encrypted fields are unreadable without the key
 *
 * Validates: Requirements 3.1
 */

import {
  encrypt,
  decrypt,
  encryptContactData,
  decryptContactData,
  hashVerificationCode,
  verifyCode,
  generateOTP,
  generateOptOutToken,
} from '../guardian-encryption';

// Set a valid 32-byte (64 hex char) encryption key for tests
const TEST_KEY = 'a'.repeat(64); // 64 hex chars = 32 bytes

beforeEach(() => {
  process.env.ENCRYPTION_KEY = TEST_KEY;
});

afterEach(() => {
  delete process.env.ENCRYPTION_KEY;
});

// =====================================================
// Task 1.3.4: Test encryption/decryption functions
// =====================================================

describe('encrypt / decrypt round-trip', () => {
  it('decrypts back to the original plaintext', () => {
    const plaintext = 'test@example.com';
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  it('round-trips phone numbers correctly', () => {
    const phone = '+1-555-867-5309';
    expect(decrypt(encrypt(phone))).toBe(phone);
  });

  it('round-trips multi-line wellness notes', () => {
    const notes = 'Feeling anxious today.\nSlept poorly.\nNeed support.';
    expect(decrypt(encrypt(notes))).toBe(notes);
  });

  it('round-trips unicode / emoji content', () => {
    const text = 'Feeling 😊 today — café';
    expect(decrypt(encrypt(text))).toBe(text);
  });
});

describe('encrypted output differs from plaintext', () => {
  it('ciphertext does not contain the original string', () => {
    const plaintext = 'secret@example.com';
    const ciphertext = encrypt(plaintext);
    expect(ciphertext).not.toContain(plaintext);
  });

  it('produces different ciphertext each call (random IV)', () => {
    const plaintext = 'same input';
    const c1 = encrypt(plaintext);
    const c2 = encrypt(plaintext);
    expect(c1).not.toBe(c2);
  });

  it('ciphertext is in iv:authTag:data format', () => {
    const parts = encrypt('hello').split(':');
    expect(parts).toHaveLength(3);
    // IV = 16 bytes = 32 hex chars
    expect(parts[0]).toHaveLength(32);
    // Auth tag = 16 bytes = 32 hex chars
    expect(parts[1]).toHaveLength(32);
  });
});

describe('null / empty input handling', () => {
  it('encrypt returns empty string for empty input', () => {
    expect(encrypt('')).toBe('');
  });

  it('decrypt returns empty string for empty input', () => {
    expect(decrypt('')).toBe('');
  });
});

// =====================================================
// Task 1.3.5: Verify encrypted data cannot be read without key
// =====================================================

describe('decryption with wrong key fails', () => {
  it('throws when decrypting with a different key', () => {
    const ciphertext = encrypt('sensitive data');

    // Switch to a different key
    process.env.ENCRYPTION_KEY = 'b'.repeat(64);

    expect(() => decrypt(ciphertext)).toThrow();
  });

  it('throws when ENCRYPTION_KEY is missing', () => {
    const ciphertext = encrypt('sensitive data');
    delete process.env.ENCRYPTION_KEY;
    expect(() => decrypt(ciphertext)).toThrow();
  });
});

describe('missing ENCRYPTION_KEY', () => {
  it('encrypt() throws when ENCRYPTION_KEY is not set', () => {
    delete process.env.ENCRYPTION_KEY;
    expect(() => encrypt('sensitive data')).toThrow();
  });
});

describe('decryption with tampered ciphertext fails', () => {
  it('throws when the auth tag is tampered', () => {
    const ciphertext = encrypt('sensitive data');
    const parts = ciphertext.split(':');
    // Flip one char in the auth tag
    parts[1] = parts[1].replace(/.$/, parts[1].endsWith('a') ? 'b' : 'a');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws when the encrypted payload is tampered', () => {
    const ciphertext = encrypt('sensitive data');
    const parts = ciphertext.split(':');
    // Flip one char in the payload
    parts[2] = parts[2].replace(/.$/, parts[2].endsWith('a') ? 'b' : 'a');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws when the IV is tampered', () => {
    const ciphertext = encrypt('sensitive data');
    const parts = ciphertext.split(':');
    parts[0] = parts[0].replace(/.$/, parts[0].endsWith('a') ? 'b' : 'a');
    expect(() => decrypt(parts.join(':'))).toThrow();
  });

  it('throws on malformed ciphertext (wrong number of segments)', () => {
    expect(() => decrypt('notvalid')).toThrow();
    expect(() => decrypt('only:two')).toThrow();
  });
});

// =====================================================
// encryptContactData / decryptContactData helpers
// =====================================================

describe('encryptContactData / decryptContactData', () => {
  it('round-trips phone and email', () => {
    const original = { phone: '+1-555-000-1234', email: 'contact@example.com' };
    const encrypted = encryptContactData(original);
    const decrypted = decryptContactData(encrypted);
    expect(decrypted).toEqual(original);
  });

  it('encrypted values differ from originals', () => {
    const original = { phone: '+1-555-000-1234', email: 'contact@example.com' };
    const encrypted = encryptContactData(original);
    expect(encrypted.phone).not.toBe(original.phone);
    expect(encrypted.email).not.toBe(original.email);
  });

  it('handles missing phone gracefully', () => {
    const original = { email: 'only@example.com' };
    const encrypted = encryptContactData(original);
    const decrypted = decryptContactData(encrypted);
    expect(decrypted.phone).toBeUndefined();
    expect(decrypted.email).toBe(original.email);
  });

  it('handles missing email gracefully', () => {
    const original = { phone: '+1-555-000-9999' };
    const encrypted = encryptContactData(original);
    const decrypted = decryptContactData(encrypted);
    expect(decrypted.email).toBeUndefined();
    expect(decrypted.phone).toBe(original.phone);
  });
});

// =====================================================
// OTP helpers
// =====================================================

describe('generateOTP', () => {
  it('generates a 6-digit numeric string by default', () => {
    const otp = generateOTP();
    expect(otp).toMatch(/^\d{6}$/);
  });

  it('respects custom length', () => {
    expect(generateOTP(8)).toHaveLength(8);
  });
});

describe('hashVerificationCode / verifyCode', () => {
  it('verifies the correct code', () => {
    const code = '123456';
    const hash = hashVerificationCode(code);
    expect(verifyCode(code, hash)).toBe(true);
  });

  it('rejects a wrong code', () => {
    const hash = hashVerificationCode('123456');
    expect(verifyCode('654321', hash)).toBe(false);
  });

  it('produces different hashes for the same code (random salt)', () => {
    const h1 = hashVerificationCode('123456');
    const h2 = hashVerificationCode('123456');
    expect(h1).not.toBe(h2);
  });

  it('returns false for malformed stored hash', () => {
    expect(verifyCode('123456', 'nocolon')).toBe(false);
  });
});

describe('generateOptOutToken', () => {
  it('returns a 64-char hex string', () => {
    expect(generateOptOutToken()).toMatch(/^[0-9a-f]{64}$/);
  });

  it('generates unique tokens', () => {
    expect(generateOptOutToken()).not.toBe(generateOptOutToken());
  });
});
