import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const DEFAULT_SNOOZE_MINUTES = 30;
const MAX_SNOOZE_MINUTES = 120;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    // Check authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Parse optional snoozeDuration
    let snoozeDuration = DEFAULT_SNOOZE_MINUTES;
    const body = await request.json().catch(() => ({}));
    if (body.snoozeDuration !== undefined) {
      const parsed = Number(body.snoozeDuration);
      if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_SNOOZE_MINUTES) {
        return NextResponse.json(
          { error: `snoozeDuration must be an integer between 1 and ${MAX_SNOOZE_MINUTES}` },
          { status: 400 }
        );
      }
      snoozeDuration = parsed;
    }

    // Verify Guardian Mode is enabled
    const { data: settings, error: settingsError } = await (supabase as any)
      .from('guardian_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError || !settings || !(settings as any).is_enabled) {
      return NextResponse.json(
        { error: 'Guardian Mode is not enabled' },
        { status: 400 }
      );
    }

    // Find the current pending check-in
    const { data: pendingCheckin, error: checkinError } = await (supabase as any)
      .from('wellness_checkins')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: false })
      .limit(1)
      .single();

    if (checkinError || !pendingCheckin) {
      return NextResponse.json(
        { error: 'No pending check-in found' },
        { status: 404 }
      );
    }

    const now = new Date();
    const newScheduledTime = new Date(now.getTime() + snoozeDuration * 60 * 1000);

    // Update the check-in's scheduled_time
    const { error: updateError } = await (supabase as any)
      .from('wellness_checkins')
      .update({ scheduled_time: newScheduledTime.toISOString() })
      .eq('id', (pendingCheckin as any).id);

    if (updateError) {
      console.error('Error snoozing check-in:', updateError);
      return NextResponse.json(
        { error: 'Failed to snooze check-in' },
        { status: 500 }
      );
    }

    // Log the snooze event
    await (supabase as any).from('crisis_events').insert({
      user_id: user.id,
      event_type: 'check_in_snoozed',
      event_timestamp: now.toISOString(),
      metadata: {
        checkin_id: (pendingCheckin as any).id,
        snooze_duration_minutes: snoozeDuration,
        new_scheduled_time: newScheduledTime.toISOString(),
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        newScheduledTime: newScheduledTime.toISOString(),
        snoozeDurationMinutes: snoozeDuration,
      },
    });
  } catch (error) {
    console.error('Error processing snooze request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
