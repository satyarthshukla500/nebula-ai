/**
 * Cron Endpoint: Escalation Engine
 *
 * Called every 10 minutes by Vercel Cron (or any external scheduler).
 * Protected by CRON_SECRET environment variable.
 *
 * Vercel cron.json example:
 * {
 *   "crons": [
 *     { "path": "/api/guardian/cron/checkin",  "schedule": "every-5-minutes"  },
 *     { "path": "/api/guardian/cron/escalate", "schedule": "every-10-minutes" }
 *   ]
 * }
 *
 * (Cron expressions: checkin = "star/5 * * * *", escalate = "star/10 * * * *")
 *
 * Task 4.2.1
 */

import { NextRequest, NextResponse } from 'next/server';
import { runEscalationEngine } from '@/lib/services/escalation-engine';

export async function GET(request: NextRequest) {
  // ── Auth: verify CRON_SECRET ──────────────────────────────────────────────
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    const expectedBearer = `Bearer ${cronSecret}`;
    if (authHeader !== expectedBearer) {
      console.warn('[CronRoute] Unauthorized escalation cron request — invalid or missing CRON_SECRET');
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    console.log('[CronRoute] Escalation engine triggered');
    const result = await runEscalationEngine();

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error('[CronRoute] Escalation engine failed', { error: message });

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 },
    );
  }
}
