/**
 * Values Alignment — Life Alignment Wheel scoring (Current Life vs Ideal Life).
 * Pure functions; no DB. Confidence to Change never affects alignment math.
 */

export function calculateSignedAlignmentGap(currentLifeScore, idealLifeScore) {
  const current = Number(currentLifeScore);
  const ideal = Number(idealLifeScore);
  if (!Number.isFinite(current) || !Number.isFinite(ideal)) return null;
  return Number((ideal - current).toFixed(1));
}

export function calculateAbsoluteAlignmentGap(currentLifeScore, idealLifeScore) {
  const signed = calculateSignedAlignmentGap(currentLifeScore, idealLifeScore);
  if (signed == null) return null;
  return Number(Math.abs(signed).toFixed(1));
}

export function calculateValueAlignmentScore(currentLifeScore, idealLifeScore) {
  const absoluteGap = calculateAbsoluteAlignmentGap(currentLifeScore, idealLifeScore);
  if (absoluteGap == null) return null;
  return Math.max(0, Math.round(100 - absoluteGap * 10));
}

export function calculateValuesAlignmentIndex(alignmentScores) {
  const completed = (alignmentScores || []).filter((score) => score !== null && score !== undefined);
  if (!completed.length) return null;
  return Math.round(completed.reduce((sum, score) => sum + Number(score), 0) / completed.length);
}

export function calculateCurrentLifeIndex(scores) {
  const completed = (scores || []).filter((score) => score !== null && score !== undefined);
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateAlignmentOpportunityScore(
  currentLifeScore,
  idealLifeScore,
  confidenceToChange
) {
  const current = Number(currentLifeScore);
  const ideal = Number(idealLifeScore);
  if (!Number.isFinite(current) || !Number.isFinite(ideal)) return null;
  const positiveGap = Math.max(0, ideal - current);
  const idealWeight = ideal / 10;
  const confidenceWeight =
    confidenceToChange !== undefined && confidenceToChange !== null && Number.isFinite(Number(confidenceToChange))
      ? Number(confidenceToChange) / 10
      : 0.5;
  return Number((positiveGap * idealWeight * (0.7 + confidenceWeight * 0.3)).toFixed(2));
}

export function calculateRebalancingOpportunityScore(currentLifeScore, idealLifeScore) {
  const current = Number(currentLifeScore);
  const ideal = Number(idealLifeScore);
  if (!Number.isFinite(current) || !Number.isFinite(ideal)) return null;
  return Number(Math.max(0, current - ideal).toFixed(1));
}

/** Signed-gap status labels — neutral, non-moralizing. */
export function signedGapStatusLabel(signedGap) {
  if (signedGap == null || !Number.isFinite(Number(signedGap))) return '';
  const g = Number(signedGap);
  if (g >= -1 && g <= 1) return 'Closely Aligned';
  if (g > 1 && g <= 2.4) return 'Some Additional Emphasis Desired';
  if (g > 2.4 && g <= 4) return 'Meaningful Growth Opportunity';
  if (g > 4) return 'Major Current-to-Ideal Gap';
  if (g >= -2.4 && g < -1) return 'Some Rebalancing May Help';
  if (g >= -4 && g < -2.4) return 'Meaningful Overextension';
  return 'Major Rebalancing Opportunity';
}

export function valuesAlignmentIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Major Realignment Opportunity';
  if (s <= 54) return 'Several Meaningful Gaps';
  if (s <= 69) return 'Mixed Alignment';
  if (s <= 84) return 'Generally Aligned';
  return 'Closely Aligned';
}

export function interpretCurrentIdealPair(currentLifeScore, idealLifeScore) {
  const signed = calculateSignedAlignmentGap(currentLifeScore, idealLifeScore);
  if (signed == null) return '';
  const abs = Math.abs(signed);
  if (abs <= 1) {
    if (Number(currentLifeScore) <= 4 && Number(idealLifeScore) <= 4) {
      return 'This value currently receives limited emphasis, which appears consistent with your ideal for this season.';
    }
    return 'This value appears closely aligned with the level of emphasis you currently want.';
  }
  if (signed > 0) {
    return 'You would ideally like this value to receive more attention than it currently receives.';
  }
  return 'This value currently receives more emphasis than you would ideally prefer. Rebalancing may create room for other priorities.';
}

