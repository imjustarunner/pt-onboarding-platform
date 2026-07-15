/**
 * Parenting Confidence Assessment scoring — pure functions, no DB.
 * Importance and Support Need do not change the standard Parenting Confidence Index.
 * Nonjudgmental, strengths-based. Not a fitness/custody/abuse measure.
 */

export function calculateParentingConfidenceIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateImportanceWeightedParentingIndex(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentCapacityScore)) &&
      Number.isFinite(Number(v.personalImportanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.personalImportanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentCapacityScore) * Number(v.personalImportanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

/** Opportunity = capacityGap*0.5 + importance*0.25 + supportNeed*0.25 */
export function calculateParentingOpportunityScore(
  currentCapacityScore,
  personalImportanceScore,
  supportNeedScore
) {
  const capacity = Number(currentCapacityScore);
  const importance = Number(personalImportanceScore);
  const supportNeed = Number(supportNeedScore);
  if (!Number.isFinite(capacity) || !Number.isFinite(importance) || !Number.isFinite(supportNeed)) {
    return null;
  }
  const capacityGap = 11 - capacity;
  return Number((capacityGap * 0.5 + importance * 0.25 + supportNeed * 0.25).toFixed(2));
}

/** Strain = capacityGap*0.55 + demand*0.45 when demand enabled */
export function calculateParentingStrainScore(currentCapacityScore, demandLevelScore) {
  const capacity = Number(currentCapacityScore);
  const demand = Number(demandLevelScore);
  if (!Number.isFinite(capacity) || !Number.isFinite(demand)) return null;
  const capacityGap = 11 - capacity;
  return Number((capacityGap * 0.55 + demand * 0.45).toFixed(1));
}

export function parentingConfidenceIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Support Opportunities';
  if (s <= 54) return 'Several Areas Feel Stretched';
  if (s <= 69) return 'Mixed Caregiver Capacity';
  if (s <= 84) return 'Strong Foundation With Clear Priorities';
  return 'Strong and Supported Caregiver Capacity';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Needs Meaningful Support';
  if (s <= 5) return 'Current Support Opportunity';
  if (s <= 7) return 'Mixed or Developing';
  if (s <= 9) return 'Current Strength';
  return 'Strong and Well Supported';
}

export function interpretCapacityScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may deserve additional support in this season. This is not a judgment of your worth as a parent.`;
  }
  if (s <= 5) {
    return `${label} appears mixed right now. Extra support, clarity, or recovery may help without implying you are failing.`;
  }
  if (s <= 7) {
    return `${label} appears mixed or developing. Small adjustments or shared support can strengthen what is already working.`;
  }
  return `${label} appears to be a current strength in your parenting.`;
}

export function matrixQuadrant(capacity, importance) {
  if (capacity == null || importance == null) return null;
  const highC = Number(capacity) >= 7;
  const highI = Number(importance) >= 7;
  if (highC && highI) return 'core-strengths';
  if (!highC && highI) return 'high-value-support';
  if (highC && !highI) return 'steady-lower-priority';
  return 'lower-current-priority';
}

export const MATRIX_QUADRANT_LABELS = {
  'core-strengths': 'Core Strengths',
  'high-value-support': 'High-Value Support Areas',
  'steady-lower-priority': 'Steady but Lower Priority',
  'lower-current-priority': 'Lower Current Priority'
};

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const PARENTING_SYSTEMS = {
  'guidance-and-structure': {
    id: 'guidance-and-structure',
    label: 'Guidance and Structure',
    keys: ['consistency', 'boundaries', 'discipline']
  },
  'connection-and-emotional-support': {
    id: 'connection-and-emotional-support',
    label: 'Connection and Emotional Support',
    keys: ['patience', 'emotional_coaching', 'communication']
  },
  'caregiver-capacity': {
    id: 'caregiver-capacity',
    label: 'Caregiver Capacity',
    keys: ['self_care', 'confidence', 'support']
  },
  'family-integration': {
    id: 'family-integration',
    label: 'Family Integration',
    keys: ['family_balance']
  }
};

export function domainsForContext(
  template,
  { mode = 'full', participantVersion = 'general-caregiver' } = {}
) {
  return (template?.domains || []).filter((d) => {
    const versions = d.participantVersions || d.participant_versions || [];
    if (
      versions.length &&
      participantVersion &&
      participantVersion !== 'custom' &&
      !versions.includes(participantVersion)
    ) {
      return false;
    }
    const modes = d.availableModes || d.available_modes || ['full'];
    if (modes.length && !modes.includes(mode)) return false;
    return d.isActive !== false;
  });
}

export function buildDeterministicInsights(scored) {
  const byKey = Object.fromEntries((scored || []).map((x) => [x.domainKey, x]));
  const insights = [];
  const c = (k) => byKey[k]?.currentCapacityScore;
  const i = (k) => byKey[k]?.personalImportanceScore;
  const sn = (k) => byKey[k]?.supportNeedScore;

  if ((c('consistency') ?? 0) >= 8 && (c('patience') ?? 99) <= 5) {
    insights.push(
      'Your routines appear relatively steady, while patience feels more stretched. Protecting recovery may help you sustain the consistency you already value.'
    );
  }
  if ((c('boundaries') ?? 0) >= 8 && (c('self_care') ?? 99) <= 5) {
    insights.push(
      'You report clear boundaries for your family, while your own recovery receives less support. Caregiver capacity often needs the same intention you give household limits.'
    );
  }
  if ((c('emotional_coaching') ?? 0) >= 8 && (c('patience') ?? 99) <= 5) {
    insights.push(
      'You appear skilled at guiding emotions, but the effort may be costly day to day. Small pauses and shared support can make emotional coaching more sustainable.'
    );
  }
  if ((c('discipline') ?? 99) <= 5 && (i('discipline') ?? 0) >= 8) {
    insights.push(
      'Guidance and accountability matter greatly to you, but current approaches feel less workable. Clarifying one fair, teaching-focused response may reduce daily friction.'
    );
  }
  if ((c('communication') ?? 99) <= 5 && (c('emotional_coaching') ?? 0) >= 7) {
    insights.push(
      'You may already notice and support feelings, while everyday conversation still feels strained. Protecting short, low-pressure talking time can complement emotional coaching.'
    );
  }
  if ((c('self_care') ?? 99) <= 5 && (c('support') ?? 99) <= 5) {
    insights.push(
      'Limited recovery and limited outside support may be compounding. Asking for one practical help this week can protect both self-care and parenting presence.'
    );
  }
  if ((c('confidence') ?? 99) <= 5 && (c('support') ?? 99) <= 5) {
    insights.push(
      'Parenting confidence and support both feel limited. Hearing what is already working from a trusted person may steady both areas at once.'
    );
  }
  if ((c('confidence') ?? 0) >= 8 && (c('family_balance') ?? 99) <= 5) {
    insights.push(
      'You trust your parenting judgment, while overall family rhythm feels overloaded. Confidence does not remove the need for a more workable weekly balance.'
    );
  }
  if ((c('support') ?? 0) >= 8 && (c('self_care') ?? 99) <= 5) {
    insights.push(
      'People appear available, while personal recovery still feels thin. Support is most useful when it creates real rest, not only more coordination.'
    );
  }
  if ((c('family_balance') ?? 99) <= 5 && (i('family_balance') ?? 0) >= 8) {
    insights.push(
      'Family balance is highly important to you but currently feels hard to sustain. Reducing one optional commitment may create more room than adding another strategy.'
    );
  }
  if ((c('consistency') ?? 99) <= 5 && (c('boundaries') ?? 99) <= 5) {
    insights.push(
      'Structure and limits both feel stretched. Choosing one small routine and one clear boundary may be more workable than redesigning everything at once.'
    );
  }
  if ((sn('patience') ?? 0) >= 8 || (sn('self_care') ?? 0) >= 8) {
    insights.push(
      'You indicated a high need for support in caregiver stamina. Short relief, sleep protection, or shared coverage can be as valuable as parenting tips.'
    );
  }

  const highStrain = (scored || []).filter(
    (x) => (x.currentCapacityScore ?? 0) >= 7 && (x.strainScore ?? 0) >= 8
  );
  if (highStrain[0]) {
    insights.push(
      `You are currently functioning effectively in ${highStrain[0].label}, but the demand may not be sustainable. Shared support or reduced load may help protect this strength.`
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.currentCapacityScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several important parenting areas need attention at the same time. Choosing one or two priorities may be more sustainable than trying to improve everything at once.'
    );
  }

  const lowBoth = (scored || []).filter(
    (x) =>
      (x.currentCapacityScore ?? 99) <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} currently feels less strong, but it is not a major priority in your present season. It may not require immediate action.`
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

export function buildParentingConfidenceSummary(
  template,
  responses,
  { mode = 'full', participantVersion = 'general-caregiver', priorityKeys = [] } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const capacity = r.currentCapacityScore ?? null;
    if (capacity == null) continue;
    const importance = r.personalImportanceScore ?? null;
    const supportNeed = r.supportNeedScore ?? null;
    const demand = r.demandLevelScore ?? null;
    const opportunity =
      importance != null && supportNeed != null
        ? calculateParentingOpportunityScore(capacity, importance, supportNeed)
        : null;
    const strain = demand != null ? calculateParentingStrainScore(capacity, demand) : null;
    const quadrant = matrixQuadrant(capacity, importance);

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.parentingSystem || d.lifeSystem,
      relatedAssessments: d.relatedAssessmentIds || [],
      currentCapacityScore: Number(capacity),
      personalImportanceScore: importance == null ? null : Number(importance),
      supportNeedScore: supportNeed == null ? null : Number(supportNeed),
      demandLevelScore: demand == null ? null : Number(demand),
      opportunityScore: opportunity,
      strainScore: strain,
      status: domainStatusLabel(capacity),
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      interpretation: interpretCapacityScore(capacity, d.label),
      reflectionChips: r.reflectionChips || [],
      personalDefinition: r.personalDefinition || '',
      supportPreference: r.supportPreference || 'none',
      actionSuggestions: d.actionSuggestions || []
    });
    if (importance != null) {
      weighted.push({
        currentCapacityScore: Number(capacity),
        personalImportanceScore: Number(importance)
      });
    }
  }

  const parentingConfidenceIndex = calculateParentingConfidenceIndex(
    scored.map((x) => x.currentCapacityScore)
  );
  const importanceWeightedIndex = calculateImportanceWeightedParentingIndex(weighted);

  const systemScores = {
    guidanceAndStructure: avgScores(
      PARENTING_SYSTEMS['guidance-and-structure'].keys.map(
        (k) => byKey[k]?.currentCapacityScore
      )
    ),
    connectionAndEmotionalSupport: avgScores(
      PARENTING_SYSTEMS['connection-and-emotional-support'].keys.map(
        (k) => byKey[k]?.currentCapacityScore
      )
    ),
    caregiverCapacity: avgScores(
      PARENTING_SYSTEMS['caregiver-capacity'].keys.map((k) => byKey[k]?.currentCapacityScore)
    ),
    familyIntegration: avgScores(
      PARENTING_SYSTEMS['family-integration'].keys.map((k) => byKey[k]?.currentCapacityScore)
    )
  };

  const strengths = scored
    .filter(
      (x) =>
        x.currentCapacityScore >= 8 &&
        (x.personalImportanceScore == null || x.personalImportanceScore >= 6)
    )
    .sort((a, b) => b.currentCapacityScore - a.currentCapacityScore);

  const highValueSupportAreas = scored
    .filter(
      (x) =>
        (x.personalImportanceScore ?? 0) >= 7 &&
        (x.currentCapacityScore <= 5 || (x.supportNeedScore ?? 0) >= 7)
    )
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const highStrainStrengths = scored.filter(
    (x) => x.currentCapacityScore >= 7 && (x.strainScore ?? 0) >= 7
  );

  const lowerPriority = scored.filter(
    (x) => x.currentCapacityScore <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );

  const insights = buildDeterministicInsights(scored);
  if (
    parentingConfidenceIndex != null &&
    parentingConfidenceIndex >= 75 &&
    scored.filter((x) => x.currentCapacityScore <= 4).length === 1
  ) {
    insights.unshift(
      'Most parenting areas currently feel supported, while one domain stands out as an important support opportunity.'
    );
  }
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional support on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    parentingConfidenceIndex,
    importanceWeightedIndex,
    statusLabel: parentingConfidenceIndexLabel(parentingConfidenceIndex),
    systemScores,
    strengths,
    highValueSupportAreas,
    highStrainStrengths,
    lowerPriority,
    domains: scored,
    insights: insights.slice(0, 8),
    strengthCount: strengths.length,
    highValueSupportCount: highValueSupportAreas.length,
    highStrainStrengthCount: highStrainStrengths.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'The Parenting Confidence Index summarizes how supported and capable you currently feel across the areas you completed. It does not measure your worth as a parent or predict child outcomes.',
    matrixClarification:
      'A lower-priority domain does not automatically require improvement. Low scores are not conclusions about abuse, neglect, or fitness to parent.',
    safetyNote:
      template?.settings?.safetyNote ||
      'If you or a child are in immediate danger, contact local emergency services. Low capacity scores are not abuse conclusions.'
  };
}

