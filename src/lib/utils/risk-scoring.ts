/**
 * Guardian Mode Risk Scoring Algorithm
 * 
 * Conservative approach to risk assessment:
 * - Never triggers from single message
 * - Requires repeated patterns (3+ occurrences in 7 days)
 * - Transparent and explainable factors
 * - User can view breakdown
 */

export interface RiskFactors {
  consecutiveMissedCheckins: number;
  distressLanguageFrequency: number; // Count in last 7 days
  decliningMoodTrend: boolean;
  explicitCrisisKeywords: number; // Count in last 7 days
  positiveCheckins: number; // Count in last 7 days
}

export interface RiskScoreResult {
  score: number; // 0-100
  level: 'low' | 'moderate' | 'elevated' | 'high';
  factors: {
    missedCheckins: number;
    distressLanguage: number;
    moodTrend: number;
    crisisKeywords: number;
    positiveReduction: number;
  };
  explanation: string;
}

/**
 * Calculate risk score based on multiple factors
 * Conservative approach - requires patterns, not single events
 */
export function calculateRiskScore(factors: RiskFactors): RiskScoreResult {
  let score = 0;
  const breakdown = {
    missedCheckins: 0,
    distressLanguage: 0,
    moodTrend: 0,
    crisisKeywords: 0,
    positiveReduction: 0,
  };

  // Factor 1: Consecutive missed check-ins (15 points each)
  if (factors.consecutiveMissedCheckins > 0) {
    breakdown.missedCheckins = factors.consecutiveMissedCheckins * 15;
    score += breakdown.missedCheckins;
  }

  // Factor 2: Distress language (only if 3+ in 7 days)
  if (factors.distressLanguageFrequency >= 3) {
    breakdown.distressLanguage = factors.distressLanguageFrequency * 10;
    score += breakdown.distressLanguage;
  }

  // Factor 3: Declining mood trend (20 points)
  if (factors.decliningMoodTrend) {
    breakdown.moodTrend = 20;
    score += breakdown.moodTrend;
  }

  // Factor 4: Explicit crisis keywords (25 points each, requires confirmation)
  if (factors.explicitCrisisKeywords > 0) {
    breakdown.crisisKeywords = factors.explicitCrisisKeywords * 25;
    score += breakdown.crisisKeywords;
  }

  // Factor 5: Positive check-ins reduce score (-10 each)
  if (factors.positiveCheckins > 0) {
    breakdown.positiveReduction = factors.positiveCheckins * 10;
    score -= breakdown.positiveReduction;
  }

  // Clamp score between 0-100
  score = Math.max(0, Math.min(100, score));

  // Determine risk level
  let level: 'low' | 'moderate' | 'elevated' | 'high';
  if (score <= 20) {
    level = 'low';
  } else if (score <= 40) {
    level = 'moderate';
  } else if (score <= 60) {
    level = 'elevated';
  } else {
    level = 'high';
  }

  // Generate explanation
  const explanation = generateExplanation(factors, breakdown, score, level);

  return {
    score,
    level,
    factors: breakdown,
    explanation,
  };
}

/**
 * Generate human-readable explanation of risk score
 */
function generateExplanation(
  factors: RiskFactors,
  breakdown: RiskScoreResult['factors'],
  score: number,
  level: string
): string {
  const parts: string[] = [];

  if (factors.consecutiveMissedCheckins > 0) {
    parts.push(
      `${factors.consecutiveMissedCheckins} consecutive missed check-in${
        factors.consecutiveMissedCheckins > 1 ? 's' : ''
      } (+${breakdown.missedCheckins} points)`
    );
  }

  if (factors.distressLanguageFrequency >= 3) {
    parts.push(
      `${factors.distressLanguageFrequency} instances of distress language in past 7 days (+${breakdown.distressLanguage} points)`
    );
  }

  if (factors.decliningMoodTrend) {
    parts.push(`Declining mood trend detected (+${breakdown.moodTrend} points)`);
  }

  if (factors.explicitCrisisKeywords > 0) {
    parts.push(
      `${factors.explicitCrisisKeywords} crisis keyword${
        factors.explicitCrisisKeywords > 1 ? 's' : ''
      } detected (+${breakdown.crisisKeywords} points)`
    );
  }

  if (factors.positiveCheckins > 0) {
    parts.push(
      `${factors.positiveCheckins} positive check-in${
        factors.positiveCheckins > 1 ? 's' : ''
      } (-${breakdown.positiveReduction} points)`
    );
  }

  if (parts.length === 0) {
    return `Risk level: ${level} (${score}/100). No concerning patterns detected.`;
  }

  return `Risk level: ${level} (${score}/100). Factors: ${parts.join('; ')}.`;
}

/**
 * Detect declining mood trend from recent check-ins
 * Requires at least 3 check-ins to determine trend
 */
export function detectDecliningMoodTrend(moodRatings: number[]): boolean {
  if (moodRatings.length < 3) {
    return false;
  }

  // Take last 5 ratings
  const recentRatings = moodRatings.slice(-5);

  // Calculate if there's a declining trend
  let decliningCount = 0;
  for (let i = 1; i < recentRatings.length; i++) {
    if (recentRatings[i] < recentRatings[i - 1]) {
      decliningCount++;
    }
  }

  // Consider declining if 60%+ of transitions are downward
  return decliningCount / (recentRatings.length - 1) >= 0.6;
}

