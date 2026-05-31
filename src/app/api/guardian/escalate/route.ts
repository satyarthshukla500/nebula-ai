/**
 * POST /api/guardian/escalate
 *
 * Internal endpoint called by background services to trigger escalation.
 * Protected by x-service-key header matching GUARDIAN_SERVICE_KEY env var.
 *
 * Tasks: 2.4.1 – 2.4.7
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { shouldEscalate, updateRiskScoreOnMissedCheckin } from '@/lib/utils/risk-scoring';
import {
  getNotificationService,
  getSMSNotificationService,
  getEmailNotificationService,
} from '@/lib/notifications';
import type { NotificationPayload } from '@/lib/notifications';

// ─── Constants ────────────────────────────────────────────────────────────────

/** Stage 3 must receive a response within this many minutes or Stage 4 fires */
const STAGE_3_TIMEOUT_MINUTES = 30;

// ─── Types ────────────────────────────────────────────────────────────────────

interface EscalateRequestBody {
  userId: string;
  missedCheckIns: number;
  currentRiskScore: number;
  currentStage?: number;
}

// ─── Auth helper ──────────────────────────────────────────────────────────────

function isAuthorized(request: NextRequest): boolean {
  const serviceKey = process.env.GUARDIAN_SERVICE_KEY;
  if (!serviceKey) return false;
  return request.headers.get('x-service-key') === serviceKey;
}

// ─── Stage determination (Task 2.4.2) ────────────────────────────────────────

/**
 * Determine the next escalation stage.
 *
 * Rules (from design doc §5):
 *  Stage 1 – any missed check-in (currentStage === 0)
 *  Stage 2 – no response to Stage 1 (currentStage === 1)
 *  Stage 3 – risk >= 40 AND 3+ consecutive misses (currentStage === 2)
 *  Stage 4 – no response to Stage 3 within timeout (handled separately)
 */
function determineNextStage(
  missedCheckIns: number,
  currentRiskScore: number,
  currentStage: number,
): number | null {
  const result = shouldEscalate(currentRiskScore, missedCheckIns, currentStage);
  return result.shouldEscalate ? result.nextStage : null;
}

// ─── Stage actions ────────────────────────────────────────────────────────────

/** Task 2.4.3 – Stage 1: in-app notification to user */
async function executeStage1(userId: string): Promise<void> {
  const svc = getNotificationService();
  const payload: NotificationPayload = {
    userId,
    type: 'ESCALATION_WARNING',
    message:
      "You have a missed wellness check-in. Please complete your check-in or snooze the reminder.",
    metadata: { stage: 1 },
  };
  await svc.notifyUser(userId, payload);
}

