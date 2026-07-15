/**
 * Teen Well-Being scoring helpers (mirrors backend for guest mode).
 * All domain scores use the same positive direction (higher = stronger current well-being).
 * Stress = manageability; Sleep = restoration. Support Need does not alter the index.
 */

export function calculateTeenWellBeingIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateWeightedTeenWellBeingIndex(values) {
  const list = (values || []).filter(
    (i) =>
      i &&
      Number.isFinite(Number(i.score)) &&
      Number.isFinite(Number(i.weight)) &&
      Number(i.weight) > 0
  );
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!totalWeight) return null;
  const weightedTotal = list.reduce(
    (sum, item) => sum + Number(item.score) * Number(item.weight),
    0
  );
  return Math.round((weightedTotal / totalWeight) * 10);
}

export function calculateTeenSupportOpportunityScore(
  currentScore,
  importanceScore,
  supportNeedScore
) {
  const current = Number(currentScore);
  const importance = Number(importanceScore);
  const supportNeed = Number(supportNeedScore);
  if (!Number.isFinite(current) || !Number.isFinite(importance) || !Number.isFinite(supportNeed)) {
    return null;
  }
  const currentGap = 11 - current;
  return Number((currentGap * 0.5 + importance * 0.25 + supportNeed * 0.25).toFixed(2));
}

export function teenWellBeingIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Support May Be Helpful';
  if (s <= 54) return 'Several Areas Feel Difficult';
  if (s <= 69) return 'Mixed but Supported';
  if (s <= 84) return 'Generally Positive';
  return 'Strong Current Well-Being';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Feels Very Difficult';
  if (s <= 5) return 'Current Challenge';
  if (s <= 7) return 'Mixed or Developing';
  if (s <= 9) return 'Current Strength';
  return 'Strong Current Strength';
}

