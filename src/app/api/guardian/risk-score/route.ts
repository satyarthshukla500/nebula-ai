export const dynamic = 'force-dynamic';

/**
 * GET /api/guardian/risk-score
 *
 * Returns the current risk score with a full breakdown (factors, level, explanation)
 * for the authenticated user.
 *
 * Task: 3.2.4
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import {
  calculateRiskScore,
  detectDecliningMoodTrend,
  getRiskLevelDescription,
} from '@/lib/utils/risk-scoring';

export async function GET(_request: NextRequest) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch guardian settings
    const { data: settings, error: settingsError } = await (supabase as any)
      .from('guardian_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (settingsError && settingsError.code !== 'PGRST116') {
      console.error('Error fetching guardian settings:', settingsError);
      return NextResponse.json(
        { error: 'Failed to fetch Guardian Mode settings' },
        { status: 500 },
      );
    }

    if (!settings || !settings.is_enabled) {
      return NextResponse.json(
        { error: 'Guardian Mode is not enabled' },
        { status: 400 },
      );
    }

    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // Fetch recent check-ins for factor calculation
    const { data: recentCheckins } = await (supabase as any)
      .from('wellness_checkins')
      .select('mood_rating, status, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: false });

    const checkins: Array<{ mood_rating: number | null; status: string }> =
      recentCheckins ?? [];

    // Consecutive missed check-ins (from most recent)
    let consecutiveMissed = 0;
    for (const c of checkins) {
      if (c.status === 'missed') {
        consecutiveMissed++;
      } else {
        break;
      }
    }

    // Positive check-ins in last 7 days
    const positiveCheckins = checkins.filter(
      (c) => c.status === 'completed' && c.mood_rating !== null && c.mood_rating >= 7,
    ).length;

    // Mood ratings for trend detection (oldest first)
    const moodRatings = checkins
      .filter((c) => c.mood_rating !== null)
      .map((c) => c.mood_rating as number)
      .reverse();

    const decliningMoodTrend = detectDecliningMoodTrend(moodRatings);

    // Fetch distress/crisis counts from the most recent risk_score_updated event
    // (these are captured at check-in time and stored in metadata)
    const { data: lastRiskEvent } = await (supabase as any)
      .from('crisis_events')
      .select('metadata')
      .eq('user_id', user.id)
      .eq('event_type', 'risk_score_updated')
      .order('event_timestamp', { ascending: false })
      .limit(1)
      .single();

    const lastFactors = lastRiskEvent?.metadata?.factors ?? {};
    const distressLanguageFrequency = lastFactors.distressLanguage
      ? Math.round(lastFactors.distressLanguage / 10)
      : 0;
    const explicitCrisisKeywords = lastFactors.crisisKeywords
      ? Math.round(lastFactors.crisisKeywords / 25)
      : 0;

    // Recalculate for a fresh, consistent breakdown
    const riskResult = calculateRiskScore({
      consecutiveMissedCheckins: consecutiveMissed,
      distressLanguageFrequency,
      decliningMoodTrend,
      explicitCrisisKeywords,
      positiveCheckins,
    });

    return NextResponse.json({
      success: true,
      data: {
        score: riskResult.score,
        level: riskResult.level,
        levelDescription: getRiskLevelDescription(riskResult.level),
        factors: {
          consecutiveMissedCheckins: consecutiveMissed,
          distressLanguageFrequency,
          decliningMoodTrend,
          explicitCrisisKeywords,
          positiveCheckins,
        },
        scoreBreakdown: riskResult.factors,
        explanation: riskResult.explanation,
        storedScore: settings.current_risk_score ?? 0,
        lastUpdated: settings.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching risk score:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
