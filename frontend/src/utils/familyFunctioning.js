/**
 * Family Functioning Assessment scoring — pure functions, no DB.
 * Importance and Support Need do not change the standard Family Functioning Index.
 * Neutral, non-blaming. Not a dysfunction/custody/abuse measure.
 */

export function calculateFamilyFunctioningIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateImportanceWeightedFamilyIndex(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentFunctioningScore)) &&
      Number.isFinite(Number(v.personalImportanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.personalImportanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentFunctioningScore) * Number(v.personalImportanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

/** Opportunity = functioningGap*0.5 + importance*0.25 + supportNeed*0.25 */
export function calculateFamilyOpportunityScore(
  currentFunctioningScore,
  personalImportanceScore,
  supportNeedScore
) {
  const functioning = Number(currentFunctioningScore);
  const importance = Number(personalImportanceScore);
  const supportNeed = Number(supportNeedScore);
  if (
    !Number.isFinite(functioning) ||
    !Number.isFinite(importance) ||
    !Number.isFinite(supportNeed)
  ) {
    return null;
  }
  const functioningGap = 11 - functioning;
  return Number((functioningGap * 0.5 + importance * 0.25 + supportNeed * 0.25).toFixed(2));
}

export function familyFunctioningIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Support Opportunities';
  if (s <= 54) return 'Several Areas Feel Stretched';
  if (s <= 69) return 'Mixed Family Functioning';
  if (s <= 84) return 'Strong Foundation With Clear Priorities';
  return 'Strong and Workable Family Functioning';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Needs Meaningful Attention';
  if (s <= 5) return 'Current Support Opportunity';
  if (s <= 7) return 'Mixed or Developing';
  if (s <= 9) return 'Current Strength';
  return 'Strong and Workable';
}

export function interpretFunctioningScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may deserve additional attention in this season. This is one person's experience — not a judgment of your family.`;
  }
  if (s <= 5) {
    return `${label} appears mixed right now. Extra clarity, repair, or shared support may help without implying your family is failing.`;
  }
  if (s <= 7) {
    return `${label} appears mixed or developing. Small adjustments can strengthen what is already working.`;
  }
  return `${label} appears to be a current strength in how family life feels to you.`;
}

