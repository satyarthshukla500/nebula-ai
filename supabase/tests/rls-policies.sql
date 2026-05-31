-- =====================================================
-- RLS Policy Integration Tests for Guardian Mode
-- =====================================================
-- Run this script against a Supabase instance to verify
-- Row Level Security policies work correctly.
--
-- Prerequisites:
--   1. Migration 002_guardian_mode.sql has been applied
--   2. Two test users exist in auth.users (user_a, user_b)
--   3. Corresponding rows exist in profiles table
--
-- Usage:
--   psql $DATABASE_URL -f supabase/tests/rls-policies.sql
--
-- Or via Supabase CLI:
--   supabase db reset && psql $DATABASE_URL -f supabase/tests/rls-policies.sql
-- =====================================================

BEGIN;

-- =====================================================
-- Test Setup
-- =====================================================

-- Create test helper function
CREATE OR REPLACE FUNCTION test_assert(
  test_name TEXT,
  condition BOOLEAN,
  failure_message TEXT DEFAULT 'Assertion failed'
) RETURNS VOID AS $$
BEGIN
  IF condition THEN
    RAISE NOTICE 'PASS: %', test_name;
  ELSE
    RAISE EXCEPTION 'FAIL: % — %', test_name, failure_message;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Create test users (use fixed UUIDs for reproducibility)
DO $$
DECLARE
  user_a_id UUID := '00000000-0000-0000-0000-000000000001';
  user_b_id UUID := '00000000-0000-0000-0000-000000000002';
BEGIN
  -- Insert test users into auth.users (requires superuser or service role)
  INSERT INTO auth.users (id, email, created_at, updated_at, email_confirmed_at)
  VALUES
    (user_a_id, 'test-user-a@example.com', NOW(), NOW(), NOW()),
    (user_b_id, 'test-user-b@example.com', NOW(), NOW(), NOW())
  ON CONFLICT (id) DO NOTHING;

  -- Insert corresponding profiles
  INSERT INTO profiles (id, email)
  VALUES
    (user_a_id, 'test-user-a@example.com'),
    (user_b_id, 'test-user-b@example.com')
  ON CONFLICT (id) DO NOTHING;
END;
$$;

-- =====================================================
-- Seed test data as service role (bypasses RLS)
-- =====================================================

DO $$
DECLARE
  user_a_id UUID := '00000000-0000-0000-0000-000000000001';
  user_b_id UUID := '00000000-0000-0000-0000-000000000002';
  contact_a_id UUID;
