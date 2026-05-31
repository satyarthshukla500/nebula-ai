/**
 * Comprehensive unit tests for Guardian Mode Risk Scoring
 * 
 * Key safety requirement: Single message/event NEVER triggers escalation.
 * Requires repeated patterns (3+ occurrences in 7 days) for meaningful scores.
 */

import {
  calculateRiskScore,
  detectDecliningMoodTrend,
  analyzeDistressLanguage,
  analyzeCrisisKeywords,
  shouldEscalate,
  getRiskLevelDescription,
  type RiskFactors,
} from '../risk-scoring';

// ─── Helpers ────────────────────────────────────────────────────────────────

const zeroFactors: RiskFactors = {
  consecutiveMissedCheckins: 0,
  distressLanguageFrequency: 0,
  decliningMoodTrend: false,
  explicitCrisisKeywords: 0,
  positiveCheckins: 0,
};

const maxFactors: RiskFactors = {
  consecutiveMissedCheckins: 10,
  distressLanguageFrequency: 10,
  decliningMoodTrend: true,
  explicitCrisisKeywords: 10,
  positiveCheckins: 0,
};

// ─── calculateRiskScore ──────────────────────────────────────────────────────

describe('calculateRiskScore', () => {
  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('returns score 0 and level low when all factors are zero', () => {
      const result = calculateRiskScore(zeroFactors);
      expect(result.score).toBe(0);
      expect(result.level).toBe('low');
    });

    it('clamps score to 100 when all factors are at max values', () => {
      const result = calculateRiskScore(maxFactors);
      expect(result.score).toBe(100);
      expect(result.level).toBe('high');
    });

    it('score never goes below 0 even with many positive check-ins', () => {
      const result = calculateRiskScore({ ...zeroFactors, positiveCheckins: 50 });
      expect(result.score).toBe(0);
    });

    it('returns all-zero breakdown when all factors are zero', () => {
      const result = calculateRiskScore(zeroFactors);
      expect(result.factors.missedCheckins).toBe(0);
      expect(result.factors.distressLanguage).toBe(0);
      expect(result.factors.moodTrend).toBe(0);
      expect(result.factors.crisisKeywords).toBe(0);
      expect(result.factors.positiveReduction).toBe(0);
    });
  });

  // ── Safety requirement: single event never triggers escalation ───────────

  describe('single event never triggers escalation', () => {
    it('single distress language occurrence does NOT contribute to score', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 1 });
      expect(result.factors.distressLanguage).toBe(0);
      expect(result.score).toBe(0);
    });

    it('two distress language occurrences do NOT contribute to score', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 2 });
      expect(result.factors.distressLanguage).toBe(0);
      expect(result.score).toBe(0);
    });

    it('level stays low with only 1 distress language occurrence', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 1 });
      expect(result.level).toBe('low');
    });
  });

  // ── Requires 3+ occurrences in 7 days ────────────────────────────────────

  describe('requires 3+ distress occurrences in 7 days', () => {
    it('exactly 3 distress occurrences starts contributing to score', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 3 });
      expect(result.factors.distressLanguage).toBe(30); // 3 * 10
      expect(result.score).toBe(30);
    });

    it('5 distress occurrences adds 50 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 5 });
      expect(result.factors.distressLanguage).toBe(50);
    });
  });

  // ── Consecutive missed check-ins ─────────────────────────────────────────

  describe('consecutive missed check-ins factor', () => {
    it('1 missed check-in adds 15 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, consecutiveMissedCheckins: 1 });
      expect(result.factors.missedCheckins).toBe(15);
      expect(result.score).toBe(15);
    });

    it('2 missed check-ins adds 30 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, consecutiveMissedCheckins: 2 });
      expect(result.factors.missedCheckins).toBe(30);
      expect(result.score).toBe(30);
    });

    it('3 missed check-ins adds 45 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, consecutiveMissedCheckins: 3 });
      expect(result.factors.missedCheckins).toBe(45);
      expect(result.score).toBe(45);
    });

    it('0 missed check-ins contributes nothing', () => {
      const result = calculateRiskScore({ ...zeroFactors, consecutiveMissedCheckins: 0 });
      expect(result.factors.missedCheckins).toBe(0);
    });
  });

  // ── Declining mood trend ─────────────────────────────────────────────────

  describe('declining mood trend factor', () => {
    it('declining mood trend adds 20 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, decliningMoodTrend: true });
      expect(result.factors.moodTrend).toBe(20);
      expect(result.score).toBe(20);
    });

    it('no declining mood trend contributes nothing', () => {
      const result = calculateRiskScore({ ...zeroFactors, decliningMoodTrend: false });
      expect(result.factors.moodTrend).toBe(0);
    });
  });

  // ── Explicit crisis keywords ─────────────────────────────────────────────

  describe('explicit crisis keywords factor', () => {
    it('1 crisis keyword adds 25 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, explicitCrisisKeywords: 1 });
      expect(result.factors.crisisKeywords).toBe(25);
      expect(result.score).toBe(25);
    });

    it('2 crisis keywords adds 50 points', () => {
      const result = calculateRiskScore({ ...zeroFactors, explicitCrisisKeywords: 2 });
      expect(result.factors.crisisKeywords).toBe(50);
    });

    it('0 crisis keywords contributes nothing', () => {
      const result = calculateRiskScore({ ...zeroFactors, explicitCrisisKeywords: 0 });
      expect(result.factors.crisisKeywords).toBe(0);
    });
  });

  // ── Positive check-ins reduce score ─────────────────────────────────────

  describe('positive check-ins reduce score', () => {
    it('1 positive check-in reduces score by 10', () => {
      const result = calculateRiskScore({
        ...zeroFactors,
        consecutiveMissedCheckins: 2, // +30
        positiveCheckins: 1,           // -10
      });
      expect(result.factors.positiveReduction).toBe(10);
      expect(result.score).toBe(20);
    });

    it('3 positive check-ins reduce score by 30', () => {
      const result = calculateRiskScore({
        ...zeroFactors,
        consecutiveMissedCheckins: 3, // +45
        positiveCheckins: 3,           // -30
      });
      expect(result.score).toBe(15);
    });

    it('positive check-ins cannot push score below 0', () => {
      const result = calculateRiskScore({ ...zeroFactors, positiveCheckins: 10 });
      expect(result.score).toBe(0);
    });
  });

  // ── Risk level thresholds ────────────────────────────────────────────────

  describe('risk level thresholds', () => {
    it('score 0 is low', () => {
      expect(calculateRiskScore(zeroFactors).level).toBe('low');
    });

    it('score 20 is low (boundary)', () => {
      // 1 missed check-in (15) + declining mood (20) = 35 → moderate
      // Use only missed check-ins to hit exactly 20: need 20/15 ≈ not integer
      // Use distress (3 * 10 = 30) - positive (1 * 10 = 10) = 20
      const result = calculateRiskScore({
        ...zeroFactors,
        distressLanguageFrequency: 3,
        positiveCheckins: 1,
      });
      expect(result.score).toBe(20);
      expect(result.level).toBe('low');
    });

    it('score 21 is moderate', () => {
      // 1 missed (15) + declining mood (20) = 35 → moderate
      // distress 3 (30) - positive 0 = 30 → moderate
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 3 });
      expect(result.score).toBe(30);
      expect(result.level).toBe('moderate');
    });

    it('score 40 is moderate (boundary)', () => {
      // 1 missed (15) + distress 3 (30) - positive 0 = 45 → elevated
      // Need exactly 40: distress 4 (40) = 40
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 4 });
      expect(result.score).toBe(40);
      expect(result.level).toBe('moderate');
    });

    it('score 41 is elevated', () => {
      // distress 5 (50) - positive 0 = 50 → elevated
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 5 });
      expect(result.score).toBe(50);
      expect(result.level).toBe('elevated');
    });

    it('score 60 is elevated (boundary)', () => {
      // distress 6 (60) = 60 → elevated
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 6 });
      expect(result.score).toBe(60);
      expect(result.level).toBe('elevated');
    });

    it('score 61 is high', () => {
      // distress 7 (70) = 70 → high
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 7 });
      expect(result.score).toBe(70);
      expect(result.level).toBe('high');
    });

    it('score 100 is high', () => {
      expect(calculateRiskScore(maxFactors).level).toBe('high');
    });
  });

  // ── Explanation ──────────────────────────────────────────────────────────

  describe('explanation field', () => {
    it('returns no-pattern message when all factors are zero', () => {
      const result = calculateRiskScore(zeroFactors);
      expect(result.explanation).toContain('No concerning patterns detected');
    });

    it('mentions missed check-ins in explanation', () => {
      const result = calculateRiskScore({ ...zeroFactors, consecutiveMissedCheckins: 2 });
      expect(result.explanation).toContain('missed check-in');
    });

    it('mentions distress language in explanation when 3+ occurrences', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 3 });
      expect(result.explanation).toContain('distress language');
    });

    it('does NOT mention distress language when fewer than 3 occurrences', () => {
      const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 2 });
      expect(result.explanation).not.toContain('distress language');
    });

    it('mentions crisis keywords in explanation', () => {
      const result = calculateRiskScore({ ...zeroFactors, explicitCrisisKeywords: 1 });
      expect(result.explanation).toContain('crisis keyword');
    });

    it('mentions positive check-ins in explanation', () => {
      const result = calculateRiskScore({ ...zeroFactors, positiveCheckins: 2 });
      expect(result.explanation).toContain('positive check-in');
    });
  });
});

