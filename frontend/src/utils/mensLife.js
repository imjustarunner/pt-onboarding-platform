/**
 * Men's Life Assessment scoring — pure functions, no DB.
 * Importance and Momentum do not change the standard Men's Life Index.
 * Does not measure masculinity, worth, toughness, or success.
 */

export function calculateMensLifeIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateImportanceWeightedMensLifeIndex(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentStrengthScore)) &&
      Number.isFinite(Number(v.personalImportanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.personalImportanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentStrengthScore) * Number(v.personalImportanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

export function calculateLifeDevelopmentOpportunityScore(
  currentStrengthScore,
  personalImportanceScore,
  currentMomentumScore
) {
  const strength = Number(currentStrengthScore);
  const importance = Number(personalImportanceScore);
  if (!Number.isFinite(strength) || !Number.isFinite(importance)) return null;
  const strengthGap = 11 - strength;
  const momentumAdjustment =
    currentMomentumScore !== undefined &&
    currentMomentumScore !== null &&
    Number.isFinite(Number(currentMomentumScore))
      ? (11 - Number(currentMomentumScore)) * 0.15
      : 0;
  return Number((strengthGap * 0.55 + importance * 0.3 + momentumAdjustment).toFixed(2));
}

export function calculateRoleStrainScore(currentStrengthScore, roleDemandScore) {
  const strength = Number(currentStrengthScore);
  const demand = Number(roleDemandScore);
  if (!Number.isFinite(strength) || !Number.isFinite(demand)) return null;
  const strengthGap = 11 - strength;
  return Number((strengthGap * 0.55 + demand * 0.45).toFixed(1));
}

export function mensLifeIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Support Opportunities';
  if (s <= 54) return 'Several Areas Under Strain';
  if (s <= 69) return 'Mixed Life Foundation';
  if (s <= 84) return 'Strong Foundation With Clear Priorities';
  return 'Strong and Integrated Life Foundation';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Significant Current Concern';
  if (s <= 5) return 'Current Development Area';
  if (s <= 7) return 'Mixed or Developing';
  if (s <= 9) return 'Current Strength';
  return 'Strong and Well Integrated';
}

export function momentumLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return 'Not Enough Information';
  const s = Number(score);
  if (s <= 2) return 'Moving in an Unwanted Direction';
  if (s <= 4) return 'Becoming More Difficult';
  if (s <= 5) return 'Mostly Stable';
  if (s <= 6) return 'Variable';
  if (s <= 8) return 'Improving';
  return 'Strong Positive Momentum';
}

