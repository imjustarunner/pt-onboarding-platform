/**
 * The Savage Blueprint scoring — pure functions, no DB.
 * Savage Score uses currentPerformanceScore only (equal weights OK).
 * Priority, momentum, effort cost, load, and recovery do NOT change Savage Score.
 * Fatherhood N/A is excluded from denominators; no incomplete warning for skipped fatherhood.
 * Orientation-free: tiers only. No masculinity / alpha / dominance scoring.
 */

export const DOMAIN_TIERS = {
  foundation: { id: 'foundation', label: 'Foundation', min: 0, max: 39 },
  reliable: { id: 'reliable', label: 'Reliable', min: 40, max: 59 },
  resilient: { id: 'resilient', label: 'Resilient', min: 60, max: 74 },
  elite: { id: 'elite', label: 'Elite', min: 75, max: 89 },
  savage: { id: 'savage', label: 'Savage', min: 90, max: 100 }
};

export const SAVAGE_SYSTEMS = {
  'body-and-performance': {
    id: 'body-and-performance',
    label: 'Body and Performance',
    keys: ['physical_capability', 'mental_toughness', 'discipline']
  },
  'mission-and-leadership': {
    id: 'mission-and-leadership',
    label: 'Mission and Leadership',
    keys: ['purpose_mission', 'leadership', 'financial_strength']
  },
  'connection-and-emotional-mastery': {
    id: 'connection-and-emotional-mastery',
    label: 'Connection and Emotional Mastery',
    keys: ['relationships', 'fatherhood', 'emotional_intelligence', 'brotherhood']
  },
  'challenge-and-legacy': {
    id: 'challenge-and-legacy',
    label: 'Challenge and Legacy',
    keys: ['adventure_challenge', 'legacy']
  }
};

export function calculateSavageScore(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculatePriorityWeightedScore(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentPerformanceScore)) &&
      Number.isFinite(Number(v.personalPriorityScore))
  );
  if (!list.length) return null;
  const totalPriority = list.reduce((sum, v) => sum + Number(v.personalPriorityScore), 0);
  if (!totalPriority) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentPerformanceScore) * Number(v.personalPriorityScore),
    0
  );
  return Math.round((weightedTotal / totalPriority) * 10);
}

/**
 * Opportunity = performanceGap*0.45 + priority*0.35 + (low momentum boost)*0.2
 * Higher when performance is low and priority is high.
 */
export function calculateOpportunityScore(
  currentPerformanceScore,
  personalPriorityScore,
  momentumScore = null
) {
  const performance = Number(currentPerformanceScore);
  const priority = Number(personalPriorityScore);
  if (!Number.isFinite(performance) || !Number.isFinite(priority)) return null;
  const performanceGap = 11 - performance;
  const momentum = Number.isFinite(Number(momentumScore)) ? Number(momentumScore) : 5;
  const momentumBoost = 11 - momentum;
  return Number(
    (performanceGap * 0.45 + priority * 0.35 + momentumBoost * 0.2).toFixed(2)
  );
}

/** Costly Strength: strong performance that costs a lot of effort. */
export function isCostlyStrength(currentPerformanceScore, effortCostScore) {
  const performance = Number(currentPerformanceScore);
  const effort = Number(effortCostScore);
  if (!Number.isFinite(performance) || !Number.isFinite(effort)) return false;
  return performance >= 7 && effort >= 8;
}

export function domainTierFromScore(score0to100) {
  if (score0to100 == null || !Number.isFinite(Number(score0to100))) return null;
  const s = Number(score0to100);
  if (s <= 39) return DOMAIN_TIERS.foundation;
  if (s <= 59) return DOMAIN_TIERS.reliable;
  if (s <= 74) return DOMAIN_TIERS.resilient;
  if (s <= 89) return DOMAIN_TIERS.elite;
  return DOMAIN_TIERS.savage;
}