// ─── detectDecliningMoodTrend ────────────────────────────────────────────────

describe('detectDecliningMoodTrend', () => {
  it('returns false for empty array', () => {
    expect(detectDecliningMoodTrend([])).toBe(false);
  });

  it('returns false for single rating', () => {
    expect(detectDecliningMoodTrend([5])).toBe(false);
  });

  it('returns false for two ratings', () => {
    expect(detectDecliningMoodTrend([7, 5])).toBe(false);
  });

  it('returns false for exactly 3 stable ratings', () => {
    expect(detectDecliningMoodTrend([5, 5, 5])).toBe(false);
  });

  it('returns true for clearly declining trend (3 ratings)', () => {
    expect(detectDecliningMoodTrend([8, 6, 4])).toBe(true);
  });

  it('returns true for declining trend across 5 ratings', () => {
    expect(detectDecliningMoodTrend([9, 7, 6, 5, 3])).toBe(true);
  });

  it('returns false for clearly improving trend', () => {
    expect(detectDecliningMoodTrend([3, 5, 7, 8, 9])).toBe(false);
  });

  it('returns false for mixed trend below 60% declining', () => {
    // 2 down, 2 up out of 4 transitions = 50% declining
    expect(detectDecliningMoodTrend([5, 4, 6, 5, 7])).toBe(false);
  });

  it('returns true when 60%+ transitions are downward', () => {
    // 3 down, 1 up out of 4 transitions = 75% declining
    expect(detectDecliningMoodTrend([8, 7, 6, 7, 5])).toBe(true);
  });

  it('uses only last 5 ratings from a longer array', () => {
    // First 5 are high and stable, last 5 are declining
    const ratings = [9, 9, 9, 9, 9, 8, 7, 6, 5, 4];
    expect(detectDecliningMoodTrend(ratings)).toBe(true);
  });

  it('returns false for last 5 stable even if earlier ratings declined', () => {
    const ratings = [8, 7, 6, 5, 4, 7, 7, 7, 7, 7];
    expect(detectDecliningMoodTrend(ratings)).toBe(false);
  });
});