export function interpretDomainScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may feel difficult right now. Needing support is not a failure.`;
  }
  if (s <= 5) {
    return `${label} appears mixed right now. This area may be worth exploring with a trusted person if that feels useful.`;
  }
  if (s <= 7) {
    return `${label} appears to be developing. Some parts may feel okay while others still need attention.`;
  }
  return `${label} appears to be a current strength based on your responses.`;
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const WELLBEING_SYSTEMS = {
  'inner-well-being': {
    id: 'inner-well-being',
    label: 'Inner Well-Being',
    keys: ['confidence', 'identity', 'happiness', 'purpose']
  },
  'relationships-and-support': {
    id: 'relationships-and-support',
    label: 'Relationships and Support',
    keys: ['friendships', 'family']
  },
  'daily-functioning': {
    id: 'daily-functioning',
    label: 'Daily Functioning',
    keys: ['school', 'activities']
  },
  'regulation-and-recovery': {
    id: 'regulation-and-recovery',
    label: 'Regulation and Recovery',
    keys: ['stress', 'sleep']
  }
};

export function domainsForContext(
  template,
  { mode = 'full', ageVersion = 'ages-15-to-18' } = {}
) {
  return (template?.domains || []).filter((d) => {
    const ages = d.ageVersions || d.age_versions || [];
    if (ages.length && ageVersion && ageVersion !== 'custom' && !ages.includes(ageVersion)) {
      // Ages 12–14: still include purpose if missing from ages list? purpose is 15-18 only
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
  const scoreOf = (k) => byKey[k]?.score;

  if ((scoreOf('confidence') ?? 99) <= 5 && (scoreOf('school') ?? 99) <= 5) {
    insights.push(
      'School challenges and confidence may currently be connected. Identifying one area of academic support or one recent success may be useful.'
    );
  }
  if ((scoreOf('friendships') ?? 0) >= 7 && (scoreOf('family') ?? 99) <= 5) {
    insights.push(
      'Friendships appear to be an important source of support while family life currently feels more difficult or mixed.'
    );
  }
  if ((scoreOf('family') ?? 0) >= 7 && (scoreOf('friendships') ?? 99) <= 5) {
    insights.push(
      'Family appears to be a source of support while friendships currently feel more difficult.'
    );
  }
  if ((scoreOf('sleep') ?? 99) <= 5 && (scoreOf('stress') ?? 99) <= 5) {
    insights.push(
      'Limited rest and high stress may be affecting one another. A simple sleep and stress-support plan may be worth exploring.'
    );
  }
  if ((scoreOf('activities') ?? 99) <= 5) {
    const chips = byKey.activities?.reflectionChips || [];
    if (
      chips.some((c) => /too many|schedule pressure/i.test(String(c))) ||
      (scoreOf('activities') ?? 99) <= 5
    ) {
      insights.push(
        'Current activities may be creating more pressure than enjoyment. Reviewing commitments and recovery time could be useful.'
      );
    }
  }
  if ((scoreOf('activities') ?? 0) >= 8 && (scoreOf('purpose') ?? 0) >= 8) {
    insights.push(
      'Activities appear to provide meaning, direction, or a sense of contribution.'
    );
  }
  if ((scoreOf('identity') ?? 99) <= 5 && (scoreOf('confidence') ?? 99) <= 5) {
    insights.push(
      'Feeling unsure or unable to be yourself may be affecting confidence. A supportive person or environment may help.'
    );
  }
  if ((scoreOf('school') ?? 0) >= 7 && (scoreOf('stress') ?? 99) <= 5) {
    insights.push(
      'School may be going relatively well while still requiring substantial emotional effort.'
    );
  }
  if ((scoreOf('happiness') ?? 99) <= 4) {
    const othersHigh = (scored || []).filter(
      (x) => x.domainKey !== 'happiness' && x.score >= 7
    ).length;
    if (othersHigh >= 3) {
      insights.push(
        'Several parts of life appear supportive, but enjoyment or positive emotion is currently limited. This may be worth discussing with a trusted adult.'
      );
    }
  }
  if ((scoreOf('happiness') ?? 99) <= 4 && (scoreOf('purpose') ?? 99) <= 4) {
    insights.push(
      'Enjoyment and direction both feel limited right now. A private conversation with a trusted support person may be helpful.'
    );
  }
  const lowCount = (scored || []).filter((x) => x.score <= 4).length;
  if (lowCount >= 4) {
    insights.push(
      'Several parts of life feel difficult at the same time. Choosing one safe support person and one immediate priority may be more manageable than trying to address everything at once.'
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

export function buildTeenWellBeingSummary(
  template,
  responses,
  { mode = 'full', ageVersion = 'ages-15-to-18', priorityKeys = [] } = {}
) {
  const domains = domainsForContext(template, { mode, ageVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer) continue;
    if (r.currentExperienceScore == null && r.score == null) continue;
    const score = Number(r.currentExperienceScore ?? r.score);
    const importance = r.importanceScore ?? null;
    const supportNeed = r.supportNeedScore ?? null;
    const opportunity =
      importance != null && supportNeed != null
        ? calculateTeenSupportOpportunityScore(score, importance, supportNeed)
        : null;
    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.wellbeingSystem || d.wellBeingSystem,
      score,
      importanceScore: importance,
      supportNeedScore: supportNeed,
      opportunityScore: opportunity,
      status: domainStatusLabel(score),
      interpretation: interpretDomainScore(score, d.label),
      reflectionChips: r.reflectionChips || [],
      supportPreference: r.supportPreference || 'none',
      reflectionVisibility: r.reflectionVisibility || 'private',
      isSensitive: !!d.isSensitive
    });
    if (Number(d.weight) > 0) weighted.push({ score, weight: Number(d.weight) });
  }

  const teenWellBeingIndex =
    weighted.length > 0
      ? calculateWeightedTeenWellBeingIndex(weighted)
      : calculateTeenWellBeingIndex(scored.map((x) => x.score));

  const systemScores = {
    innerWellBeing: avgScores(
      WELLBEING_SYSTEMS['inner-well-being'].keys.map((k) => byKey[k]?.currentExperienceScore ?? byKey[k]?.score)
    ),
    relationshipsAndSupport: avgScores(
      WELLBEING_SYSTEMS['relationships-and-support'].keys.map(
        (k) => byKey[k]?.currentExperienceScore ?? byKey[k]?.score
      )
    ),
    dailyFunctioning: avgScores(
      WELLBEING_SYSTEMS['daily-functioning'].keys.map(
        (k) => byKey[k]?.currentExperienceScore ?? byKey[k]?.score
      )
    ),
    regulationAndRecovery: avgScores(
      WELLBEING_SYSTEMS['regulation-and-recovery'].keys.map(
        (k) => byKey[k]?.currentExperienceScore ?? byKey[k]?.score
      )
    )
  };

  const strengths = scored.filter((x) => x.score >= 8).sort((a, b) => b.score - a.score);
  const challenges = scored
    .filter((x) => x.score <= 5)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0) || a.score - b.score);

  const insights = buildDeterministicInsights(scored);
  if (teenWellBeingIndex != null && teenWellBeingIndex >= 75 && challenges.length === 1) {
    insights.unshift(
      'Most areas currently feel positive, while one area stands out as needing additional attention.'
    );
  }
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    teenWellBeingIndex,
    alignmentLevel: teenWellBeingIndexLabel(teenWellBeingIndex),
    statusLabel: teenWellBeingIndexLabel(teenWellBeingIndex),
    systemScores,
    strengths,
    challenges,
    domains: scored,
    insights: insights.slice(0, 8),
    strengthCount: strengths.length,
    supportOpportunityCount: challenges.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'The Teen Well-Being Index summarizes how different areas of life feel right now. It is not a diagnosis and does not define who you are.'
  };
}

export const AGE_VERSION_OPTIONS = [
  { id: 'ages-12-to-14', label: 'Ages 12–14', description: 'Shorter wording and clearer examples' },
  { id: 'ages-15-to-18', label: 'Ages 15–18', description: 'Full ten-domain assessment' },
  {
    id: 'transition-age-youth',
    label: 'Older youth / young adult',
    description: 'Includes independence and future focus'
  }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full assessment', description: 'About 10–15 minutes', time: '10–15 min' },
  { id: 'weekly', label: 'Weekly check-in', description: 'A shorter pulse check', time: '2–4 min' },
  { id: 'quick', label: 'Quick mood & support', description: 'Very short check-in', time: '1–2 min' },
  { id: 'transition', label: 'Transition review', description: 'During a big life change', time: '8–12 min' },
  { id: 'targeted', label: 'Targeted review', description: 'Focus on selected areas', time: '5–8 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'idea-to-try', label: 'I would like an idea to try' },
  { id: 'counselor', label: 'I would like to talk with a counselor' },
  { id: 'teacher', label: 'I would like to talk with a teacher' },
  { id: 'coach-or-leader', label: 'I would like to talk with a coach or activity leader' },
  { id: 'caregiver', label: 'I would like to talk with a parent or caregiver' },
  { id: 'trusted-adult', label: 'I would like to talk with another trusted adult' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'help-today', label: 'I need help today' },
  { id: 'unsure', label: 'I am not sure' }
];

export const REFLECTION_VISIBILITY_OPTIONS = [
  { id: 'private', label: 'Private to me' },
  { id: 'counselor', label: 'Share with my counselor' },
  { id: 'selected-trusted-adult', label: 'Share with a selected trusted adult' },
  { id: 'caregiver', label: 'Share with caregiver' },
  { id: 'shared-with-plan', label: 'Share with this action plan' },
  { id: 'do-not-save', label: 'Do not save this written response' }
];
