/**
 * Escalation Engine Service
 *
 * Core logic for the Guardian Mode escalation engine.
 * Runs on each cron tick (every 10 minutes) to:
 *  1. Find pending wellness_checkins older than 1 hour (missed check-ins)
 *  2. For each affected user, read current escalation state from crisis_events
 *  3. Determine the next escalation stage based on timeouts and risk score
 *  4. Execute escalation actions via the existing stage helpers
 *  5. Log the escalation event to crisis_events
 *
 * Escalation timeline (from design doc §5):
 *  Stage 1 – check-in missed > 1 hour → in-app notification
 *  Stage 2 – no response to Stage 1 after 2 hours → SMS + email to user
 *  Stage 3 – risk > 40 AND 3+ consecutive misses → confirmation prompt
 *  Stage 4 – no response to Stage 3 after 4 hours AND risk > 60 → notify emergency contact
 *
 * Tasks: 4.2.1 – 4.2.8
 */

import { createServiceClient } from '@/lib/supabase/server';
import {
  getNotificationService,
  getSMSNotificationService,
  getEmailNotificationService,
} from '@/lib/notifications';
import type { NotificationPayload } from '@/lib/notifications';

// ─── Constants ────────────────────────────────────────────────────────────────

/** A check-in is considered missed after this many ms past its scheduled time */
export const MISSED_CHECKIN_THRESHOLD_MS = 60 * 60 * 1000; // 1 hour

/** Stage 1 → Stage 2 timeout */
export const STAGE_1_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours

/** Stage 2 → Stage 3 check timeout (risk + misses evaluated at this point) */
export const STAGE_2_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Stage 3 → Stage 4 timeout */
export const STAGE_3_TIMEOUT_MS = 4 * 60 * 60 * 1000; // 4 hours

/** Risk score threshold for Stage 3 */
export const STAGE_3_RISK_THRESHOLD = 40;

/** Risk score threshold for Stage 4 */
export const STAGE_4_RISK_THRESHOLD = 60;

/** Minimum consecutive missed check-ins required for Stage 3 */
export const STAGE_3_MIN_MISSES = 3;

// ─── Types ────────────────────────────────────────────────────────────────────

export interface EscalationEngineResult {
  processedAt: string;
  usersFound: number;
  escalationsExecuted: number;
  errors: EscalationError[];
}

export interface EscalationError {
  userId: string;
  message: string;
}

export interface UserEscalationState {
  /** Current escalation stage (0 = none) */
  currentStage: number;
  /** When the current stage was triggered */
  stageTriggeredAt: Date | null;
  /** Whether the user has responded to the current stage */
  hasResponded: boolean;
}

export interface MissedCheckinRow {
  id: string;
  user_id: string;
  scheduled_time: string;
}

// ─── Escalation State Reader (Task 4.2.5) ────────────────────────────────────

/**
 * Read the current escalation state for a user from crisis_events.
 * Returns the most recent escalation stage event and whether the user responded.
 */