export function interpretStrengthScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may deserve additional attention in your current life season. This is not a measure of worth or masculinity.`;
  }
  if (s <= 5) {
    return `${label} appears mixed. Your experience may reflect your current life season, and this area may require support, clarification, or stronger boundaries.`;
  }
  if (s <= 7) {
    return `${label} appears mixed or developing. Improvement can include action, recovery, clarification, or reduced expectations.`;
  }
  return `${label} appears to be a current strength in your life.`;
}

export function matrixQuadrant(strength, importance) {
  if (strength == null || importance == null) return null;
  const highS = Number(strength) >= 7;
  const highI = Number(importance) >= 7;
  if (highS && highI) return 'core-strengths';
  if (!highS && highI) return 'priority-development';
  if (highS && !highI) return 'positive-lower-priority';
  return 'lower-current-priority';
}

export const MATRIX_QUADRANT_LABELS = {
  'core-strengths': 'Core Strengths',
  'priority-development': 'Priority Development Areas',
  'positive-lower-priority': 'Positive but Lower Priority',
  'lower-current-priority': 'Lower Current Priority'
};

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const LIFE_SYSTEMS = {
  'meaning-and-direction': {
    id: 'meaning-and-direction',
    label: 'Meaning and Direction',
    keys: ['purpose', 'spiritual_life', 'legacy']
  },
  'relationships-and-responsibility': {
    id: 'relationships-and-responsibility',
    label: 'Relationships and Responsibility',
    keys: ['marriage', 'fatherhood', 'friendships']
  },
  'strength-and-stewardship': {
    id: 'strength-and-stewardship',
    label: 'Strength and Stewardship',
    keys: ['leadership', 'fitness', 'finances']
  },
  'inner-stability': {
    id: 'inner-stability',
    label: 'Inner Stability',
    keys: ['emotional_health']
  }
};

export function domainsForContext(
  template,
  { mode = 'full', participantVersion = 'married-men' } = {}
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
  const s = (k) => byKey[k]?.currentStrengthScore;
  const i = (k) => byKey[k]?.personalImportanceScore;
  const m = (k) => byKey[k]?.currentMomentumScore;
  const strain = (k) => byKey[k]?.roleStrainScore;

  if ((s('purpose') ?? 0) >= 8 && (s('emotional_health') ?? 99) <= 5) {
    insights.push(
      'Your life appears meaningful, but the emotional effort required to sustain current responsibilities may be high. Purpose and emotional support can both deserve attention.'
    );
  }
  if ((s('leadership') ?? 0) >= 8 && (s('friendships') ?? 99) <= 5) {
    insights.push(
      'You report strong leadership or responsibility, while dependable peer connection feels more limited. Leadership does not replace the need for friendship and support.'
    );
  }
  if ((s('leadership') ?? 0) >= 8 && (s('emotional_health') ?? 99) <= 5) {
    insights.push(
      'You are carrying meaningful influence or responsibility, but the internal cost may be substantial. A private support relationship may help make leadership more sustainable.'
    );
  }
  if ((s('marriage') ?? 0) >= 8 && (s('friendships') ?? 99) <= 5) {
    insights.push(
      'Your marriage or partnership appears to be a strong source of support, while peer friendships receive less attention. One relationship should not be expected to meet every support need.'
    );
  }
  if ((s('marriage') ?? 99) <= 5 && (i('marriage') ?? 0) >= 8) {
    insights.push(
      'Marriage or partnership is highly important to you but currently feels less strong than desired. A structured conversation or qualified couples support may be useful.'
    );
  }
  if ((s('fatherhood') ?? 0) >= 8 && (s('fitness') ?? 99) <= 5) {
    insights.push(
      'You appear highly invested in fatherhood or caregiving, while your own physical capacity receives less support. Protecting health may strengthen your ability to remain present over time.'
    );
  }
  if ((s('fatherhood') ?? 0) >= 8 && (s('marriage') ?? 99) <= 5) {
    insights.push(
      'Fatherhood appears meaningful, while the intimate partnership may need greater attention. A family can function well in some roles while the couple relationship still requires care.'
    );
  }
  if ((s('finances') ?? 0) >= 8 && (s('purpose') ?? 99) <= 5) {
    insights.push(
      'Financial stability appears strong, while meaning or direction feels less clear. Security may create options, but it does not automatically create purpose.'
    );
  }
  if ((s('purpose') ?? 0) >= 8 && (s('finances') ?? 99) <= 5) {
    insights.push(
      'You report meaningful direction, while financial pressure may make it harder to sustain that work. Practical planning may help protect the purpose you value.'
    );
  }
  if ((s('fitness') ?? 0) >= 8 && (s('emotional_health') ?? 99) <= 5) {
    insights.push(
      'Physical routines appear strong, but emotional strain may remain. Exercise can support emotional health without replacing honest conversation or professional support.'
    );
  }
  if ((s('spiritual_life') ?? 0) >= 8 && (s('emotional_health') ?? 99) <= 5) {
    insights.push(
      'Spiritual life appears meaningful, while emotional health remains difficult. Spiritual practices and qualified emotional support can work together.'
    );
  }
  if ((s('emotional_health') ?? 0) >= 7 && (s('friendships') ?? 99) <= 5) {
    insights.push(
      'You may have effective internal coping skills while still lacking consistent peer connection. Building friendship may improve support without implying that current coping is inadequate.'
    );
  }
  if ((i('legacy') ?? 0) >= 8 && (s('purpose') ?? 99) <= 5) {
    insights.push(
      'Legacy matters greatly to you, but current direction feels less clear. Defining one contribution for this life season may make legacy more concrete.'
    );
  }

  const highStrain = (scored || []).filter(
    (x) => (x.currentStrengthScore ?? 0) >= 7 && (x.roleStrainScore ?? 0) >= 8
  );
  if (highStrain[0]) {
    insights.push(
      `You are currently functioning effectively in ${highStrain[0].label}, but the effort may not be sustainable. Support, delegation, recovery, or clearer boundaries may be important.`
    );
  }

  const declining = (scored || []).filter(
    (x) => (x.currentStrengthScore ?? 0) >= 7 && (x.currentMomentumScore ?? 99) <= 4
  );
  if (declining[0]) {
    insights.push(
      `${declining[0].label} remains relatively strong, but you report that it is moving in an unwanted direction. Early attention may help protect an existing strength.`
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.currentStrengthScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several important parts of life need attention at the same time. Choosing one or two priorities may be more responsible than attempting to change every area at once.'
    );
  }

  const lowBoth = (scored || []).filter(
    (x) => (x.currentStrengthScore ?? 99) <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} currently feels less strong, but it is not a major priority in your present season. It may not require immediate action.`
    );
  }

  void m;
  void strain;

  return [...new Set(insights)].slice(0, 8);
}