export function matrixQuadrant(functioning, importance) {
  if (functioning == null || importance == null) return null;
  const highF = Number(functioning) >= 7;
  const highI = Number(importance) >= 7;
  if (highF && highI) return 'core-strengths';
  if (!highF && highI) return 'high-value-support';
  if (highF && !highI) return 'steady-lower-priority';
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

export const FAMILY_SYSTEMS = {
  'communication-and-safety': {
    id: 'communication-and-safety',
    label: 'Communication and Safety',
    keys: ['communication', 'respect', 'conflict_resolution', 'emotional_safety']
  },
  'structure-and-cooperation': {
    id: 'structure-and-cooperation',
    label: 'Structure and Cooperation',
    keys: ['routines', 'teamwork', 'responsibilities']
  },
  'connection-and-enjoyment': {
    id: 'connection-and-enjoyment',
    label: 'Connection and Enjoyment',
    keys: ['connection', 'fun']
  },
  adaptability: {
    id: 'adaptability',
    label: 'Adaptability',
    keys: ['flexibility']
  }
};

export function domainsForContext(
  template,
  { mode = 'full', participantVersion = 'general-household' } = {}
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
  const f = (k) => byKey[k]?.currentFunctioningScore;
  const i = (k) => byKey[k]?.personalImportanceScore;
  const sn = (k) => byKey[k]?.supportNeedScore;

  // Emotional safety must not be hidden by a high overall profile
  if ((f('emotional_safety') ?? 99) <= 5) {
    insights.push(
      'Emotional safety stands out as an area that deserves attention even when other parts of family life feel stronger. Feeling able to be honest without fear is foundational — and a lower score here is not an abuse conclusion.'
    );
  }
  if ((f('emotional_safety') ?? 99) <= 4 && (f('communication') ?? 0) >= 7) {
    insights.push(
      'Everyday talking may look workable while emotional honesty still feels risky. Protecting low-pressure honesty can matter as much as clearer conversations.'
    );
  }
  if ((f('emotional_safety') ?? 99) <= 4 && (sn('emotional_safety') ?? 0) >= 7) {
    insights.push(
      'You indicated that emotional safety both feels limited and needs support. If fear for physical or emotional safety is present, prioritize confidential, qualified help rather than family meetings or confrontation.'
    );
  }

  if ((f('communication') ?? 0) >= 8 && (f('conflict_resolution') ?? 99) <= 5) {
    insights.push(
      'Everyday communication may feel relatively open, while repair after conflict feels harder. Short, calm repair moments can protect the connection you already value.'
    );
  }
  if ((f('respect') ?? 99) <= 5 && (i('respect') ?? 0) >= 8) {
    insights.push(
      'Respect matters greatly to you, but daily interactions feel less steady. Agreeing on one clear respect practice may reduce friction without blaming anyone.'
    );
  }
  if ((f('routines') ?? 0) >= 8 && (f('flexibility') ?? 99) <= 5) {
    insights.push(
      'Routines appear relatively steady, while adapting to change feels stretched. Building one simple plan B can make structure more resilient.'
    );
  }
  if ((f('teamwork') ?? 99) <= 5 && (f('responsibilities') ?? 99) <= 5) {
    insights.push(
      'Cooperation and shared responsibilities both feel stretched. Clarifying one shared task may be more workable than redesigning the whole household load.'
    );
  }
  if ((f('connection') ?? 99) <= 5 && (f('fun') ?? 99) <= 5) {
    insights.push(
      'Closeness and shared enjoyment both feel limited. Protecting a short, low-pressure shared moment can strengthen connection without adding more logistics.'
    );
  }
  if ((f('connection') ?? 0) >= 8 && (f('fun') ?? 99) <= 5) {
    insights.push(
      'You feel relatively connected, while lightness and play feel scarce. Connection often grows when enjoyment is protected, not only when problems are solved.'
    );
  }
  if ((f('conflict_resolution') ?? 99) <= 5 && (i('conflict_resolution') ?? 0) >= 8) {
    insights.push(
      'Repair after conflict is highly important to you but currently feels hard. Choosing one pause-and-return practice may help more than trying to resolve everything at once.'
    );
  }
  if ((f('responsibilities') ?? 99) <= 5 && (i('responsibilities') ?? 0) >= 8) {
    insights.push(
      'Household responsibilities matter a lot, but follow-through feels uneven. Renegotiating one clear ownership item can reduce resentment.'
    );
  }
  if ((f('flexibility') ?? 99) <= 5 && (f('routines') ?? 99) <= 5) {
    insights.push(
      'Both structure and adaptability feel stretched. Stabilizing one daily rhythm while allowing one flexible exception may create more room than changing everything.'
    );
  }
  if ((sn('emotional_safety') ?? 0) >= 8 || (sn('conflict_resolution') ?? 0) >= 8) {
    insights.push(
      'You indicated a high need for support around safety or conflict. Outside support can be as valuable as family strategies — especially when conversations feel unsafe.'
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.currentFunctioningScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several important family areas need attention at the same time. Choosing one or two priorities may be more sustainable than trying to improve everything at once.'
    );
  }

  const lowBoth = (scored || []).filter(
    (x) =>
      (x.currentFunctioningScore ?? 99) <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} currently feels less strong, but it is not a major priority in your present season. It may not require immediate action.`
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

export function buildFamilyFunctioningSummary(
  template,
  responses,
  { mode = 'full', participantVersion = 'general-household', priorityKeys = [] } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const functioning = r.currentFunctioningScore ?? null;
    if (functioning == null) continue;
    const importance = r.personalImportanceScore ?? null;
    const supportNeed = r.supportNeedScore ?? null;
    const opportunity =
      importance != null && supportNeed != null
        ? calculateFamilyOpportunityScore(functioning, importance, supportNeed)
        : null;
    const quadrant = matrixQuadrant(functioning, importance);

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.familySystem || d.lifeSystem,
      relatedAssessments: d.relatedAssessmentIds || [],
      currentFunctioningScore: Number(functioning),
      personalImportanceScore: importance == null ? null : Number(importance),
      supportNeedScore: supportNeed == null ? null : Number(supportNeed),
      opportunityScore: opportunity,
      status: domainStatusLabel(functioning),
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      interpretation: interpretFunctioningScore(functioning, d.label),
      reflectionChips: r.reflectionChips || [],
      personalDefinition: r.personalDefinition || '',
      supportPreference: r.supportPreference || 'none',
      actionSuggestions: d.actionSuggestions || [],
      isSensitive: !!d.isSensitive
    });
    if (importance != null) {
      weighted.push({
        currentFunctioningScore: Number(functioning),
        personalImportanceScore: Number(importance)
      });
    }
  }

  const familyFunctioningIndex = calculateFamilyFunctioningIndex(
    scored.map((x) => x.currentFunctioningScore)
  );
  const importanceWeightedIndex = calculateImportanceWeightedFamilyIndex(weighted);

  const systemScores = {
    communicationAndSafety: avgScores(
      FAMILY_SYSTEMS['communication-and-safety'].keys.map(
        (k) => byKey[k]?.currentFunctioningScore
      )
    ),
    structureAndCooperation: avgScores(
      FAMILY_SYSTEMS['structure-and-cooperation'].keys.map(
        (k) => byKey[k]?.currentFunctioningScore
      )
    ),
    connectionAndEnjoyment: avgScores(
      FAMILY_SYSTEMS['connection-and-enjoyment'].keys.map(
        (k) => byKey[k]?.currentFunctioningScore
      )
    ),
    adaptability: avgScores(
      FAMILY_SYSTEMS.adaptability.keys.map((k) => byKey[k]?.currentFunctioningScore)
    )
  };

  const strengths = scored
    .filter(
      (x) =>
        x.currentFunctioningScore >= 8 &&
        (x.personalImportanceScore == null || x.personalImportanceScore >= 6)
    )
    .sort((a, b) => b.currentFunctioningScore - a.currentFunctioningScore);

  const highValueSupportAreas = scored
    .filter(
      (x) =>
        (x.personalImportanceScore ?? 0) >= 7 &&
        (x.currentFunctioningScore <= 5 || (x.supportNeedScore ?? 0) >= 7)
    )
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const lowerPriority = scored.filter(
    (x) => x.currentFunctioningScore <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );

  const insights = buildDeterministicInsights(scored);

  // Elevate emotional safety when overall index is high but safety is low
  if (
    familyFunctioningIndex != null &&
    familyFunctioningIndex >= 75 &&
    (byKey.emotional_safety?.currentFunctioningScore ?? 99) <= 5
  ) {
    insights.unshift(
      'Overall family functioning may look relatively strong, while Emotional Safety still deserves focused attention. A high index should not hide how safe honesty feels at home.'
    );
  }

  if (
    familyFunctioningIndex != null &&
    familyFunctioningIndex >= 75 &&
    scored.filter((x) => x.currentFunctioningScore <= 4).length === 1
  ) {
    const lone = scored.find((x) => x.currentFunctioningScore <= 4);
    if (lone && lone.domainKey !== 'emotional_safety') {
      insights.unshift(
        `Most family areas currently feel workable, while ${lone.label} stands out as an important support opportunity.`
      );
    }
  }

  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    familyFunctioningIndex,
    importanceWeightedIndex,
    statusLabel: familyFunctioningIndexLabel(familyFunctioningIndex),
    systemScores,
    strengths,
    highValueSupportAreas,
    lowerPriority,
    domains: scored,
    insights: insights.slice(0, 8),
    strengthCount: strengths.length,
    highValueSupportCount: highValueSupportAreas.length,
    soloResultsLabel:
      template?.settings?.soloResultsLabel ||
      "This profile reflects one participant's current experience of the family.",
    indexClarification:
      template?.settings?.indexClarification ||
      'The Family Functioning Index summarizes how workable family life currently feels across the areas you completed. It does not measure family worth or predict outcomes.',
    matrixClarification:
      'A lower-priority domain does not automatically require improvement. Low scores are not conclusions about dysfunction, custody fitness, or abuse.',
    safetyNote:
      template?.settings?.safetyNote ||
      'If you or someone in your household is in immediate danger, contact local emergency services. Low functioning scores are not abuse conclusions. Do not use family meetings if violence or fear for safety is present.',
    violenceDisclosureNote:
      template?.settings?.violenceDisclosureNote ||
      'If someone discloses violence or fear for safety, do not recommend family meetings, mediation, or shared confrontation. Prioritize safety planning with qualified support.'
  };
}

/** Alias used by some callers */
export const buildSummary = buildFamilyFunctioningSummary;

export const PARTICIPANT_VERSION_OPTIONS = [
  {
    id: 'general-household',
    label: 'General household',
    description: 'Full ten-domain assessment'
  },
  {
    id: 'parents-and-children',
    label: 'Parents and children',
    description: 'Caregiving household reflection'
  },
  {
    id: 'couple-with-kids',
    label: 'Couple with kids',
    description: 'Partnership plus caregiving'
  },
  {
    id: 'multigenerational',
    label: 'Multigenerational',
    description: 'Multiple generations sharing life'
  },
  {
    id: 'blended-family',
    label: 'Blended family',
    description: 'Roles, respect, and routines across households'
  },
  {
    id: 'single-caregiver-household',
    label: 'Single-caregiver household',
    description: 'One primary caregiver lens'
  },
  {
    id: 'co-parenting-household',
    label: 'Co-parenting household',
    description: 'Across homes or shared caregiving'
  },
  {
    id: 'chosen-family',
    label: 'Chosen family',
    description: 'Households built by choice and care'
  }
];

export const MODE_OPTIONS = [
  {
    id: 'full',
    label: 'Full Family Functioning Assessment',
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
  { id: 'family-group', label: 'I would like a family group or community' },
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
  { id: 'practice', label: 'Practice' },
  { id: 'repair', label: 'Repair' }
];

export const HOUSEHOLD_STAGE_OPTIONS = [
  'Young children at home',
  'School-age children',
  'Teens at home',
  'Young adults at home',
  'Empty nest / adult children',
  'Blended ages',
  'Multigenerational household',
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
  'Chosen family household',
  'Foster or kinship home',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Communicate more clearly',
  'Increase respect in daily interactions',
  'Stabilize routines',
  'Share the load more fairly',
  'Repair after conflict more easily',
  'Strengthen emotional safety',
  'Feel more connected',
  'Adapt better to change',
  'Make more room for fun',
  'Other'
];

export const TIMEFRAME_OPTIONS = [
  { id: 'past-thirty-days', label: 'Past 30 days' },
  { id: 'past-ninety-days', label: 'Past 90 days' },
  { id: 'current-season', label: 'Current family season' },
  { id: 'past-year', label: 'Past year' },
  { id: 'custom', label: 'Custom period' }
];

export const RELATED_ASSESSMENT_LABELS = {
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'teen-wellbeing': 'Teen Well-Being Assessment',
  'relationship-health': 'Relationship Health Assessment',
  'marriage-alignment': 'Marriage Alignment Assessment',
  'values-alignment': 'Values Alignment Assessment',
  'parenting-confidence': 'Parenting Confidence Assessment',
  'mens-life': "Men's Life Assessment",
  'digital-wellness': 'Digital Wellness Assessment'
};