export function domainTierFromPerformance(performance1to10) {
  if (performance1to10 == null || !Number.isFinite(Number(performance1to10))) return null;
  return domainTierFromScore(Number(performance1to10) * 10);
}

export function savageScoreLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const tier = domainTierFromScore(score);
  if (!tier) return null;
  if (tier.id === 'foundation') return 'Foundation Blueprint — Significant Growth Space';
  if (tier.id === 'reliable') return 'Reliable Blueprint — Several Domains Underbuilt';
  if (tier.id === 'resilient') return 'Resilient Blueprint — Mixed Integrated Practice';
  if (tier.id === 'elite') return 'Elite Blueprint — Strong Practice With Clear Priorities';
  return 'Savage Blueprint — Integrated Intentional Execution';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const tier = domainTierFromPerformance(score);
  return tier?.label || '';
}

export function interpretPerformanceScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} has limited current performance. That is information about this season — not a verdict on worth, toughness, or masculinity.`;
  }
  if (s <= 5) {
    return `${label} appears emerging. Growth can include clearer practice, wiser limits, recovery, or releasing what is not yours.`;
  }
  if (s <= 7) {
    return `${label} appears developing. Strengthening it may mean more consistency — or more sustainable recovery, not more strain.`;
  }
  if (s <= 8) {
    return `${label} appears to be a current practiced strength on your blueprint.`;
  }
  return `${label} appears highly integrated. Protect what works and watch for costly effort that erodes sustainability.`;
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

function isExcludedResponse(r) {
  if (!r) return true;
  return !!(
    r.isNotApplicable ||
    r.preferNotToAnswer ||
    r.seasonStatus === 'not-relevant'
  );
}

export function domainsForContext(
  template,
  {
    mode = 'full',
    participantVersion = 'general-adult',
    fatherhoodApplicable = true
  } = {}
) {
  return (template?.domains || []).filter((d) => {
    if (d.key === 'fatherhood' && fatherhoodApplicable === false) return false;
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
  const p = (k) => byKey[k]?.currentPerformanceScore;
  const pr = (k) => byKey[k]?.personalPriorityScore;
  const e = (k) => byKey[k]?.effortCostScore;

  if ((p('purpose_mission') ?? 0) >= 8 && (p('discipline') ?? 99) <= 5) {
    insights.push(
      'Your mission looks clear while day-to-day discipline feels thinner. Direction compounds when follow-through and recovery are protected together.'
    );
  }
  if ((p('discipline') ?? 0) >= 8 && (p('physical_capability') ?? 99) <= 5) {
    insights.push(
      'Follow-through looks strong while body capacity receives less support. Discipline that ignores sleep and recovery eventually undermines performance.'
    );
  }
  if ((p('leadership') ?? 0) >= 8 && (p('relationships') ?? 99) <= 5) {
    insights.push(
      'Leadership practice looks strong while mutual relationships feel thinner. Influence holds better when connection is practiced, not postponed.'
    );
  }
  if ((p('mental_toughness') ?? 0) >= 8 && (p('emotional_intelligence') ?? 99) <= 5) {
    insights.push(
      'Composure under pressure looks strong while emotional skill feels limited. Toughness includes honest awareness — numbness is not the operating goal.'
    );
  }
  if ((p('adventure_challenge') ?? 0) >= 8 && (p('physical_capability') ?? 99) <= 5) {
    insights.push(
      'You choose challenge readily while physical capacity looks limited. Chosen difficulty should remain recoverable.'
    );
  }
  if ((p('legacy') ?? 0) >= 8 && (p('brotherhood') ?? 99) <= 5) {
    insights.push(
      'Legacy feels intentional while trusted peer bonds feel thinner. Long-view influence is often built through people who can tell you the truth.'
    );
  }
  if ((p('financial_strength') ?? 0) >= 8 && (p('relationships') ?? 99) <= 5) {
    insights.push(
      'Financial stewardship looks practiced while connection feels thinner. Enoughness includes the relationships that make freedom usable.'
    );
  }
  if ((pr('purpose_mission') ?? 0) >= 8 && (p('purpose_mission') ?? 99) <= 5) {
    insights.push(
      'Purpose is a high priority but less practiced right now. Clarifying one seasonal commitment may matter more than finding a permanent life thesis.'
    );
  }
  if ((p('fatherhood') ?? 0) >= 8 && (p('physical_capability') ?? 99) <= 5) {
    insights.push(
      'Fatherhood looks highly practiced while your own physical capacity receives less support. Protecting recovery may strengthen sustainable presence.'
    );
  }

  const costly = (scored || []).filter((x) => x.costlyStrength);
  if (costly[0]) {
    insights.push(
      `${costly[0].label} looks strong, but effort cost is high. Consider whether sustainability, support, or a lighter method would protect what already works.`
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalPriorityScore ?? 0) >= 8 && (x.currentPerformanceScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several high-priority domains show limited performance. Choosing one or two 90-day focuses is more responsible than trying to upgrade every area at once.'
    );
  }

  const lowBoth = (scored || []).filter(
    (x) => (x.currentPerformanceScore ?? 99) <= 5 && (x.personalPriorityScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} shows limited performance and lower priority in this season. It may not require immediate action.`
    );
  }

  if ((e('discipline') ?? 0) >= 8 && (p('discipline') ?? 0) >= 7) {
    insights.push(
      'Discipline is producing results at a high effort cost. Protecting rest rhythms can keep structure from becoming rigidity or burnout.'
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

export function build90DayFocusSuggestions(scored = []) {
  const opportunities = [...scored]
    .filter((x) => x.opportunityScore != null)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const strengths = [...scored]
    .filter((x) => x.currentPerformanceScore >= 7 && !x.costlyStrength)
    .sort((a, b) => b.currentPerformanceScore - a.currentPerformanceScore);

  const recover = [...scored]
    .filter(
      (x) =>
        x.costlyStrength ||
        ((x.effortCostScore ?? 0) >= 7 && (x.currentPerformanceScore ?? 0) >= 6)
    )
    .sort((a, b) => (b.effortCostScore || 0) - (a.effortCostScore || 0));

  return {
    primaryGrowth: opportunities[0] || null,
    secondaryGrowth: opportunities[1] || null,
    maintain: strengths.slice(0, 3),
    recover: recover.slice(0, 2)
  };
}

export function buildSavageBlueprintSummary(
  template,
  responses,
  {
    mode = 'full',
    participantVersion = 'general-adult',
    fatherhoodApplicable = true,
    priorityKeys = [],
    context = {}
  } = {}
) {
  const applicable =
    context.fatherhoodApplicable != null
      ? !!context.fatherhoodApplicable
      : fatherhoodApplicable !== false;

  const domains = domainsForContext(template, {
    mode,
    participantVersion,
    fatherhoodApplicable: applicable
  });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (isExcludedResponse(r)) continue;
    const performance = r?.currentPerformanceScore ?? null;
    if (performance == null) continue;
    const priority = r.personalPriorityScore ?? null;
    const momentum = r.momentumScore ?? null;
    const effortCost = r.effortCostScore ?? null;
    const opportunity =
      priority != null ? calculateOpportunityScore(performance, priority, momentum) : null;
    const costlyStrength =
      effortCost != null ? isCostlyStrength(performance, effortCost) : false;
    const score100 = Number(performance) * 10;
    const tier = domainTierFromScore(score100);

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.savageSystem || d.lifeSystem,
      weight: Number(d.weight || 10),
      relatedAssessments: d.relatedAssessmentIds || [],
      currentPerformanceScore: Number(performance),
      score100,
      personalPriorityScore: priority == null ? null : Number(priority),
      momentumScore: momentum == null ? null : Number(momentum),
      effortCostScore: effortCost == null ? null : Number(effortCost),
      opportunityScore: opportunity,
      costlyStrength,
      tier: tier?.id || null,
      tierLabel: tier?.label || null,
      status: domainStatusLabel(performance),
      interpretation: interpretPerformanceScore(performance, d.label),
      reflectionChips: r.reflectionChips || [],
      barriers: r.barriers || [],
      personalStrengths: r.personalStrengths || [],
      personalDefinition: r.personalDefinition || '',
      supportPreference: r.supportPreference || 'none'
    });
    if (priority != null) {
      weighted.push({
        currentPerformanceScore: Number(performance),
        personalPriorityScore: Number(priority)
      });
    }
  }

  const savageScore = calculateSavageScore(scored.map((x) => x.currentPerformanceScore));
  const priorityWeightedScore = calculatePriorityWeightedScore(weighted);
  const overallTier = domainTierFromScore(savageScore);

  const activeKeys = new Set(scored.map((x) => x.domainKey));
  const systemScores = {};
  for (const sys of Object.values(SAVAGE_SYSTEMS)) {
    const camel =
      sys.id === 'body-and-performance'
        ? 'bodyAndPerformance'
        : sys.id === 'mission-and-leadership'
          ? 'missionAndLeadership'
          : sys.id === 'connection-and-emotional-mastery'
            ? 'connectionAndEmotionalMastery'
            : 'challengeAndLegacy';
    systemScores[camel] = avgScores(
      sys.keys
        .filter((k) => activeKeys.has(k))
        .map((k) => scored.find((x) => x.domainKey === k)?.currentPerformanceScore)
    );
    systemScores[`${camel}Label`] = sys.label;
  }

  const greatestStrengths = [...scored]
    .filter((x) => x.currentPerformanceScore >= 7)
    .sort((a, b) => {
      if (b.currentPerformanceScore !== a.currentPerformanceScore) {
        return b.currentPerformanceScore - a.currentPerformanceScore;
      }
      return (a.effortCostScore || 0) - (b.effortCostScore || 0);
    })
    .slice(0, 5);

  const biggestOpportunities = [...scored]
    .filter((x) => x.opportunityScore != null)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    .slice(0, 5);

  const costlyStrengths = scored.filter((x) => x.costlyStrength);
  const focusSuggestions = build90DayFocusSuggestions(scored);
  const insights = buildDeterministicInsights(scored);
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  const loadScore =
    context.currentTotalLoadScore != null && Number.isFinite(Number(context.currentTotalLoadScore))
      ? Number(context.currentTotalLoadScore)
      : null;
  const recoveryScore =
    context.currentRecoveryScore != null && Number.isFinite(Number(context.currentRecoveryScore))
      ? Number(context.currentRecoveryScore)
      : null;

  return {
    savageScore,
    priorityWeightedScore,
    statusLabel: savageScoreLabel(savageScore),
    overallTier: overallTier?.id || null,
    overallTierLabel: overallTier?.label || null,
    systemScores,
    greatestStrengths,
    biggestOpportunities,
    costlyStrengths,
    focusSuggestions,
    domains: scored,
    insights: insights.slice(0, 8),
    fatherhoodApplicable: applicable,
    fatherhoodExcluded: !applicable,
    domainCount: scored.length,
    expectedDomainCount: domains.length,
    incomplete: scored.length < domains.length,
    loadScore,
    recoveryScore,
    greatestStrengthCount: greatestStrengths.length,
    opportunityCount: biggestOpportunities.filter((x) => (x.opportunityScore || 0) >= 6.5).length,
    costlyStrengthCount: costlyStrengths.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'Savage Score summarizes current performance across the domains you completed. Priority, momentum, and effort cost do not change this standard score.',
    focusClarification:
      template?.settings?.focusClarification ||
      'The 90-Day Focus Board helps you choose primary and secondary growth, plus what to maintain and recover.',
    tierClarification:
      template?.settings?.tierClarification ||
      'Domain tiers describe current performance bands. They are operating labels, not ranks of masculinity or worth.',
    safetyNote:
      'This assessment never recommends overwork, injury, sleep deprivation, emotional suppression, dominance contests, or self-erasure. Low scores are not a crisis diagnosis.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'general-adult', label: 'General adult', description: 'Full twelve-domain blueprint' },
  { id: 'young-adult', label: 'Young adult', description: 'Emerging direction and capacity' },
  { id: 'midlife', label: 'Midlife', description: 'Rebalancing performance and legacy' },
  { id: 'leadership', label: 'Leadership', description: 'Mission with sustainable standards' },
  { id: 'athlete', label: 'Athlete / performer', description: 'Body and challenge emphasis' },
  { id: 'coaching', label: 'Coaching', description: 'Full scoring with 90-day plans' },
  { id: 'retreat', label: 'Retreat / intensive', description: 'Reflection-forward path' }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Blueprint', description: '12 domains', time: '18–25 min' },
  { id: 'quick', label: 'Quick check-in', description: 'Core domains', time: '6–10 min' },
  { id: 'annual-review', label: 'Annual review', description: 'Full + seasonal reflection', time: '25–35 min' },
  { id: 'retreat', label: 'Retreat mode', description: 'Reflection-forward', time: '20–30 min' },
  { id: 'targeted', label: 'Targeted review', description: 'One to four domains', time: '5–12 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'strategy', label: 'I would like a strategy to try' },
  { id: 'guided-reflection', label: 'I would like a guided reflection' },
  { id: 'accountability', label: 'I would like an accountability partner' },
  { id: 'coach', label: 'I would like to speak with a coach' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'mentor', label: 'I would like to speak with a mentor' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'support-today', label: 'I need support today' },
  { id: 'unsure', label: 'I am unsure' }
];

export const FOCUS_BOARD_SLOTS = [
  { id: 'primary', label: 'Primary Growth', description: 'Main 90-day upgrade domain' },
  { id: 'secondary', label: 'Secondary Growth', description: 'Supporting upgrade domain' },
  { id: 'maintain', label: 'Maintain', description: 'Protect what is working' },
  { id: 'recover', label: 'Recover', description: 'Reduce costly effort or restore capacity' }
];

export const WEEKLY_CHECKIN_KEYS = [
  { id: 'body', label: 'Body' },
  { id: 'mind', label: 'Mind' },
  { id: 'mission', label: 'Mission' },
  { id: 'connection', label: 'Connection' },
  { id: 'discipline', label: 'Discipline' },
  { id: 'challenge', label: 'Challenge' },
  { id: 'recovery', label: 'Recovery' }
];

export const LIFE_STAGE_OPTIONS = [
  'Young adult',
  'Building a career',
  'Partnership / family building',
  'Raising children',
  'Midlife transition',
  'Leadership season',
  'Athletic / performance season',
  'Caregiving for others',
  'Career transition',
  'Later-life contribution',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Build a clearer operating system',
  'Raise physical and mental capacity',
  'Clarify mission and leadership',
  'Strengthen relationships and brotherhood',
  'Practice fatherhood more intentionally',
  'Improve discipline with recovery',
  'Choose healthier challenge',
  'Build legacy through present action',
  'Create a 90-day focus plan',
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
  'mens-life': "Men's Life Assessment",
  'burden-purpose': 'Burden & Purpose Assessment',
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'values-alignment': 'Values Alignment Assessment',
  'athlete-readiness': 'Athlete Performance Readiness',
  'digital-wellness': 'Digital Wellness Assessment',
  'relationship-health': 'Relationship Health Assessment',
  'marriage-alignment': 'Marriage Alignment Assessment',
  'parenting-confidence': 'Parenting Confidence Assessment',
  'family-functioning': 'Family Functioning Assessment',
  'teen-wellbeing': 'Well-Being Assessment'
};
