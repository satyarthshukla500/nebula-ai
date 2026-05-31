/**
 * Check-in Scheduler Service
 *
 * Core logic for the Guardian Mode check-in scheduler.
 * Runs on each cron tick (every 5 minutes) to:
 *  1. Find all users with check-ins due (is_enabled = true AND next_check_in_due <= now)
 *  2. Create a wellness_checkins record for each due check-in
 *  3. Send an in-app reminder notification (skipped during quiet hours)
 *  4. Update next_check_in_due based on check_in_interval
 *
 * Tasks: 4.1.1 – 4.1.8
 */

import { createServiceClient } from '@/lib/supabase/server';
import { getNotificationService } from '@/lib/notifications';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface GuardianSettingsRow {
  id: string;
  user_id: string;
  is_enabled: boolean;
  check_in_interval: string; // e.g. '12 hours', '6 hours', '24 hours'
  next_check_in_due: string | null;
  notification_preferences: {
    in_app?: boolean;
    quiet_hours_start?: string; // 'HH:MM'
    quiet_hours_end?: string;   // 'HH:MM'
  } | null;
}

export interface SchedulerResult {
  processedAt: string;
  usersFound: number;
  checkInsCreated: number;
  notificationsSent: number;
  errors: SchedulerError[];
}

export interface SchedulerError {
  userId: string;
  message: string;
}

// ─── Quiet Hours Helper ───────────────────────────────────────────────────────

/**
 * Returns true if the given time falls within quiet hours.
 * Handles overnight ranges (e.g. 22:00 – 08:00).
 *
 * @param now - Current date/time
 * @param quietStart - 'HH:MM' string (e.g. '22:00')
 * @param quietEnd   - 'HH:MM' string (e.g. '08:00')
 */