export function buildMensLifeSummary(
  template,
  responses,
  { mode = 'full', participantVersion = 'married-men', priorityKeys = [] } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const strength = r.currentStrengthScore ?? null;
    if (strength == null) continue;
    const importance = r.personalImportanceScore ?? null;
    const momentum = r.currentMomentumScore ?? null;
    const roleDemand = r.roleDemandScore ?? null;
    const opportunity =
      importance != null
        ? calculateLifeDevelopmentOpportunityScore(strength, importance, momentum)
        : null;
    const roleStrain =
      roleDemand != null ? calculateRoleStrainScore(strength, roleDemand) : null;
    const quadrant = matrixQuadrant(strength, importance);

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.lifeSystem,
      relatedAssessments: d.relatedAssessmentIds || [],
      currentStrengthScore: Number(strength),
      personalImportanceScore: importance == null ? null : Number(importance),
      currentMomentumScore: momentum == null ? null : Number(momentum),
      roleDemandScore: roleDemand == null ? null : Number(roleDemand),
      roleStrainScore: roleStrain,
      developmentOpportunityScore: opportunity,
      status: domainStatusLabel(strength),
      momentumLabel: momentumLabel(momentum),
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      interpretation: interpretStrengthScore(strength, d.label),
      reflectionChips: r.reflectionChips || [],
      personalDefinition: r.personalDefinition || '',
      supportPreference: r.supportPreference || 'none'
    });
    if (importance != null) {
      weighted.push({
        currentStrengthScore: Number(strength),
        personalImportanceScore: Number(importance)
      });
    }
  }

  const mensLifeIndex = calculateMensLifeIndex(scored.map((x) => x.currentStrengthScore));
  const importanceWeightedLifeIndex = calculateImportanceWeightedMensLifeIndex(weighted);

  const systemScores = {
    meaningAndDirection: avgScores(
      LIFE_SYSTEMS['meaning-and-direction'].keys.map((k) => byKey[k]?.currentStrengthScore)
    ),
    relationshipsAndResponsibility: avgScores(
      LIFE_SYSTEMS['relationships-and-responsibility'].keys.map(
        (k) => byKey[k]?.currentStrengthScore
      )
    ),
    strengthAndStewardship: avgScores(
      LIFE_SYSTEMS['strength-and-stewardship'].keys.map((k) => byKey[k]?.currentStrengthScore)
    ),
    innerStability: avgScores(
      LIFE_SYSTEMS['inner-stability'].keys.map((k) => byKey[k]?.currentStrengthScore)
    )
  };

  const coreStrengths = scored
    .filter(
      (x) =>
        x.currentStrengthScore >= 8 &&
        (x.personalImportanceScore == null || x.personalImportanceScore >= 7)
    )
    .sort((a, b) => b.currentStrengthScore - a.currentStrengthScore);

  const highImportanceDevelopment = scored
    .filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && x.currentStrengthScore <= 5
    )
    .sort(
      (a, b) => (b.developmentOpportunityScore || 0) - (a.developmentOpportunityScore || 0)
    );

  const losingMomentum = scored.filter(
    (x) => x.currentStrengthScore >= 7 && (x.currentMomentumScore ?? 99) <= 4
  );

  const lowerPriority = scored.filter(
    (x) => x.currentStrengthScore <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );

  const insights = buildDeterministicInsights(scored);
  if (
    mensLifeIndex != null &&
    mensLifeIndex >= 75 &&
    scored.filter((x) => x.currentStrengthScore <= 4).length === 1
  ) {
    insights.unshift(
      'Most areas currently feel strong, while one domain stands out as an important development opportunity.'
    );
  }
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    mensLifeIndex,
    importanceWeightedLifeIndex,
    statusLabel: mensLifeIndexLabel(mensLifeIndex),
    systemScores,
    coreStrengths,
    highImportanceDevelopment,
    losingMomentum,
    lowerPriority,
    domains: scored,
    insights: insights.slice(0, 8),
    coreStrengthCount: coreStrengths.length,
    highImportanceDevelopmentCount: highImportanceDevelopment.length,
    decliningMomentumCount: losingMomentum.length,
    indexClarification:
      template?.settings?.indexClarification ||
      "The Men's Life Index summarizes your current experience across the domains you completed. It does not measure masculinity, worth, character, success, or potential.",
    matrixClarification:
      'A lower-priority domain does not automatically require improvement.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'married-men', label: 'Married / partnered', description: 'Full ten-domain assessment' },
  { id: 'young-adult', label: 'Young adult', description: 'Purpose, friendships, emerging legacy' },
  { id: 'single-men', label: 'Single men', description: 'Relationships reframed; marriage optional' },
  { id: 'fathers', label: 'Fathers', description: 'Fatherhood, partnership, presence' },
  { id: 'leadership', label: 'Men in leadership', description: 'Influence, integrity, recovery' },
  { id: 'midlife', label: 'Midlife review', description: 'Changing purpose and transitions' },
  { id: 'later-life', label: 'Later life / retirement', description: 'Purpose after career, legacy' },
  { id: 'coaching', label: 'Coaching', description: 'Full scoring with action plans' },
  { id: 'counseling', label: 'Counseling', description: 'Stronger privacy and support options' }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Men\'s Life Assessment', description: '10 domains', time: '15–22 min' },
  { id: 'quick', label: 'Quick check-in', description: 'Selected domains', time: '4–7 min' },
  { id: 'annual-review', label: 'Annual life review', description: 'Full + historical reflection', time: '20–30 min' },
  {
    id: 'life-transition',
    label: 'Life transition review',
    description: 'During a significant change',
    time: '12–18 min'
  },
  {
    id: 'mens-group',
    label: 'Men\'s group assessment',
    description: 'Private scores, optional themes',
    time: '15–20 min'
  },
  { id: 'targeted', label: 'Targeted review', description: 'One to three domains', time: '5–10 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'strategy', label: 'I would like a strategy to try' },
  { id: 'guided-reflection', label: 'I would like a guided reflection' },
  { id: 'accountability', label: 'I would like an accountability partner' },
  { id: 'coach', label: 'I would like to speak with a coach' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'mentor', label: 'I would like to speak with a mentor' },
  { id: 'spiritual-leader', label: 'I would like to speak with a spiritual leader' },
  { id: 'couples-support', label: 'I would like couples support' },
  { id: 'financial-guidance', label: 'I would like financial guidance' },
  { id: 'fitness-health-support', label: 'I would like fitness or health support' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'support-today', label: 'I need support today' },
  { id: 'unsure', label: 'I am unsure' }
];