export function normalizeResponseScores(response = {}) {
  const current =
    response.currentLifeScore ??
    response.current_life_score ??
    response.alignmentScore ??
    response.alignment_score ??
    null;
  const ideal =
    response.idealLifeScore ??
    response.ideal_life_score ??
    response.importanceScore ??
    response.importance_score ??
    null;
  const confidence =
    response.confidenceToChangeScore ??
    response.confidence_to_change_score ??
    null;
  return {
    currentLifeScore: current == null ? null : Number(current),
    idealLifeScore: ideal == null ? null : Number(ideal),
    confidenceToChangeScore: confidence == null ? null : Number(confidence)
  };
}

export function enrichResponseMeta(response, valueDef = {}) {
  const { currentLifeScore, idealLifeScore, confidenceToChangeScore } = normalizeResponseScores(response);
  const signedGap = calculateSignedAlignmentGap(currentLifeScore, idealLifeScore);
  const absoluteGap = calculateAbsoluteAlignmentGap(currentLifeScore, idealLifeScore);
  const alignmentScore = calculateValueAlignmentScore(currentLifeScore, idealLifeScore);
  return {
    valueKey: response.valueKey || response.value_key || valueDef.key,
    label: valueDef.label || response.valueKey,
    color: valueDef.color || '#64748b',
    category: valueDef.category || null,
    currentLifeScore,
    idealLifeScore,
    confidenceToChangeScore,
    // Legacy mirrors for older UI
    importanceScore: idealLifeScore,
    alignmentScoreLegacy: currentLifeScore,
    signedGap,
    absoluteGap,
    alignmentScore,
    gap: absoluteGap,
    status: signedGapStatusLabel(signedGap),
    interpretation: interpretCurrentIdealPair(currentLifeScore, idealLifeScore),
    opportunityScore: calculateAlignmentOpportunityScore(
      currentLifeScore,
      idealLifeScore,
      confidenceToChangeScore
    ),
    rebalancingScore: calculateRebalancingOpportunityScore(currentLifeScore, idealLifeScore),
    seasonStatus: response.seasonStatus || response.season_status || 'active',
    personalDefinition: response.personalDefinition || response.personal_definition || '',
    reflectionChips: response.reflectionChips || response.reflection_chips || [],
    note: response.note || ''
  };
}