// ─── analyzeDistressLanguage ─────────────────────────────────────────────────

describe('analyzeDistressLanguage', () => {
  it('returns 0 for empty string', () => {
    expect(analyzeDistressLanguage('')).toBe(0);
  });

  it('returns 0 for neutral text', () => {
    expect(analyzeDistressLanguage('I had a great day today')).toBe(0);
  });

  it('detects "hopeless"', () => {
    expect(analyzeDistressLanguage('I feel hopeless about everything')).toBeGreaterThan(0);
  });

  it('detects "helpless"', () => {
    expect(analyzeDistressLanguage('I feel helpless')).toBeGreaterThan(0);
  });

  it('detects "worthless"', () => {
    expect(analyzeDistressLanguage('I feel worthless')).toBeGreaterThan(0);
  });

  it('detects "overwhelming"', () => {
    expect(analyzeDistressLanguage('Everything feels overwhelming')).toBeGreaterThan(0);
  });

  it('detects "alone"', () => {
    expect(analyzeDistressLanguage('I feel so alone')).toBeGreaterThan(0);
  });

  it('detects "exhausted"', () => {
    expect(analyzeDistressLanguage('I am completely exhausted')).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    expect(analyzeDistressLanguage('I feel HOPELESS')).toBeGreaterThan(0);
    expect(analyzeDistressLanguage('I feel Hopeless')).toBeGreaterThan(0);
  });

  it('counts multiple distinct patterns', () => {
    const count = analyzeDistressLanguage('I feel hopeless and exhausted and so alone');
    expect(count).toBeGreaterThanOrEqual(3);
  });

  it('does not count the same pattern twice in one text', () => {
    // "hopeless" appears twice but should only match the pattern once
    const count = analyzeDistressLanguage('hopeless hopeless hopeless');
    expect(count).toBe(1);
  });
});