BEGIN
  -- guardian_settings for user A
  INSERT INTO guardian_settings (user_id, consent_version, consent_timestamp)
  VALUES (user_a_id, '1.0', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- guardian_settings for user B
  INSERT INTO guardian_settings (user_id, consent_version, consent_timestamp)
  VALUES (user_b_id, '1.0', NOW())
  ON CONFLICT (user_id) DO NOTHING;

  -- emergency_contacts for user A
  INSERT INTO emergency_contacts (user_id, contact_name, relationship)
  VALUES (user_a_id, 'Contact A', 'friend')
  RETURNING id INTO contact_a_id;

  -- emergency_contacts for user B
  INSERT INTO emergency_contacts (user_id, contact_name, relationship)
  VALUES (user_b_id, 'Contact B', 'family');

  -- crisis_events for user A
  INSERT INTO crisis_events (user_id, event_type)
  VALUES (user_a_id, 'guardian_enabled');

  -- crisis_events for user B
  INSERT INTO crisis_events (user_id, event_type)
  VALUES (user_b_id, 'guardian_enabled');

  -- wellness_checkins for user A
  INSERT INTO wellness_checkins (user_id, scheduled_time)
  VALUES (user_a_id, NOW());

  -- wellness_checkins for user B
  INSERT INTO wellness_checkins (user_id, scheduled_time)
  VALUES (user_b_id, NOW());
END;
$$;

-- =====================================================
-- Test 1: guardian_settings — User A can read own row
-- =====================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT test_assert(
  'guardian_settings: user A can SELECT own row',
  (SELECT COUNT(*) FROM guardian_settings WHERE user_id = '00000000-0000-0000-0000-000000000001') = 1,
  'Expected 1 row for user A'
);

-- =====================================================
-- Test 2: guardian_settings — User A cannot read User B's row
-- =====================================================

SELECT test_assert(
  'guardian_settings: user A cannot SELECT user B row',
  (SELECT COUNT(*) FROM guardian_settings WHERE user_id = '00000000-0000-0000-0000-000000000002') = 0,
  'Expected 0 rows for user B when authenticated as user A'
);

-- =====================================================
-- Test 3: guardian_settings — User A can update own row
-- =====================================================

UPDATE guardian_settings
SET is_enabled = true
WHERE user_id = '00000000-0000-0000-0000-000000000001';

SELECT test_assert(
  'guardian_settings: user A can UPDATE own row',
  (SELECT is_enabled FROM guardian_settings WHERE user_id = '00000000-0000-0000-0000-000000000001') = true,
  'Expected is_enabled = true after update'
);

-- =====================================================
-- Test 4: guardian_settings — User A cannot update User B's row
-- =====================================================

UPDATE guardian_settings
SET is_enabled = true
WHERE user_id = '00000000-0000-0000-0000-000000000002';

-- Switch to service role to verify user B's row was NOT changed
RESET role;
RESET request.jwt.claims;

SELECT test_assert(
  'guardian_settings: user A cannot UPDATE user B row',
  (SELECT is_enabled FROM guardian_settings WHERE user_id = '00000000-0000-0000-0000-000000000002') = false,
  'Expected is_enabled = false for user B (update should have been blocked)'
);

-- =====================================================
-- Test 5: emergency_contacts — User A can manage own contacts
-- =====================================================

SET LOCAL role TO authenticated;
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-000000000001", "role": "authenticated"}';

SELECT test_assert(
  'emergency_contacts: user A can SELECT own contacts',
  (SELECT COUNT(*) FROM emergency_contacts WHERE user_id = '00000000-0000-0000-0000-000000000001') = 1,
  'Expected 1 contact for user A'
);

-- =====================================================
-- Test 6: emergency_contacts — User A cannot read User B's contacts
-- =====================================================

SELECT test_assert(
  'emergency_contacts: user A cannot SELECT user B contacts',
  (SELECT COUNT(*) FROM emergency_contacts WHERE user_id = '00000000-0000-0000-0000-000000000002') = 0,
  'Expected 0 contacts for user B when authenticated as user A'
);

-- =====================================================
-- Test 7: emergency_contacts — User A can insert own contact
-- =====================================================

INSERT INTO emergency_contacts (user_id, contact_name, relationship)
VALUES ('00000000-0000-0000-0000-000000000001', 'New Contact A', 'colleague');

SELECT test_assert(
  'emergency_contacts: user A can INSERT own contact',
  (SELECT COUNT(*) FROM emergency_contacts WHERE user_id = '00000000-0000-0000-0000-000000000001') = 2,
  'Expected 2 contacts for user A after insert'
);

-- =====================================================
-- Test 8: emergency_contacts — User A cannot insert contact for User B
-- =====================================================

DO $$
DECLARE
  insert_blocked BOOLEAN := false;
BEGIN
  BEGIN
    INSERT INTO emergency_contacts (user_id, contact_name, relationship)
    VALUES ('00000000-0000-0000-0000-000000000002', 'Malicious Contact', 'hacker');
  EXCEPTION WHEN OTHERS THEN
    insert_blocked := true;
  END;
  PERFORM test_assert(
    'emergency_contacts: user A cannot INSERT contact for user B',
    insert_blocked,
    'Expected INSERT to be blocked by RLS'
  );
END;
$$;

-- =====================================================
-- Test 9: emergency_contacts — User A can delete own contact
-- =====================================================

DELETE FROM emergency_contacts
WHERE user_id = '00000000-0000-0000-0000-000000000001'
  AND contact_name = 'New Contact A';

SELECT test_assert(
  'emergency_contacts: user A can DELETE own contact',
  (SELECT COUNT(*) FROM emergency_contacts WHERE user_id = '00000000-0000-0000-0000-000000000001') = 1,
  'Expected 1 contact for user A after delete'
);

-- =====================================================
-- Test 10: crisis_events — User A can view own events
-- =====================================================

SELECT test_assert(
  'crisis_events: user A can SELECT own events',
  (SELECT COUNT(*) FROM crisis_events WHERE user_id = '00000000-0000-0000-0000-000000000001') = 1,
  'Expected 1 crisis event for user A'
);

-- =====================================================
-- Test 11: crisis_events — User A cannot view User B's events
-- =====================================================

SELECT test_assert(
  'crisis_events: user A cannot SELECT user B events',
  (SELECT COUNT(*) FROM crisis_events WHERE user_id = '00000000-0000-0000-0000-000000000002') = 0,
  'Expected 0 crisis events for user B when authenticated as user A'
);

-- =====================================================
-- Test 12: wellness_checkins — User A can view own checkins
-- =====================================================

SELECT test_assert(
  'wellness_checkins: user A can SELECT own checkins',
  (SELECT COUNT(*) FROM wellness_checkins WHERE user_id = '00000000-0000-0000-0000-000000000001') = 1,
  'Expected 1 checkin for user A'
);

-- =====================================================
-- Test 13: wellness_checkins — User A cannot view User B's checkins
-- =====================================================

SELECT test_assert(
  'wellness_checkins: user A cannot SELECT user B checkins',
  (SELECT COUNT(*) FROM wellness_checkins WHERE user_id = '00000000-0000-0000-0000-000000000002') = 0,
  'Expected 0 checkins for user B when authenticated as user A'
);

-- =====================================================
-- Test 14: wellness_checkins — User A can update own checkin
-- =====================================================

UPDATE wellness_checkins
SET status = 'completed', mood_rating = 8, completed_at = NOW()
WHERE user_id = '00000000-0000-0000-0000-000000000001';

SELECT test_assert(
  'wellness_checkins: user A can UPDATE own checkin',
  (SELECT status FROM wellness_checkins WHERE user_id = '00000000-0000-0000-0000-000000000001') = 'completed',
  'Expected status = completed after update'
);

-- =====================================================
-- Test 15: wellness_checkins — User A cannot update User B's checkin
-- =====================================================

UPDATE wellness_checkins
SET status = 'completed'
WHERE user_id = '00000000-0000-0000-0000-000000000002';

RESET role;
RESET request.jwt.claims;

SELECT test_assert(
  'wellness_checkins: user A cannot UPDATE user B checkin',
  (SELECT status FROM wellness_checkins WHERE user_id = '00000000-0000-0000-0000-000000000002') = 'pending',
  'Expected status = pending for user B (update should have been blocked)'
);

-- =====================================================
-- Test 16: Service role can insert crisis_events for any user
-- =====================================================

-- Service role bypasses RLS entirely
INSERT INTO crisis_events (user_id, event_type)
VALUES ('00000000-0000-0000-0000-000000000001', 'check_in_missed');

INSERT INTO crisis_events (user_id, event_type)
VALUES ('00000000-0000-0000-0000-000000000002', 'check_in_missed');

SELECT test_assert(
  'crisis_events: service role can INSERT events for user A',
  (SELECT COUNT(*) FROM crisis_events WHERE user_id = '00000000-0000-0000-0000-000000000001') = 2,
  'Expected 2 crisis events for user A after service role insert'
);

SELECT test_assert(
  'crisis_events: service role can INSERT events for user B',
  (SELECT COUNT(*) FROM crisis_events WHERE user_id = '00000000-0000-0000-0000-000000000002') = 2,
  'Expected 2 crisis events for user B after service role insert'
);

-- =====================================================
-- Test 17: Service role can insert wellness_checkins for any user
-- =====================================================

INSERT INTO wellness_checkins (user_id, scheduled_time)
VALUES ('00000000-0000-0000-0000-000000000001', NOW() + INTERVAL '12 hours');

SELECT test_assert(
  'wellness_checkins: service role can INSERT checkins for any user',
  (SELECT COUNT(*) FROM wellness_checkins WHERE user_id = '00000000-0000-0000-0000-000000000001') = 2,
  'Expected 2 checkins for user A after service role insert'
);

-- =====================================================
-- Test 18: Anon role cannot access any Guardian Mode data
-- =====================================================

SET LOCAL role TO anon;

SELECT test_assert(
  'guardian_settings: anon cannot SELECT any rows',
  (SELECT COUNT(*) FROM guardian_settings) = 0,
  'Expected 0 rows for anon role'
);

SELECT test_assert(
  'emergency_contacts: anon cannot SELECT any rows',
  (SELECT COUNT(*) FROM emergency_contacts) = 0,
  'Expected 0 rows for anon role'
);

SELECT test_assert(
  'crisis_events: anon cannot SELECT any rows',
  (SELECT COUNT(*) FROM crisis_events) = 0,
  'Expected 0 rows for anon role'
);

SELECT test_assert(
  'wellness_checkins: anon cannot SELECT any rows',
  (SELECT COUNT(*) FROM wellness_checkins) = 0,
  'Expected 0 rows for anon role'
);

RESET role;

-- =====================================================
-- Cleanup
-- =====================================================

-- Remove test data
DELETE FROM guardian_settings
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DELETE FROM emergency_contacts
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DELETE FROM crisis_events
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DELETE FROM wellness_checkins
WHERE user_id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DELETE FROM profiles
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DELETE FROM auth.users
WHERE id IN (
  '00000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000002'
);

DROP FUNCTION IF EXISTS test_assert(TEXT, BOOLEAN, TEXT);

RAISE NOTICE '=====================================================';
RAISE NOTICE 'All RLS policy tests passed!';
RAISE NOTICE '=====================================================';

ROLLBACK; -- Roll back all changes (test data cleanup is included above for clarity)