/** Alias used by some callers */
export const buildSummary = buildParentingConfidenceSummary;

export const PARTICIPANT_VERSION_OPTIONS = [
  {
    id: 'general-caregiver',
    label: 'General caregiver',
    description: 'Full ten-domain assessment'
  },
  {
    id: 'parents-of-young-children',
    label: 'Parents of young children',
    description: 'Early routines, patience, and recovery'
  },
  {
    id: 'parents-of-school-age',
    label: 'Parents of school-age children',
    description: 'Structure, communication, and balance'
  },
  {
    id: 'parents-of-teens',
    label: 'Parents of teens',
    description: 'Connection, boundaries, and emotional coaching'
  },
  {
    id: 'single-caregiver',
    label: 'Single caregiver',
    description: 'Support, self-care, and capacity'
  },
  {
    id: 'co-parenting',
    label: 'Co-parenting',
    description: 'Consistency across households'
  },
  {
    id: 'foster-or-kinship',
    label: 'Foster or kinship',
    description: 'Support-sensitive caregiving'
  },
  {
    id: 'blended-family',
    label: 'Blended family',
    description: 'Roles, communication, and balance'
  },
  {
    id: 'expecting-or-new',
    label: 'Expecting or new parent',
    description: 'Confidence and early support'
  }
];