export async function getUserEscalationState(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<UserEscalationState> {
  // Find the most recent escalation stage event for this user
  const { data: events } = await supabase
    .from('crisis_events')
    .select('event_type, event_timestamp, user_response, escalation_stage')
    .eq('user_id', userId)
    .in('event_type', [
      'escalation_stage_1',
      'escalation_stage_2',
      'escalation_stage_3',
      'escalation_stage_4',
    ])
    .order('event_timestamp', { ascending: false })
    .limit(1);

  if (!events || events.length === 0) {
    return { currentStage: 0, stageTriggeredAt: null, hasResponded: false };
  }

  const latest = events[0] as {
    event_type: string;
    event_timestamp: string;
    user_response: string | null;
    escalation_stage: number | null;
  };

  const stageMatch = latest.event_type.match(/escalation_stage_(\d)/);
  const currentStage = stageMatch ? parseInt(stageMatch[1], 10) : (latest.escalation_stage ?? 0);

  return {
    currentStage,
    stageTriggeredAt: new Date(latest.event_timestamp),
    hasResponded: latest.user_response !== null && latest.user_response !== '',
  };
}

// ─── Consecutive Missed Check-ins Counter ────────────────────────────────────

/**
 * Count consecutive pending (missed) check-ins for a user.
 * Looks at the most recent check-ins ordered by scheduled_time descending.
 */
export async function countConsecutiveMissedCheckins(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<number> {
  const oneHourAgo = new Date(Date.now() - MISSED_CHECKIN_THRESHOLD_MS).toISOString();

  const { data: checkins } = await supabase
    .from('wellness_checkins')
    .select('id, status, scheduled_time')
    .eq('user_id', userId)
    .order('scheduled_time', { ascending: false })
    .limit(10);

  if (!checkins || checkins.length === 0) return 0;

  let count = 0;
  for (const c of checkins as Array<{ status: string; scheduled_time: string }>) {
    // Only count check-ins that are past the 1-hour threshold
    if (c.status === 'pending' && c.scheduled_time < oneHourAgo) {
      count++;
    } else if (c.status === 'completed') {
      // Stop counting at the first completed check-in
      break;
    }
  }

  return count;
}

// ─── Stage Determination (Task 4.2.3) ────────────────────────────────────────

/**
 * Determine the next escalation stage for a user given their current state.
 *
 * Returns null if no escalation is needed.
 */
export function determineEscalationStage(
  state: UserEscalationState,
  consecutiveMisses: number,
  riskScore: number,
  now: Date,
): number | null {
  const { currentStage, stageTriggeredAt, hasResponded } = state;

  // User already responded — no further escalation
  if (hasResponded && currentStage > 0) return null;

  // Stage 4 is terminal — do not escalate further
  if (currentStage === 4) return null;

  // ── Stage 0 → Stage 1: any missed check-in ───────────────────────────────
  if (currentStage === 0 && consecutiveMisses >= 1) {
    return 1;
  }

  // ── Stage 1 → Stage 2: no response after 2 hours ─────────────────────────
  if (currentStage === 1 && stageTriggeredAt !== null) {
    const elapsed = now.getTime() - stageTriggeredAt.getTime();
    if (elapsed >= STAGE_1_TIMEOUT_MS) {
      return 2;
    }
  }

  // ── Stage 2 → Stage 3: risk > 40 AND 3+ consecutive misses after 4 hours ─
  if (currentStage === 2 && stageTriggeredAt !== null) {
    const elapsed = now.getTime() - stageTriggeredAt.getTime();
    if (elapsed >= STAGE_2_TIMEOUT_MS && riskScore > STAGE_3_RISK_THRESHOLD && consecutiveMisses >= STAGE_3_MIN_MISSES) {
      return 3;
    }
  }

  // ── Stage 3 → Stage 4: no response after 4 hours AND risk > 60 ───────────
  if (currentStage === 3 && stageTriggeredAt !== null) {
    const elapsed = now.getTime() - stageTriggeredAt.getTime();
    if (elapsed >= STAGE_3_TIMEOUT_MS && riskScore > STAGE_4_RISK_THRESHOLD) {
      return 4;
    }
  }

  return null;
}

// ─── Stage Actions (Task 4.2.4) ───────────────────────────────────────────────

/** Stage 1: in-app notification to user */
async function executeStage1(userId: string): Promise<void> {
  const svc = getNotificationService();
  const payload: NotificationPayload = {
    userId,
    type: 'ESCALATION_WARNING',
    message:
      'You have a missed wellness check-in. Please complete your check-in or snooze the reminder.',
    metadata: { stage: 1 },
  };
  await svc.notifyUser(userId, payload);
}

/** Stage 2: SMS + email to user */
async function executeStage2(
  userId: string,
  userEmail?: string,
  userPhone?: string,
): Promise<void> {
  const message =
    'You have missed multiple wellness check-ins on Nebula AI. ' +
    'Please log in to complete your check-in or disable Guardian Mode if you no longer need it.';

  const payload: NotificationPayload = {
    userId,
    type: 'ESCALATION_WARNING',
    message,
    metadata: { stage: 2 },
  };

  const smsSvc = getSMSNotificationService();
  await smsSvc.notifyUser(userId, payload, userEmail, userPhone);

  const emailSvc = getEmailNotificationService();
  await emailSvc.notifyUser(userId, payload, userEmail, userPhone);
}

/** Stage 3: prominent confirmation prompt (in-app + SMS + email) */
async function executeStage3(
  userId: string,
  userEmail?: string,
  userPhone?: string,
): Promise<void> {
  const message =
    'IMPORTANT: You have missed several wellness check-ins and your risk score is elevated. ' +
    'Please confirm you are okay by completing a check-in. ' +
    'If you do not respond, your emergency contact may be notified.';

  const payload: NotificationPayload = {
    userId,
    type: 'EMERGENCY_ALERT',
    message,
    metadata: { stage: 3, requiresConfirmation: true },
  };

  const inAppSvc = getNotificationService();
  await inAppSvc.notifyUser(userId, payload, userEmail, userPhone);

  const smsSvc = getSMSNotificationService();
  await smsSvc.notifyUser(userId, payload, userEmail, userPhone);

  const emailSvc = getEmailNotificationService();
  await emailSvc.notifyUser(userId, payload, userEmail, userPhone);
}

/** Stage 4: notify emergency contacts */
async function executeStage4(
  userId: string,
  userName: string,
  contacts: Array<{ id: string; contact_email?: string; contact_phone?: string; contact_name?: string }>,
): Promise<string[]> {
  const notifiedContactIds: string[] = [];
  const svc = getNotificationService();

  for (const contact of contacts) {
    const payload: NotificationPayload = {
      userId,
      type: 'EMERGENCY_ALERT',
      message:
        `Your emergency contact ${userName} has missed several wellness check-ins on Nebula AI. ` +
        `Please reach out to them to ensure they're okay. ` +
        `This is not a medical emergency alert. If you believe they are in immediate danger, ` +
        `please contact local emergency services directly.`,
      metadata: { stage: 4, contactId: contact.id },
    };

    const result = await svc.notifyEmergencyContact(
      contact.id,
      payload,
      contact.contact_email,
      contact.contact_phone,
      contact.contact_name,
    );

    if (result.success) {
      notifiedContactIds.push(contact.id);
    }
  }

  return notifiedContactIds;
}

// ─── Per-User Escalation Processor ───────────────────────────────────────────

/**
 * Process escalation for a single user.
 * Isolated so one user's failure doesn't block others.
 */
async function processUserEscalation(
  supabase: ReturnType<typeof createServiceClient>,
  userId: string,
  now: Date,
  result: EscalationEngineResult,
): Promise<void> {
  // ── 4.2.5  Read current escalation state ─────────────────────────────────
  const state = await getUserEscalationState(supabase, userId);

  // ── Count consecutive missed check-ins ───────────────────────────────────
  const consecutiveMisses = await countConsecutiveMissedCheckins(supabase, userId);

  // ── Fetch current risk score from guardian_settings ──────────────────────
  const { data: settings } = await supabase
    .from('guardian_settings')
    .select('current_risk_score, is_enabled')
    .eq('user_id', userId)
    .single();

  if (!settings || !settings.is_enabled) {
    console.log(`[EscalationEngine] Guardian Mode not enabled for user ${userId} — skipping`);
    return;
  }

  const riskScore: number = (settings as any).current_risk_score ?? 0;

  // ── 4.2.3  Determine next escalation stage ────────────────────────────────
  const nextStage = determineEscalationStage(state, consecutiveMisses, riskScore, now);

  if (nextStage === null) {
    console.log(`[EscalationEngine] No escalation needed for user ${userId}`, {
      currentStage: state.currentStage,
      consecutiveMisses,
      riskScore,
    });
    return;
  }

  console.log(`[EscalationEngine] Escalating user ${userId} to Stage ${nextStage}`, {
    previousStage: state.currentStage,
    consecutiveMisses,
    riskScore,
  });

  // ── Fetch user profile for display name / contact info ───────────────────
  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email')
    .eq('id', userId)
    .single();

  const userName: string = (profile as any)?.full_name ?? 'A user';
  const userEmail: string | undefined = (profile as any)?.email;

  // ── 4.2.4  Execute escalation actions ────────────────────────────────────
  let notifiedContactIds: string[] = [];

  switch (nextStage) {
    case 1:
      await executeStage1(userId);
      break;

    case 2:
      await executeStage2(userId, userEmail);
      break;

    case 3:
      await executeStage3(userId, userEmail);
      break;

    case 4: {
      const { data: contacts } = await supabase
        .from('emergency_contacts')
        .select('id, contact_name, contact_email, contact_phone')
        .eq('user_id', userId)
        .eq('is_verified', true)
        .eq('is_active', true);

      if (contacts && contacts.length > 0) {
        notifiedContactIds = await executeStage4(userId, userName, contacts as any[]);
      }
      break;
    }
  }

  // ── Log escalation event to crisis_events ────────────────────────────────
  const eventType = `escalation_stage_${nextStage}` as const;
  const eventInsert: Record<string, unknown> = {
    user_id: userId,
    event_type: eventType,
    event_timestamp: now.toISOString(),
    risk_score_at_event: riskScore,
    escalation_stage: nextStage,
    contact_notified: notifiedContactIds.length > 0,
    notification_sent_at: now.toISOString(),
    metadata: {
      consecutive_misses: consecutiveMisses,
      previous_stage: state.currentStage,
      notified_contacts: notifiedContactIds,
    },
  };

  if (notifiedContactIds.length > 0) {
    eventInsert.contact_id = notifiedContactIds[0];
  }

  await supabase.from('crisis_events').insert(eventInsert);

  result.escalationsExecuted += 1;
}

// ─── Core Engine Function (Tasks 4.2.1 – 4.2.8) ──────────────────────────────

/**
 * Run one tick of the escalation engine.
 *
 * Designed to be called from a cron endpoint every 10 minutes.
 * Each user is processed independently so one failure doesn't block others.
 */
export async function runEscalationEngine(): Promise<EscalationEngineResult> {
  const now = new Date();
  const result: EscalationEngineResult = {
    processedAt: now.toISOString(),
    usersFound: 0,
    escalationsExecuted: 0,
    errors: [],
  };

  const supabase = createServiceClient();

  // ── 4.2.2  Find pending check-ins older than 1 hour ──────────────────────
  const cutoff = new Date(now.getTime() - MISSED_CHECKIN_THRESHOLD_MS).toISOString();

  const { data: missedCheckins, error: fetchError } = await supabase
    .from('wellness_checkins')
    .select('id, user_id, scheduled_time')
    .eq('status', 'pending')
    .lt('scheduled_time', cutoff);

  if (fetchError) {
    console.error('[EscalationEngine] Failed to fetch missed check-ins', {
      error: fetchError.message,
    });
    throw new Error(`Escalation engine DB fetch failed: ${fetchError.message}`);
  }

  const rows = (missedCheckins ?? []) as MissedCheckinRow[];

  // Deduplicate by user_id — one escalation pass per user per tick
  const uniqueUserIds = [...new Set(rows.map((r) => r.user_id))];
  result.usersFound = uniqueUserIds.length;

  // ── 4.2.8  Structured log for the run start ───────────────────────────────
  console.log('[EscalationEngine] Run started', {
    processedAt: result.processedAt,
    usersFound: result.usersFound,
    missedCheckinRows: rows.length,
  });

  // ── 4.2.7  Per-user error isolation ──────────────────────────────────────
  for (const userId of uniqueUserIds) {
    try {
      await processUserEscalation(supabase, userId, now, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[EscalationEngine] Error processing user ${userId}`, { error: message });
      result.errors.push({ userId, message });
    }
  }

  // ── 4.2.8  Structured log for the completed run ───────────────────────────
  console.log('[EscalationEngine] Run complete', {
    processedAt: result.processedAt,
    usersFound: result.usersFound,
    escalationsExecuted: result.escalationsExecuted,
    errorCount: result.errors.length,
    errors: result.errors,
  });

  return result;
}