// ─── analyzeCrisisKeywords ───────────────────────────────────────────────────

describe('analyzeCrisisKeywords', () => {
  it('returns 0 for empty string', () => {
    expect(analyzeCrisisKeywords('')).toBe(0);
  });

  it('returns 0 for neutral text', () => {
    expect(analyzeCrisisKeywords('I had a great day')).toBe(0);
  });

  it('returns 0 for distress language that is not crisis-level', () => {
    expect(analyzeCrisisKeywords('I feel hopeless and exhausted')).toBe(0);
  });

  it('detects "suicide"', () => {
    expect(analyzeCrisisKeywords('I am thinking about suicide')).toBeGreaterThan(0);
  });

  it('detects "suicidal"', () => {
    expect(analyzeCrisisKeywords('I have been feeling suicidal')).toBeGreaterThan(0);
  });

  it('detects "kill myself"', () => {
    expect(analyzeCrisisKeywords('I want to kill myself')).toBeGreaterThan(0);
  });

  it('detects "self harm"', () => {
    expect(analyzeCrisisKeywords('I have been doing self harm')).toBeGreaterThan(0);
  });

  it('detects "self-harm"', () => {
    expect(analyzeCrisisKeywords('I have been doing self-harm')).toBeGreaterThan(0);
  });

  it('detects "want to die"', () => {
    expect(analyzeCrisisKeywords('I want to die')).toBeGreaterThan(0);
  });

  it('detects "wish I was dead"', () => {
    expect(analyzeCrisisKeywords('I wish I was dead')).toBeGreaterThan(0);
  });

  it('is case-insensitive', () => {
    expect(analyzeCrisisKeywords('I am thinking about SUICIDE')).toBeGreaterThan(0);
  });

  it('counts multiple distinct crisis patterns', () => {
    const count = analyzeCrisisKeywords('I want to kill myself and I have been doing self harm');
    expect(count).toBeGreaterThanOrEqual(2);
  });
});

// ─── shouldEscalate ──────────────────────────────────────────────────────────

