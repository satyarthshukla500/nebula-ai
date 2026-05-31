-- =====================================================
-- GUARDIAN MODE DATABASE SCHEMA
-- =====================================================
-- This migration creates all tables for Guardian Mode:
-- - guardian_settings: User Guardian Mode configuration
-- - emergency_contacts: Verified emergency contacts
-- - crisis_events: Audit log of all Guardian Mode events
-- - wellness_checkins: Scheduled check-in records
-- =====================================================

-- Enable UUID extension if not already enabled
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- TABLE: guardian_settings
-- =====================================================
CREATE TABLE guardian_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  is_enabled BOOLEAN DEFAULT false,
  consent_version TEXT NOT NULL,
  consent_timestamp TIMESTAMPTZ NOT NULL,
  check_in_interval INTERVAL NOT NULL DEFAULT '12 hours',
  preferred_check_in_times TIME[] DEFAULT ARRAY['09:00:00', '21:00:00'],
  last_check_in TIMESTAMPTZ,
  next_check_in_due TIMESTAMPTZ,
  risk_threshold INTEGER DEFAULT 40 CHECK (risk_threshold BETWEEN 0 AND 100),
  current_risk_score INTEGER DEFAULT 0 CHECK (current_risk_score BETWEEN 0 AND 100),
  notification_preferences JSONB DEFAULT '{
    "in_app": true,
    "push": true,
    "email": true,
    "sms": false,
    "quiet_hours_start": "22:00",
    "quiet_hours_end": "08:00"
  }'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id)
);

-- Indexes for guardian_settings
CREATE INDEX idx_guardian_settings_user_id ON guardian_settings(user_id);
CREATE INDEX idx_guardian_settings_next_checkin ON guardian_settings(next_check_in_due) WHERE is_enabled = true;

-- =====================================================
-- TABLE: emergency_contacts
-- =====================================================
CREATE TABLE emergency_contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  contact_name TEXT NOT NULL,
  contact_phone TEXT, -- Will be encrypted at application layer
  contact_email TEXT, -- Will be encrypted at application layer
  relationship TEXT NOT NULL,
  is_verified BOOLEAN DEFAULT false,
  verification_code TEXT, -- Will be hashed at application layer
  verification_sent_at TIMESTAMPTZ,
  verified_at TIMESTAMPTZ,
  notification_level TEXT DEFAULT 'critical_only' CHECK (notification_level IN ('critical_only', 'all_escalations')),
  can_receive_sms BOOLEAN DEFAULT true,
  can_receive_email BOOLEAN DEFAULT true,
  is_active BOOLEAN DEFAULT true,
  opt_out_token TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for emergency_contacts
CREATE INDEX idx_emergency_contacts_user_id ON emergency_contacts(user_id);
CREATE INDEX idx_emergency_contacts_verified ON emergency_contacts(user_id, is_verified) WHERE is_active = true;

-- Function to enforce max 3 active contacts per user
CREATE OR REPLACE FUNCTION check_max_contacts()
RETURNS TRIGGER AS $$
BEGIN
  IF (SELECT COUNT(*) FROM emergency_contacts 
      WHERE user_id = NEW.user_id AND is_active = true) > 3 THEN
    RAISE EXCEPTION 'Maximum 3 active emergency contacts allowed per user';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER enforce_max_contacts
  AFTER INSERT OR UPDATE ON emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION check_max_contacts();

-- =====================================================
-- TABLE: crisis_events
-- =====================================================
CREATE TABLE crisis_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN (
    'guardian_enabled',
    'guardian_disabled',
    'check_in_completed',
    'check_in_missed',
    'check_in_snoozed',
    'escalation_stage_1',
    'escalation_stage_2',
    'escalation_stage_3',
    'escalation_stage_4',
    'user_response',
    'contact_notified',
    'risk_score_updated'
  )),
  event_timestamp TIMESTAMPTZ DEFAULT NOW(),
  risk_score_at_event INTEGER CHECK (risk_score_at_event BETWEEN 0 AND 100),
  escalation_stage INTEGER CHECK (escalation_stage BETWEEN 0 AND 4),
  user_response TEXT,
  user_response_timestamp TIMESTAMPTZ,
  contact_notified BOOLEAN DEFAULT false,
  contact_id UUID REFERENCES emergency_contacts(id),
  notification_sent_at TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for crisis_events
CREATE INDEX idx_crisis_events_user_id ON crisis_events(user_id, event_timestamp DESC);
CREATE INDEX idx_crisis_events_type ON crisis_events(event_type, event_timestamp DESC);
CREATE INDEX idx_crisis_events_escalation ON crisis_events(user_id, escalation_stage) WHERE escalation_stage IS NOT NULL;

-- =====================================================
-- TABLE: wellness_checkins
-- =====================================================
CREATE TABLE wellness_checkins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scheduled_time TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'missed', 'late')),
  mood_rating INTEGER CHECK (mood_rating BETWEEN 1 AND 10),
  notes TEXT, -- Will be encrypted at application layer
  risk_indicators JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for wellness_checkins
CREATE INDEX idx_wellness_checkins_user_id ON wellness_checkins(user_id, scheduled_time DESC);
CREATE INDEX idx_wellness_checkins_status ON wellness_checkins(user_id, status) WHERE status = 'pending';

-- =====================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- =====================================================

-- guardian_settings RLS
ALTER TABLE guardian_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own guardian settings"
  ON guardian_settings FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own guardian settings"
  ON guardian_settings FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own guardian settings"
  ON guardian_settings FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- emergency_contacts RLS
ALTER TABLE emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own emergency contacts"
  ON emergency_contacts FOR ALL
  USING (auth.uid() = user_id);

-- crisis_events RLS
ALTER TABLE crisis_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own crisis events"
  ON crisis_events FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "System can insert crisis events"
  ON crisis_events FOR INSERT
  WITH CHECK (true); -- Service role only

-- wellness_checkins RLS
ALTER TABLE wellness_checkins ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own checkins"
  ON wellness_checkins FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can complete own checkins"
  ON wellness_checkins FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "System can create checkins"
  ON wellness_checkins FOR INSERT
  WITH CHECK (true); -- Service role only

-- =====================================================
-- HELPER FUNCTIONS
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_guardian_settings_updated_at
  BEFORE UPDATE ON guardian_settings
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_emergency_contacts_updated_at
  BEFORE UPDATE ON emergency_contacts
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- COMMENTS FOR DOCUMENTATION
-- =====================================================

COMMENT ON TABLE guardian_settings IS 'User Guardian Mode configuration and status';
COMMENT ON TABLE emergency_contacts IS 'Verified emergency contacts for Guardian Mode';
COMMENT ON TABLE crisis_events IS 'Audit log of all Guardian Mode events';
COMMENT ON TABLE wellness_checkins IS 'Scheduled wellness check-in records';

COMMENT ON COLUMN emergency_contacts.contact_phone IS 'Encrypted at application layer';
COMMENT ON COLUMN emergency_contacts.contact_email IS 'Encrypted at application layer';
COMMENT ON COLUMN wellness_checkins.notes IS 'Encrypted at application layer';