export const MODE_OPTIONS = [
  {
    id: 'full',
    label: 'Full Parenting Confidence Assessment',
    description: '10 domains',
    time: '12–18 min'
  },
  {
    id: 'quick',
    label: 'Quick check-in',
    description: 'Selected domains',
    time: '4–7 min'
  },
  {
    id: 'seasonal-review',
    label: 'Seasonal review',
    description: 'Full reflection for this season',
    time: '15–20 min'
  },
  {
    id: 'transition',
    label: 'Transition review',
    description: 'During a family change',
    time: '10–15 min'
  },
  {
    id: 'targeted',
    label: 'Targeted review',
    description: 'One to three domains',
    time: '5–10 min'
  }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'strategy', label: 'I would like a strategy to try' },
  { id: 'guided-reflection', label: 'I would like a guided reflection' },
  { id: 'accountability', label: 'I would like an accountability partner' },
  { id: 'coach', label: 'I would like to speak with a coach' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'parenting-group', label: 'I would like a parenting group or community' },
  { id: 'practical-help', label: 'I would like practical help or relief' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'support-today', label: 'I need support today' },
  { id: 'unsure', label: 'I am unsure' }
];

export const PRIORITY_TYPES = [
  { id: 'strengthen', label: 'Strengthen' },
  { id: 'restore', label: 'Restore' },
  { id: 'protect', label: 'Protect' },
  { id: 'clarify', label: 'Clarify' },
  { id: 'rebalance', label: 'Rebalance' },
  { id: 'build-support', label: 'Build Support' },
  { id: 'simplify', label: 'Simplify' },
  { id: 'practice', label: 'Practice' }
];

