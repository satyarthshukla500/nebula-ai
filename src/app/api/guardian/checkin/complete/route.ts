import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { encrypt } from '@/lib/utils/guardian-encryption';
import { calculateRiskScore, analyzeDistressLanguage, analyzeCrisisKeywords } from '@/lib/utils/risk-scoring';

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

    const body = await request.json();
    const { moodRating, notes, riskIndicators } = body;

    // Validate mood rating
    if (moodRating !== undefined && (typeof moodRating !== 'number' || moodRating < 1 || moodRating > 10)) {
      return NextResponse.json(
        { error: 'moodRating must be a number between 1 and 10' },
        { status: 400 }
      );
    }

    // Get Guardian Mode settings
    const { data: settings, error: settingsError } = await supabase
      .from('guardian_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    const guardianSettings = settings as any;

    if (settingsError || !guardianSettings || !guardianSettings.is_enabled) {
      return NextResponse.json(
        { error: 'Guardian Mode is not enabled' },
        { status: 400 }
      );
    }

    // Find pending check-in
    const { data: pendingCheckin, error: checkinError } = await supabase
      .from('wellness_checkins')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'pending')
      .order('scheduled_time', { ascending: false })
      .limit(1)
      .single();

    const now = new Date();
    let checkinId: string;
    const pendingCheckinData = pendingCheckin as any;

    if (pendingCheckinData) {
      // Update existing pending check-in
      const encryptedNotes = notes ? encrypt(notes) : null;
      
      const { data: updated, error: updateError } = await (supabase as any)
        .from('wellness_checkins')
        .update({
          completed_at: now.toISOString(),
          status: 'completed',
          mood_rating: moodRating,
          notes: encryptedNotes,
          risk_indicators: riskIndicators || {},
        })
        .eq('id', pendingCheckinData.id)
        .select()
        .single();

      if (updateError) {
        console.error('Error updating check-in:', updateError);
        return NextResponse.json(
          { error: 'Failed to complete check-in' },
          { status: 500 }
        );
      }

      checkinId = updated.id;
    } else {
      // Create new check-in
      const encryptedNotes = notes ? encrypt(notes) : null;
      
      const { data: created, error: createError } = await (supabase as any)
        .from('wellness_checkins')
        .insert({
          user_id: user.id,
          scheduled_time: now.toISOString(),
          completed_at: now.toISOString(),
          status: 'completed',
          mood_rating: moodRating,
          notes: encryptedNotes,
          risk_indicators: riskIndicators || {},
        })
        .select()
        .single();

      if (createError) {
        console.error('Error creating check-in:', createError);
        return NextResponse.json(
          { error: 'Failed to complete check-in' },
          { status: 500 }
        );
      }

      checkinId = created.id;
    }

    // Calculate next check-in time
    const intervalHours = parseInt(guardianSettings.check_in_interval.split(' ')[0]);
    const nextCheckInDue = new Date(now.getTime() + intervalHours * 60 * 60 * 1000);

    // Analyze notes for risk factors
    let distressCount = 0;
    let crisisCount = 0;
    if (notes) {
      distressCount = analyzeDistressLanguage(notes);
      crisisCount = analyzeCrisisKeywords(notes);
    }

    // Get recent check-ins for risk calculation (last 7 days)
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const { data: recentCheckins } = await supabase
      .from('wellness_checkins')
      .select('mood_rating, status, created_at')
      .eq('user_id', user.id)
      .gte('created_at', sevenDaysAgo.toISOString())
      .order('created_at', { ascending: true });

    const recentCheckinsData = recentCheckins as any;

    // Calculate risk score
    const moodRatings = recentCheckinsData?.map((c: any) => c.mood_rating).filter((r: any) => r !== null) || [];
    const positiveCheckins = recentCheckinsData?.filter((c: any) => c.mood_rating && c.mood_rating >= 7).length || 0;
    
    const riskScore = calculateRiskScore({
      consecutiveMissedCheckins: 0, // Reset on completion
      distressLanguageFrequency: distressCount,
      decliningMoodTrend: false, // Would need more sophisticated analysis
      explicitCrisisKeywords: crisisCount,
      positiveCheckins,
    });

    // Update Guardian Mode settings
    await (supabase as any)
      .from('guardian_settings')
      .update({
        last_check_in: now.toISOString(),
        next_check_in_due: nextCheckInDue.toISOString(),
        current_risk_score: riskScore.score,
        updated_at: now.toISOString(),
      })
      .eq('user_id', user.id);

    // Log check-in completed event
    await (supabase as any).from('crisis_events').insert({
      user_id: user.id,
      event_type: 'check_in_completed',
      event_timestamp: now.toISOString(),
      risk_score_at_event: riskScore.score,
      metadata: {
        mood_rating: moodRating,
        has_notes: !!notes,
      },
    });

    // Log risk_score_updated event with full breakdown (task 3.2.3)
    await (supabase as any).from('crisis_events').insert({
      user_id: user.id,
      event_type: 'risk_score_updated',
      event_timestamp: now.toISOString(),
      risk_score_at_event: riskScore.score,
      metadata: {
        trigger: 'check_in_completed',
        score: riskScore.score,
        level: riskScore.level,
        factors: riskScore.factors,
        explanation: riskScore.explanation,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        checkinId,
        nextCheckInDue: nextCheckInDue.toISOString(),
        riskScore: riskScore.score,
      },
    });
  } catch (error) {
    console.error('Error completing check-in:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