/** Task 2.4.4 – Stage 2: SMS + email to user */
async function executeStage2(
  userId: string,
  userEmail?: string,
  userPhone?: string,
): Promise<void> {
  const message =
    "You have missed multiple wellness check-ins on Nebula AI. " +
    "Please log in to complete your check-in or disable Guardian Mode if you no longer need it.";

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

/** Task 2.4.5 – Stage 3: prominent confirmation prompt (in-app + SMS + email) */
async function executeStage3(
  userId: string,
  userEmail?: string,
  userPhone?: string,
): Promise<void> {
  const message =
    "IMPORTANT: You have missed several wellness check-ins and your risk score is elevated. " +
    "Please confirm you are okay by completing a check-in. " +
    "If you do not respond, your emergency contact may be notified.";

  const payload: NotificationPayload = {
    userId,
    type: 'EMERGENCY_ALERT',
    message,
    metadata: { stage: 3, requiresConfirmation: true },
  };

  // In-app
  const inAppSvc = getNotificationService();
  await inAppSvc.notifyUser(userId, payload, userEmail, userPhone);

  // SMS
  const smsSvc = getSMSNotificationService();
  await smsSvc.notifyUser(userId, payload, userEmail, userPhone);

  // Email
  const emailSvc = getEmailNotificationService();
  await emailSvc.notifyUser(userId, payload, userEmail, userPhone);
}

/** Task 2.4.6 – Stage 4: notify emergency contacts */
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

// ─── Timeout check (Task 2.4.7) ───────────────────────────────────────────────

/**
 * Returns true if Stage 3 was triggered more than STAGE_3_TIMEOUT_MINUTES ago
 * with no user response recorded.
 */
async function isStage3TimedOut(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
): Promise<boolean> {
  const cutoff = new Date(Date.now() - STAGE_3_TIMEOUT_MINUTES * 60 * 1000).toISOString();

  const { data } = await (supabase as any)
    .from('crisis_events')
    .select('id, user_response, event_timestamp')
    .eq('user_id', userId)
    .eq('event_type', 'escalation_stage_3')
    .is('user_response', null)
    .lt('event_timestamp', cutoff)
    .order('event_timestamp', { ascending: false })
    .limit(1);

  return Array.isArray(data) && data.length > 0;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: NextRequest) {
  // 2.4.1 – service-key auth
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let body: EscalateRequestBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { userId, missedCheckIns, currentRiskScore, currentStage = 0 } = body;

  if (!userId || typeof missedCheckIns !== 'number' || typeof currentRiskScore !== 'number') {
    return NextResponse.json(
      { error: 'userId, missedCheckIns, and currentRiskScore are required' },
      { status: 400 },
    );
  }

  try {
    const supabase = await createClient();

    // Fetch guardian settings + user profile
    const { data: settings, error: settingsError } = await (supabase as any)
      .from('guardian_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (settingsError || !settings || !settings.is_enabled) {
      return NextResponse.json(
        { error: 'Guardian Mode is not enabled for this user' },
        { status: 400 },
      );
    }

    // Fetch user profile for display name
    const { data: profile } = await (supabase as any)
      .from('profiles')
      .select('full_name, email')
      .eq('id', userId)
      .single();

    const userName: string = profile?.full_name ?? 'A user';
    const userEmail: string | undefined = profile?.email;

    // Task 3.2.2 – Recalculate and update risk score on missed check-in
    const updatedRisk = await updateRiskScoreOnMissedCheckin(supabase, userId);
    // Use the freshly calculated score for stage determination
    const effectiveRiskScore = updatedRisk.score;

    // 2.4.7 – Check Stage 3 timeout before normal stage determination
    let stageToExecute: number | null = null;
    if (currentStage === 3) {
      const timedOut = await isStage3TimedOut(supabase, userId);
      if (timedOut && effectiveRiskScore > 60) {
        stageToExecute = 4;
      }
    }

    // 2.4.2 – Normal stage determination (if timeout didn't force Stage 4)
    if (stageToExecute === null) {
      stageToExecute = determineNextStage(missedCheckIns, effectiveRiskScore, currentStage);
    }

    if (stageToExecute === null) {
      return NextResponse.json({
        success: true,
        data: { stageExecuted: null, message: 'No escalation required' },
      });
    }

    const now = new Date().toISOString();
    let notifiedContactIds: string[] = [];

    // Execute stage actions
    switch (stageToExecute) {
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
        // Fetch verified emergency contacts
        const { data: contacts } = await (supabase as any)
          .from('emergency_contacts')
          .select('id, contact_name, contact_email, contact_phone')
          .eq('user_id', userId)
          .eq('is_verified', true)
          .eq('is_active', true);

        if (contacts && contacts.length > 0) {
          notifiedContactIds = await executeStage4(userId, userName, contacts);
        }
        break;
      }
    }

    // Log escalation event to crisis_events
    const eventType = `escalation_stage_${stageToExecute}` as const;

    const eventInsert: Record<string, unknown> = {
      user_id: userId,
      event_type: eventType,
      event_timestamp: now,
      risk_score_at_event: effectiveRiskScore,
      escalation_stage: stageToExecute,
      contact_notified: notifiedContactIds.length > 0,
      notification_sent_at: now,
      metadata: {
        missed_check_ins: missedCheckIns,
        previous_stage: currentStage,
        notified_contacts: notifiedContactIds,
      },
    };

    if (notifiedContactIds.length > 0) {
      eventInsert.contact_id = notifiedContactIds[0];
    }

    await (supabase as any).from('crisis_events').insert(eventInsert);

    return NextResponse.json({
      success: true,
      data: {
        stageExecuted: stageToExecute,
        notifiedContacts: notifiedContactIds.length,
      },
    });
  } catch (error) {
    console.error('Error executing escalation:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