export function buildDeterministicInsights(enriched, priorityKeys = []) {
  const insights = [];
  const active = (enriched || []).filter((x) => x.seasonStatus !== 'not_relevant');

  const strongAlign = active.filter(
    (x) => x.absoluteGap != null && x.absoluteGap <= 1 && x.currentLifeScore >= 7
  );
  if (strongAlign.length) {
    insights.push(
      `${strongAlign
        .slice(0, 2)
        .map((x) => x.label)
        .join(' and ')} appear both visible in your current life and closely aligned with your ideal level of emphasis.`
    );
  }

  const lowAlign = active.filter(
    (x) =>
      x.absoluteGap != null &&
      x.absoluteGap <= 1 &&
      x.currentLifeScore <= 4 &&
      x.idealLifeScore <= 4
  );
  if (lowAlign[0]) {
    insights.push(
      `${lowAlign[0].label} currently receives limited emphasis, which appears intentional for your present season.`
    );
  }

  const positiveGaps = active.filter((x) => x.signedGap != null && x.signedGap >= 3);
  if (positiveGaps[0]) {
    insights.push(
      `You would ideally like ${positiveGaps[0].label} to be more visible in daily life than it currently is.`
    );
  }

  const negativeGaps = active.filter((x) => x.signedGap != null && x.signedGap <= -3);
  if (negativeGaps[0]) {
    insights.push(
      `${negativeGaps[0].label} currently receives more time or energy than you would ideally prefer. Rebalancing may create space for other priorities.`
    );
  }

  if (positiveGaps.length >= 4) {
    insights.push(
      'Several values currently receive less emphasis than you would ideally prefer. Choosing one or two priorities may be more sustainable than trying to change everything at once.'
    );
  }

  const highIdeals = active.filter((x) => x.idealLifeScore >= 9);
  if (highIdeals.length >= 8) {
    insights.push(
      'Most values have been rated as central priorities. Reviewing tradeoffs may help identify which values deserve the greatest emphasis in this specific season.'
    );
  }

  const overextended = active.filter((x) => x.signedGap != null && x.signedGap <= -2);
  if (overextended.length >= 3) {
    insights.push(
      'Several areas currently receive more energy than you would ideally prefer. Reducing or redefining commitments may be as important as adding new goals.'
    );
  }

  const highIdealLowConfidence = active.filter(
    (x) =>
      x.idealLifeScore >= 8 &&
      x.currentLifeScore != null &&
      x.currentLifeScore <= 5 &&
      x.confidenceToChangeScore != null &&
      x.confidenceToChangeScore <= 4
  );
  if (highIdealLowConfidence[0]) {
    insights.push(
      `${highIdealLowConfidence[0].label} matters greatly, but change may not yet feel realistic. A smaller first step or additional support may help.`
    );
  }

  const ready = active.filter(
    (x) =>
      x.idealLifeScore >= 8 &&
      x.signedGap != null &&
      x.signedGap >= 2 &&
      x.confidenceToChangeScore != null &&
      x.confidenceToChangeScore >= 8
  );
  if (ready[0]) {
    insights.push(
      `${ready[0].label} is important, currently underrepresented, and appears ready for an action-oriented goal.`
    );
  }

  // Competing-value rules (deterministic, neutral)
  const byKey = Object.fromEntries(active.map((x) => [x.valueKey, x]));
  const family = byKey.family;
  const leadership = byKey.leadership;
  if (family?.idealLifeScore >= 8 && leadership?.idealLifeScore >= 8) {
    insights.push(
      'Family and Leadership are both high priorities. The challenge may involve boundaries, scheduling, or defining what sufficient investment looks like in each area.'
    );
  }
  const health = byKey.health;
  const service = byKey.service;
  if (
    service?.currentLifeScore >= 8 &&
    health?.currentLifeScore != null &&
    health.currentLifeScore <= 5 &&
    health?.idealLifeScore >= 8
  ) {
    insights.push(
      'Service currently receives substantial attention while Health receives less than you would ideally prefer. Sustainable service may require greater attention to recovery and boundaries.'
    );
  }

  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional action on ${priorityKeys
        .map((k) => byKey[k]?.label || k)
        .join(', ')}.`
    );
  }

  return insights.slice(0, 8);
}

export function buildLifeAlignmentSummary(template, responses, priorityKeys = []) {
  const values = template?.values || [];
  const valueMap = Object.fromEntries(values.map((v) => [v.key, v]));
  const enriched = (responses || [])
    .map((r) => enrichResponseMeta(r, valueMap[r.valueKey || r.value_key] || {}))
    .filter((x) => x.seasonStatus !== 'not_relevant');

  const completed = enriched.filter(
    (x) => x.currentLifeScore != null && x.idealLifeScore != null
  );

  if (!completed.length) {
    return {
      valuesAlignmentIndex: null,
      alignmentLevel: null,
      currentLifeIndex: null,
      alignedValueCount: 0,
      positiveGapCount: 0,
      rebalancingOpportunityCount: 0,
      closelyAligned: [],
      needingMoreAttention: [],
      rebalancingOpportunities: [],
      highestIdealPriorities: [],
      values: [],
      insights: [],
      // Legacy fields for older consumers
      averageImportance: null,
      averageAlignment: null,
      averageGap: null,
      stronglyAlignedCount: 0,
      priorityOpportunityCount: 0,
      coreStrengths: [],
      priorityOpportunities: [],
      stableSupports: [],
      lowerPriority: []
    };
  }

  const alignmentScores = completed.map((x) => x.alignmentScore);
  const valuesAlignmentIndex = calculateValuesAlignmentIndex(alignmentScores);
  const currentLifeIndex = calculateCurrentLifeIndex(completed.map((x) => x.currentLifeScore));

  const closelyAligned = completed
    .filter((x) => x.absoluteGap != null && x.absoluteGap <= 1)
    .sort((a, b) => (b.idealLifeScore || 0) - (a.idealLifeScore || 0));

  const needingMoreAttention = completed
    .filter((x) => x.signedGap != null && x.signedGap >= 2)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const rebalancingOpportunities = completed
    .filter((x) => x.signedGap != null && x.signedGap <= -2)
    .sort((a, b) => (b.rebalancingScore || 0) - (a.rebalancingScore || 0));

  const highestIdealPriorities = [...completed].sort(
    (a, b) => (b.idealLifeScore || 0) - (a.idealLifeScore || 0)
  );

  const insights = buildDeterministicInsights(completed, priorityKeys);

  const avgIdeal =
    completed.reduce((s, x) => s + x.idealLifeScore, 0) / completed.length;
  const avgCurrent =
    completed.reduce((s, x) => s + x.currentLifeScore, 0) / completed.length;
  const avgAbsGap =
    completed.reduce((s, x) => s + (x.absoluteGap || 0), 0) / completed.length;

  return {
    valuesAlignmentIndex,
    alignmentLevel: valuesAlignmentIndexLabel(valuesAlignmentIndex),
    currentLifeIndex,
    alignedValueCount: closelyAligned.length,
    positiveGapCount: needingMoreAttention.length,
    rebalancingOpportunityCount: rebalancingOpportunities.length,
    closelyAligned,
    needingMoreAttention,
    rebalancingOpportunities,
    highestIdealPriorities: highestIdealPriorities.slice(0, 5),
    values: completed,
    insights,
    indexClarification:
      'The Values Alignment Index measures how closely your Current Life scores match your Ideal Life scores. It does not measure your worth, character, ambition, or morality.',
    // Legacy mirrors
    averageImportance: Math.round(avgIdeal * 10) / 10,
    averageAlignment: Math.round(avgCurrent * 10) / 10,
    averageGap: Math.round(avgAbsGap * 10) / 10,
    stronglyAlignedCount: closelyAligned.length,
    priorityOpportunityCount: needingMoreAttention.length,
    coreStrengths: closelyAligned.filter((x) => x.currentLifeScore >= 7),
    priorityOpportunities: needingMoreAttention,
    stableSupports: closelyAligned.filter((x) => x.currentLifeScore <= 4),
    lowerPriority: completed.filter((x) => (x.idealLifeScore || 0) <= 4)
  };
}

/** @deprecated Use calculateSignedAlignmentGap / calculateAbsoluteAlignmentGap */
export function calculateAlignmentGap(importanceScore, alignmentScore) {
  // Legacy: importance ≈ ideal, alignment ≈ current → positive gap = ideal - current when ideal > current
  return calculateAbsoluteAlignmentGap(alignmentScore, importanceScore) != null
    ? Math.max(0, Number(importanceScore) - Number(alignmentScore))
    : null;
}

export function calculateAlignmentOpportunity(importanceScore, alignmentScore) {
  const gap = calculateAlignmentGap(importanceScore, alignmentScore);
  if (gap == null) return null;
  return gap * Number(importanceScore);
}

export function gapStatusLabel(gap) {
  if (gap == null) return '';
  if (gap <= 1) return 'Closely Aligned';
  if (gap <= 3) return 'Some Additional Emphasis Desired';
  if (gap <= 5) return 'Meaningful Growth Opportunity';
  return 'Major Current-to-Ideal Gap';
}

export function averageGapLabel(avgGap) {
  if (avgGap == null) return null;
  if (avgGap <= 1) return 'Closely Aligned';
  if (avgGap <= 2.5) return 'Generally Aligned';
  if (avgGap <= 4) return 'Mixed Alignment';
  return 'Major Realignment Opportunity';
}

export const CORE_VALUE_KEYS = [
  'family',
  'integrity',
  'health',
  'growth',
  'faith',
  'service',
  'adventure',
  'financial_freedom',
  'leadership',
  'relationships'
];

export const REFLECTION_OPTIONS_BY_VALUE = {
  family: [
    'Work demands',
    'Distance',
    'Schedule conflicts',
    'Caregiving responsibilities',
    'Parenting demands',
    'Technology',
    'Unresolved conflict',
    'Lack of intentional time',
    'Family is already well represented',
    'I need stronger boundaries',
    'I need more individual time as well',
    'Other',
    'Not relevant in this season',
    'Prefer not to answer'
  ],
  integrity: [
    'Competing pressures',
    'Fear of disappointing others',
    'Avoiding difficult conversations',
    'Overcommitting',
    'Unclear boundaries',
    'Acting differently across settings',
    'Difficulty admitting mistakes',
    'Values are clear and consistently practiced',
    'Lack of time to reflect',
    'Workplace or social pressure',
    'Other'
  ],
  health: [
    'Workload',
    'Sleep',
    'Schedule',
    'Caregiving',
    'Stress',
    'Limited energy',
    'Physical limitations',
    'Cost or access',
    'Inconsistent routines',
    'Health is currently well supported',
    'All-or-nothing expectations',
    'Other',
    'Prefer not to answer'
  ],
  growth: [
    'Limited time',
    'Lack of direction',
    'Too many competing goals',
    'Fear of failure',
    'Cost',
    'Lack of feedback',
    'Fatigue',
    'I am already in a major growth season',
    'I need more application and less information',
    'I need to pause rather than add another goal',
    'Other'
  ],
  faith: [
    'Schedule',
    'Spiritual community',
    'Prayer or reflection routine',
    'Doubt or uncertainty',
    'Difficult life circumstances',
    'Fatigue',
    'Religious hurt',
    'Lack of privacy',
    'Faith is currently well integrated',
    'I am exploring what I believe',
    'This category does not fit my values',
    'Other',
    'Prefer not to answer'
  ],
  service: [
    'Limited time',
    'Unclear opportunity',
    'Burnout',
    'Caregiving already fills this role',
    'Financial limitations',
    'Lack of community connection',
    'Difficulty setting boundaries',
    'Service is already strongly represented',
    'I give more than I can sustain',
    'I want to use a specific skill',
    'Other'
  ],
  adventure: [
    'Schedule',
    'Finances',
    'Family responsibilities',
    'Health limitations',
    'Fear or uncertainty',
    'Lack of planning',
    'Lack of a companion',
    'Adventure is already well represented',
    'I need smaller local experiences',
    'I prefer stability over frequent novelty',
    'Other'
  ],
  financial_freedom: [
    'Income',
    'Debt',
    'Spending habits',
    'Unclear budget',
    'Unexpected expenses',
    'Family responsibilities',
    'Different financial priorities within the household',
    'Lack of financial knowledge',
    'Financial habits are currently aligned',
    'Avoiding financial information',
    'Unrealistic expectations',
    'Other',
    'Prefer not to answer'
  ],
  leadership: [
    'Lack of opportunity',
    'Fear of visibility',
    'Overcommitment',
    'Unclear direction',
    'Difficulty delegating',
    'Lack of confidence',
    'Limited support',
    'Leadership is already strongly represented',
    'I am carrying too much responsibility',
    'I prefer contribution without a formal title',
    'Other'
  ],
  relationships: [
    'Busy schedule',
    'Distance',
    'Social fatigue',
    'Unresolved conflict',
    'Lack of community',
    'Technology',
    'Difficulty initiating contact',
    'Relationships are currently well supported',
    'I need deeper rather than more relationships',
    'I need stronger boundaries',
    'Major life transition',
    'Other'
  ]
};

export const LIFE_SEASON_OPTIONS = [
  'Building a career',
  'Raising children',
  'Caring for family',
  'Academic or training period',
  'Major transition',
  'Recovering from a difficult period',
  'Leadership season',
  'Financial rebuilding',
  'Relationship transition',
  'Health-focused season',
  'Retirement',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const PRIMARY_CONCERN_OPTIONS = [
  'I feel overcommitted',
  'My schedule does not reflect my priorities',
  'I am unsure what matters most',
  'Work is consuming too much energy',
  'Relationships need more attention',
  'Health needs more attention',
  'I need clearer boundaries',
  'I want greater purpose',
  'I want more balance',
  'I am preparing for a transition',
  'I feel aligned and want to maintain it',
  'Other'
];

export const CURRENT_GOAL_OPTIONS = [
  'Clarify priorities',
  'Make a difficult decision',
  'Improve work-life alignment',
  'Build healthier routines',
  'Strengthen relationships',
  'Reduce overcommitment',
  'Reconnect with faith or meaning',
  'Create a financial plan',
  'Develop leadership',
  'Add more adventure',
  'Build a values-based weekly plan',
  'Other'
];

export const PRIORITY_TYPES = [
  { id: 'increase', label: 'Increase this value' },
  { id: 'protect', label: 'Protect this value' },
  { id: 'rebalance', label: 'Rebalance this value' },
  { id: 'clarify', label: 'Clarify what this value means' },
  { id: 'maintain', label: 'Maintain current alignment' }
];