export function isQuietHours(now: Date, quietStart: string, quietEnd: string): boolean {
  const [startH, startM] = quietStart.split(':').map(Number);
  const [endH, endM] = quietEnd.split(':').map(Number);

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startH * 60 + startM;
  const endMinutes = endH * 60 + endM;

  if (startMinutes <= endMinutes) {
    // Same-day range (e.g. 08:00 – 22:00)
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight range (e.g. 22:00 – 08:00)
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

// ─── Interval Parser ──────────────────────────────────────────────────────────

/**
 * Parse a Postgres interval string like '12 hours' or '6 hours' into milliseconds.
 * Falls back to 12 hours if the format is unrecognised.
 */
export function parseIntervalMs(interval: string): number {
  const match = interval.match(/^(\d+)\s+hours?$/i);
  if (match) {
    return parseInt(match[1], 10) * 60 * 60 * 1000;
  }
  // Fallback: 12 hours
  return 12 * 60 * 60 * 1000;
}

// ─── Core Scheduler Function ──────────────────────────────────────────────────

/**
 * Run one tick of the check-in scheduler.
 *
 * Designed to be called from a cron endpoint every 5 minutes.
 * Each user is processed independently so one failure doesn't block others.
 */
export async function runCheckInScheduler(): Promise<SchedulerResult> {
  const now = new Date();
  const result: SchedulerResult = {
    processedAt: now.toISOString(),
    usersFound: 0,
    checkInsCreated: 0,
    notificationsSent: 0,
    errors: [],
  };

  const supabase = createServiceClient();

  // ── 4.1.2  Find all users with due check-ins ──────────────────────────────
  const { data: dueSettings, error: fetchError } = await supabase
    .from('guardian_settings')
    .select('id, user_id, is_enabled, check_in_interval, next_check_in_due, notification_preferences')
    .eq('is_enabled', true)
    .lte('next_check_in_due', now.toISOString());

  if (fetchError) {
    console.error('[CheckInScheduler] Failed to fetch due check-ins', { error: fetchError.message });
    throw new Error(`Scheduler DB fetch failed: ${fetchError.message}`);
  }

  const settings = (dueSettings ?? []) as GuardianSettingsRow[];
  result.usersFound = settings.length;

  console.log(`[CheckInScheduler] Run started`, {
    processedAt: result.processedAt,
    usersFound: result.usersFound,
  });

  // ── Process each user independently (4.1.7 retry / error isolation) ───────
  for (const setting of settings) {
    try {
      await processUserCheckIn(supabase, setting, now, result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[CheckInScheduler] Error processing user ${setting.user_id}`, { error: message });
      result.errors.push({ userId: setting.user_id, message });
    }
  }

  // ── 4.1.8  Structured log for the completed run ───────────────────────────
  console.log('[CheckInScheduler] Run complete', {
    processedAt: result.processedAt,
    usersFound: result.usersFound,
    checkInsCreated: result.checkInsCreated,
    notificationsSent: result.notificationsSent,
    errorCount: result.errors.length,
    errors: result.errors,
  });

  return result;
}

// ─── Per-User Processing ──────────────────────────────────────────────────────

async function processUserCheckIn(
  supabase: ReturnType<typeof createServiceClient>,
  setting: GuardianSettingsRow,
  now: Date,
  result: SchedulerResult
): Promise<void> {
  const { user_id } = setting;

  // ── 4.1.3  Create wellness_checkins record ────────────────────────────────
  const { data: checkin, error: insertError } = await supabase
    .from('wellness_checkins')
    .insert({
      user_id,
      scheduled_time: now.toISOString(),
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError) {
    throw new Error(`Failed to create check-in record: ${insertError.message}`);
  }

  result.checkInsCreated += 1;

  console.log(`[CheckInScheduler] Created check-in for user ${user_id}`, {
    checkinId: (checkin as any)?.id,
    scheduledTime: now.toISOString(),
  });

  // ── 4.1.4  Send in-app reminder (respects quiet hours) ────────────────────
  const prefs = setting.notification_preferences ?? {};
  const inAppEnabled = prefs.in_app !== false; // default true

  if (inAppEnabled) {
    const quietStart = prefs.quiet_hours_start ?? '22:00';
    const quietEnd = prefs.quiet_hours_end ?? '08:00';
    const inQuietHours = isQuietHours(now, quietStart, quietEnd);

    if (inQuietHours) {
      // 4.1.6  Quiet hours: skip notification but check-in record already created
      console.log(`[CheckInScheduler] Quiet hours active for user ${user_id} — skipping reminder`, {
        quietStart,
        quietEnd,
        currentTime: `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`,
      });
    } else {
      try {
        const notificationService = getNotificationService();
        await notificationService.notifyUser(user_id, {
          userId: user_id,
          type: 'CHECKIN_REMINDER',
          message: 'Time for your Guardian Mode wellness check-in. How are you doing?',
          metadata: {
            checkinId: (checkin as any)?.id,
            scheduledTime: now.toISOString(),
          },
        });
        result.notificationsSent += 1;
      } catch (notifErr) {
        // Notification failure is non-fatal — log and continue
        const msg = notifErr instanceof Error ? notifErr.message : String(notifErr);
        console.warn(`[CheckInScheduler] Notification failed for user ${user_id}`, { error: msg });
      }
    }
  }

  // ── 4.1.5  Update next_check_in_due ──────────────────────────────────────
  const intervalMs = parseIntervalMs(setting.check_in_interval);
  const nextDue = new Date(now.getTime() + intervalMs);

  const { error: updateError } = await supabase
    .from('guardian_settings')
    .update({
      next_check_in_due: nextDue.toISOString(),
      updated_at: now.toISOString(),
    })
    .eq('user_id', user_id);

  if (updateError) {
    throw new Error(`Failed to update next_check_in_due: ${updateError.message}`);
  }

  console.log(`[CheckInScheduler] Updated next_check_in_due for user ${user_id}`, {
    nextDue: nextDue.toISOString(),
    interval: setting.check_in_interval,
  });
}
