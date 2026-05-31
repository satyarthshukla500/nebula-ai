/**
 * Cron Endpoint: Check-in Scheduler
 *
 * Called every 5 minutes by Vercel Cron (or any external scheduler).
 * Protected by CRON_SECRET environment variable.
 *
 * Vercel cron.json example:
 * {
 *   "crons": [{ "path": "/api/guardian/cron/checkin", "schedule": "* /5 * * * *" }]
 * }
 *
 * (Note: remove the space in "* /5" — it is "star-slash-5" in the actual cron expression)
 *
 * Task 4.1.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { runCheckInScheduler } from '@/lib/services/checkin-scheduler';

export async function GET(request: NextRequest) {
  // ── Auth: verify CRON_SECRET ──────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const expectedBearer = `Bearer ${cronSecret}`;
    if (authHeader !== expectedBearer) {
      console.warn('[CronRoute] Unauthorized cron request — invalid or missing CRON_SECRET');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('[CronRoute] Check-in scheduler triggered');
    const result = await runCheckInScheduler();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CronRoute] Check-in scheduler failed', { error: message });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