export const CAREGIVER_STAGE_OPTIONS = [
  'Expecting',
  'Newborn / infant',
  'Toddler / preschool',
  'Elementary school',
  'Middle school',
  'High school / teens',
  'Young adult children at home',
  'Blended ages',
  'Foster / kinship season',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const HOUSEHOLD_OPTIONS = [
  'Single caregiver household',
  'Two-caregiver household',
  'Co-parenting across homes',
  'Multigenerational household',
  'Blended family',
  'Foster or kinship home',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Feel more consistent',
  'Stay calmer in hard moments',
  'Hold clearer boundaries',
  'Guide emotions with more confidence',
  'Improve everyday communication',
  'Protect my own recovery',
  'Build a stronger support network',
  'Create a more workable family rhythm',
  'Gain confidence in my decisions',
  'Other'
];

export const TIMEFRAME_OPTIONS = [
  { id: 'past-thirty-days', label: 'Past 30 days' },
  { id: 'past-ninety-days', label: 'Past 90 days' },
  { id: 'current-season', label: 'Current parenting season' },
  { id: 'past-year', label: 'Past year' },
  { id: 'custom', label: 'Custom period' }
];

export const RELATED_ASSESSMENT_LABELS = {
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'teen-wellbeing': 'Teen Well-Being Assessment',
  'relationship-health': 'Relationship Health Assessment',
  'values-alignment': 'Values Alignment Assessment',
  'digital-wellness': 'Digital Wellness Assessment',
  'mens-life': "Men's Life Assessment"
};