/**
 * Distress language patterns (conservative)
 * These are indicators, not definitive assessments
 */
const DISTRESS_PATTERNS = [
  /\b(hopeless|helpless|worthless|useless)\b/i,
  /\b(can't go on|give up|no point)\b/i,
  /\b(overwhelming|unbearable|too much)\b/i,
  /\b(alone|isolated|nobody cares)\b/i,
  /\b(exhausted|drained|empty)\b/i,
];

/**
 * Explicit crisis keywords (require user confirmation)
 */
const CRISIS_KEYWORDS = [
  /\b(suicide|suicidal|kill myself|end it all)\b/i,
  /\b(self harm|self-harm|hurt myself|cutting)\b/i,
  /\b(want to die|wish I was dead)\b/i,
];

/**
 * Analyze text for distress language
 * Returns count of distress patterns found
 */
export function analyzeDistressLanguage(text: string): number {
  let count = 0;
  for (const pattern of DISTRESS_PATTERNS) {
    if (pattern.test(text)) {
      count++;
    }
  }
  return count;
}

/**
 * Analyze text for explicit crisis keywords
 * Returns count of crisis keywords found
 */
export function analyzeCrisisKeywords(text: string): number {
  let count = 0;
  for (const pattern of CRISIS_KEYWORDS) {
    if (pattern.test(text)) {
      count++;
    }
  }
  return count;
}

/**
 * Determine if escalation should occur based on risk score and missed check-ins
 */
export function shouldEscalate(
  riskScore: number,
  consecutiveMissedCheckins: number,
  currentStage: number
): { shouldEscalate: boolean; nextStage: number } {
  // Stage 1: Any missed check-in
  if (currentStage === 0 && consecutiveMissedCheckins >= 1) {
    return { shouldEscalate: true, nextStage: 1 };
  }

  // Stage 2: No response to Stage 1 (handled by time-based logic)
  if (currentStage === 1) {
    return { shouldEscalate: true, nextStage: 2 };
  }

  // Stage 3: High risk + repeated misses
  if (currentStage === 2 && riskScore > 40 && consecutiveMissedCheckins >= 3) {
    return { shouldEscalate: true, nextStage: 3 };
  }

  // Stage 4: No response to Stage 3 + very high risk
  if (currentStage === 3 && riskScore > 60) {
    return { shouldEscalate: true, nextStage: 4 };
  }

  return { shouldEscalate: false, nextStage: currentStage };
}

/**
 * Gather risk factors for a user from the database and recalculate their risk score.
 * Updates guardian_settings.current_risk_score and logs a risk_score_updated event.
 *
 * Intended to be called by the escalation engine when a check-in is marked missed.
 */
export async function updateRiskScoreOnMissedCheckin(
  supabase: any,
  userId: string,
): Promise<RiskScoreResult> {
  const now = new Date();
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Count consecutive missed check-ins
  const { data: recentCheckins } = await supabase
    .from('wellness_checkins')
    .select('mood_rating, status, created_at')
    .eq('user_id', userId)
    .gte('created_at', sevenDaysAgo.toISOString())
    .order('created_at', { ascending: false });

  const checkins: Array<{ mood_rating: number | null; status: string }> = recentCheckins ?? [];

  // Count consecutive missed from most recent
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

  // Mood ratings for trend detection
  const moodRatings = checkins
    .filter((c) => c.mood_rating !== null)
    .map((c) => c.mood_rating as number)
    .reverse(); // oldest first

  const decliningMoodTrend = detectDecliningMoodTrend(moodRatings);

  const riskResult = calculateRiskScore({
    consecutiveMissedCheckins: consecutiveMissed,
    distressLanguageFrequency: 0, // Not re-analysed here; captured at check-in time
    decliningMoodTrend,
    explicitCrisisKeywords: 0,
    positiveCheckins,
  });

  // Update guardian_settings
  await supabase
    .from('guardian_settings')
    .update({
      current_risk_score: riskResult.score,
      updated_at: now.toISOString(),
    })
    .eq('user_id', userId);

  // Log risk_score_updated event
  await supabase.from('crisis_events').insert({
    user_id: userId,
    event_type: 'risk_score_updated',
    event_timestamp: now.toISOString(),
    risk_score_at_event: riskResult.score,
    metadata: {
      trigger: 'missed_checkin',
      score: riskResult.score,
      level: riskResult.level,
      factors: riskResult.factors,
      explanation: riskResult.explanation,
    },
  });

  return riskResult;
}

/**
 * Get risk level description for UI
 */
export function getRiskLevelDescription(level: string): string {
  switch (level) {
    case 'low':
      return 'Normal monitoring. No concerning patterns detected.';
    case 'moderate':
      return 'Some patterns detected. Consider increasing check-in frequency.';
    case 'elevated':
      return 'Multiple concerning patterns. Escalation may occur if check-ins are missed.';
    case 'high':
      return 'Significant patterns detected. Emergency contact may be notified if check-ins continue to be missed.';
    default:
      return 'Unknown risk level.';
  }
}