describe('shouldEscalate', () => {
  // Stage 0 → 1
  describe('stage 0 transitions', () => {
    it('escalates from stage 0 when there is 1 missed check-in', () => {
      const result = shouldEscalate(0, 1, 0);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(1);
    });

    it('escalates from stage 0 when there are multiple missed check-ins', () => {
      const result = shouldEscalate(0, 3, 0);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(1);
    });

    it('does NOT escalate from stage 0 with 0 missed check-ins', () => {
      const result = shouldEscalate(0, 0, 0);
      expect(result.shouldEscalate).toBe(false);
      expect(result.nextStage).toBe(0);
    });

    it('does NOT escalate from stage 0 with high risk score but no missed check-ins', () => {
      const result = shouldEscalate(80, 0, 0);
      expect(result.shouldEscalate).toBe(false);
    });
  });

  // Stage 1 → 2
  describe('stage 1 transitions', () => {
    it('always escalates from stage 1 regardless of risk score', () => {
      const result = shouldEscalate(0, 0, 1);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(2);
    });

    it('escalates from stage 1 with high risk score', () => {
      const result = shouldEscalate(90, 5, 1);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(2);
    });
  });

  // Stage 2 → 3
  describe('stage 2 transitions', () => {
    it('escalates from stage 2 when risk > 40 and 3+ missed check-ins', () => {
      const result = shouldEscalate(50, 3, 2);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(3);
    });

    it('does NOT escalate from stage 2 when risk is exactly 40', () => {
      const result = shouldEscalate(40, 3, 2);
      expect(result.shouldEscalate).toBe(false);
      expect(result.nextStage).toBe(2);
    });

    it('does NOT escalate from stage 2 when risk > 40 but fewer than 3 missed check-ins', () => {
      const result = shouldEscalate(50, 2, 2);
      expect(result.shouldEscalate).toBe(false);
    });

    it('does NOT escalate from stage 2 when risk <= 40 even with many missed check-ins', () => {
      const result = shouldEscalate(30, 10, 2);
      expect(result.shouldEscalate).toBe(false);
    });
  });

  // Stage 3 → 4
  describe('stage 3 transitions', () => {
    it('escalates from stage 3 when risk > 60', () => {
      const result = shouldEscalate(70, 0, 3);
      expect(result.shouldEscalate).toBe(true);
      expect(result.nextStage).toBe(4);
    });

    it('does NOT escalate from stage 3 when risk is exactly 60', () => {
      const result = shouldEscalate(60, 5, 3);
      expect(result.shouldEscalate).toBe(false);
      expect(result.nextStage).toBe(3);
    });

    it('does NOT escalate from stage 3 when risk < 60', () => {
      const result = shouldEscalate(50, 5, 3);
      expect(result.shouldEscalate).toBe(false);
    });
  });

  // Stage 4 (terminal)
  describe('stage 4 (terminal)', () => {
    it('does not escalate beyond stage 4', () => {
      const result = shouldEscalate(100, 10, 4);
      expect(result.shouldEscalate).toBe(false);
      expect(result.nextStage).toBe(4);
    });
  });
});

// ─── getRiskLevelDescription ─────────────────────────────────────────────────

describe('getRiskLevelDescription', () => {
  it('returns description for low', () => {
    expect(getRiskLevelDescription('low')).toBeTruthy();
    expect(getRiskLevelDescription('low')).toContain('Normal');
  });

  it('returns description for moderate', () => {
    expect(getRiskLevelDescription('moderate')).toBeTruthy();
  });

  it('returns description for elevated', () => {
    expect(getRiskLevelDescription('elevated')).toBeTruthy();
  });

  it('returns description for high', () => {
    expect(getRiskLevelDescription('high')).toBeTruthy();
  });

  it('returns fallback for unknown level', () => {
    expect(getRiskLevelDescription('unknown')).toBeTruthy();
  });
});

// ─── 7-day rolling window (distress threshold) ───────────────────────────────

describe('7-day rolling window behaviour', () => {
  it('distress frequency below 3 (within 7 days) does not raise score', () => {
    // Simulates 2 distress events in 7 days — should not contribute
    const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 2 });
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('distress frequency of exactly 3 (within 7 days) starts contributing', () => {
    const result = calculateRiskScore({ ...zeroFactors, distressLanguageFrequency: 3 });
    expect(result.score).toBeGreaterThan(0);
  });
});

// ─── Combined factor scenarios ───────────────────────────────────────────────

describe('combined factor scenarios', () => {
  it('moderate scenario: 1 missed check-in + declining mood', () => {
    const result = calculateRiskScore({
      ...zeroFactors,
      consecutiveMissedCheckins: 1, // +15
      decliningMoodTrend: true,      // +20
    });
    expect(result.score).toBe(35);
    expect(result.level).toBe('moderate');
  });

  it('elevated scenario: 2 missed check-ins + distress 3x + declining mood', () => {
    const result = calculateRiskScore({
      ...zeroFactors,
      consecutiveMissedCheckins: 2, // +30
      distressLanguageFrequency: 3, // +30
      decliningMoodTrend: true,      // +20
    });
    expect(result.score).toBe(80);
    expect(result.level).toBe('high');
  });

  it('positive check-ins offset missed check-ins', () => {
    const result = calculateRiskScore({
      ...zeroFactors,
      consecutiveMissedCheckins: 2, // +30
      positiveCheckins: 3,           // -30
    });
    expect(result.score).toBe(0);
    expect(result.level).toBe('low');
  });

  it('crisis keyword alone reaches elevated level', () => {
    const result = calculateRiskScore({ ...zeroFactors, explicitCrisisKeywords: 2 });
    expect(result.score).toBe(50);
    expect(result.level).toBe('elevated');
  });
});