export const PRIORITY_TYPES = [
  { id: 'build', label: 'Build' },
  { id: 'strengthen', label: 'Strengthen' },
  { id: 'restore', label: 'Restore' },
  { id: 'protect', label: 'Protect' },
  { id: 'clarify', label: 'Clarify' },
  { id: 'rebalance', label: 'Rebalance' },
  { id: 'repair', label: 'Repair' },
  { id: 'sustain', label: 'Sustain' },
  { id: 'explore', label: 'Explore' },
  { id: 'prepare', label: 'Prepare' }
];

export const LIFE_STAGE_OPTIONS = [
  'Young adult',
  'Building a career',
  'Dating or relationship-building',
  'Newly married or partnered',
  'Raising young children',
  'Raising school-age children',
  'Parenting teenagers',
  'Blended family',
  'Children leaving home',
  'Midlife transition',
  'Caring for aging family',
  'Career transition',
  'Retirement transition',
  'Retired',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const ROLE_OPTIONS = [
  'Husband',
  'Partner',
  'Father',
  'Stepfather',
  'Grandfather',
  'Son',
  'Brother',
  'Friend',
  'Mentor',
  'Leader',
  'Employee',
  'Business owner',
  'Coach',
  'Caregiver',
  'Community member',
  'Student',
  'Other'
];

export const CURRENT_CONCERN_OPTIONS = [
  'I feel unclear about purpose',
  'My relationship needs attention',
  'I want to be more present as a father',
  'I feel isolated',
  'I am carrying too much responsibility',
  'My physical health needs attention',
  'Financial pressure is high',
  'My spiritual life feels disconnected',
  'I am emotionally exhausted',
  'I am thinking about legacy',
  'I feel generally strong and want to protect it',
  'I am adjusting to a transition',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Clarify purpose',
  'Strengthen marriage',
  'Improve fatherhood',
  'Build friendships',
  'Develop leadership',
  'Improve fitness',
  'Strengthen finances',
  'Reconnect spiritually',
  'Improve emotional health',
  'Build a meaningful legacy',
  'Create a whole-life plan',
  'Other'
];

export const TIMEFRAME_OPTIONS = [
  { id: 'past-thirty-days', label: 'Past 30 days' },
  { id: 'past-ninety-days', label: 'Past 90 days' },
  { id: 'current-season', label: 'Current life season' },
  { id: 'past-year', label: 'Past year' },
  { id: 'custom', label: 'Custom period' }
];

export const RELATED_ASSESSMENT_LABELS = {
  'values-alignment': 'Values Alignment Assessment',
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'relationship-health': 'Relationship Health Assessment',
  'athlete-readiness': 'Athlete Performance Readiness',
  'teen-wellbeing': 'Well-Being Assessment'
};
