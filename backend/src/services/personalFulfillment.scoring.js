/**
 * Personal Fulfillment scoring — pure functions, no DB.
 * Growth Momentum does not affect the standard Personal Fulfillment Index.
 */

export function calculatePersonalFulfillmentIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateWeightedFulfillmentIndex(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.fulfillmentScore)) &&
      Number.isFinite(Number(v.importanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.importanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.fulfillmentScore) * Number(v.importanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

export function calculateFulfillmentOpportunityScore(
  fulfillmentScore,
  importanceScore,
  momentumScore
) {
  const fulfillment = Number(fulfillmentScore);
  const importance = Number(importanceScore);
  if (!Number.isFinite(fulfillment) || !Number.isFinite(importance)) return null;
  const fulfillmentGap = 11 - fulfillment;
  const momentumAdjustment =
    momentumScore !== undefined &&
    momentumScore !== null &&
    Number.isFinite(Number(momentumScore))
      ? (11 - Number(momentumScore)) * 0.15
      : 0;
  return Number((fulfillmentGap * 0.6 + importance * 0.25 + momentumAdjustment).toFixed(2));
}

export function personalFulfillmentIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Fulfillment Gaps';
  if (s <= 54) return 'Several Areas Feel Unsatisfying';
  if (s <= 69) return 'Mixed Fulfillment';
  if (s <= 84) return 'Generally Fulfilling';
  return 'Strong Current Fulfillment';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Currently Unsatisfying';
  if (s <= 5) return 'Current Fulfillment Gap';
  if (s <= 7) return 'Moderately Fulfilling';
  if (s <= 9) return 'Strong Fulfillment Source';
  return 'Deep Fulfillment Source';
}

export function momentumLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return 'Not Enough Information';
  const s = Number(score);
  if (s <= 3) return 'Declining';
  if (s <= 5) return 'Stable';
  if (s <= 7) return 'Variable';
  return 'Improving';
}

export function interpretFulfillmentScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may feel less fulfilling right now. Rest, transition, uncertainty, and grief can affect fulfillment.`;
  }
  if (s <= 5) {
    return `${label} appears mixed in your current season. This domain may deserve additional attention if it matters to you.`;
  }
  if (s <= 7) {
    return `${label} appears moderately fulfilling. Satisfaction does not require constant intensity.`;
  }
  return `${label} appears to be a current source of meaning or satisfaction.`;
}

export function matrixQuadrant(fulfillment, importance) {
  if (fulfillment == null || importance == null) return null;
  const highF = Number(fulfillment) >= 7;
  const highI = Number(importance) >= 7;
  if (highF && highI) return 'nourishing-anchors';
  if (!highF && highI) return 'high-value-growth';
  if (highF && !highI) return 'pleasant-extras';
  return 'lower-priority';
}

export const MATRIX_QUADRANT_LABELS = {
  'nourishing-anchors': 'Nourishing Anchors',
  'high-value-growth': 'High-Value Growth Areas',
  'pleasant-extras': 'Pleasant Extras',
  'lower-priority': 'Lower-Priority Areas'
};

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const FULFILLMENT_SYSTEMS = {
  'meaning-and-direction': {
    id: 'meaning-and-direction',
    label: 'Meaning and Direction',
    keys: ['purpose', 'hope', 'curiosity']
  },
  'positive-experience': {
    id: 'positive-experience',
    label: 'Positive Experience',
    keys: ['joy', 'gratitude']
  },
  'capability-and-progress': {
    id: 'capability-and-progress',
    label: 'Capability and Progress',
    keys: ['accomplishment', 'confidence', 'energy']
  },
  'connection-and-autonomy': {
    id: 'connection-and-autonomy',
    label: 'Connection and Autonomy',
    keys: ['relationships', 'freedom']
  }
};

export function domainsForContext(
  template,
  { mode = 'full', participantVersion = 'general-adult' } = {}
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
  const f = (k) => byKey[k]?.fulfillmentScore;

  if ((f('purpose') ?? 0) >= 8 && (f('energy') ?? 99) <= 5) {
    insights.push(
      'Your life appears meaningful, but the energy required to sustain current responsibilities may be difficult. Protecting recovery may help you remain connected to your purpose.'
    );
  }
  if ((f('accomplishment') ?? 0) >= 8 && (f('joy') ?? 99) <= 5) {
    insights.push(
      'You report strong progress or achievement, while enjoyment is less available. Fulfillment may require space to experience, celebrate, or enjoy what you are accomplishing.'
    );
  }
  if ((f('accomplishment') ?? 0) >= 8 && (f('gratitude') ?? 99) <= 5) {
    insights.push(
      'You appear focused on progress, but completed efforts may not be receiving much acknowledgment or appreciation.'
    );
  }
  if ((f('relationships') ?? 0) >= 8 && (f('freedom') ?? 99) <= 5) {
    insights.push(
      'Relationships appear meaningful, while personal choice or space may feel limited. Boundaries or clearer responsibility-sharing may be worth exploring.'
    );
  }
  if ((f('freedom') ?? 0) >= 8 && (f('relationships') ?? 99) <= 5) {
    insights.push(
      'You report meaningful autonomy, while connection currently feels less fulfilling. Greater freedom and stronger relationships do not necessarily have to compete.'
    );
  }
  if ((f('curiosity') ?? 0) >= 8 && (f('accomplishment') ?? 99) <= 5) {
    insights.push(
      'You have strong interest and exploration, while completing or applying ideas may feel less satisfying. Choosing one idea to develop could create greater progress.'
    );
  }
  if ((f('confidence') ?? 0) >= 8 && (f('purpose') ?? 99) <= 5) {
    insights.push(
      'You trust your capabilities, but direction or meaning currently feels less clear. Purpose may be more about choosing where to apply your strengths than building more confidence.'
    );
  }
  if ((f('confidence') ?? 99) <= 5 && (f('accomplishment') ?? 0) >= 7) {
    insights.push(
      'Your progress appears stronger than your current self-confidence suggests. Reviewing specific evidence of competence may be useful.'
    );
  }
  if ((f('hope') ?? 99) <= 5 && (f('relationships') ?? 0) >= 7) {
    insights.push(
      'The future currently feels uncertain, but supportive relationships may provide an important source of perspective and stability.'
    );
  }
  if ((f('hope') ?? 99) <= 4 && (f('purpose') ?? 99) <= 4) {
    insights.push(
      'Direction and hope both feel limited right now. A conversation with a trusted support person may be useful.'
    );
  }
  if ((f('joy') ?? 99) <= 4 && (f('energy') ?? 99) <= 4) {
    insights.push(
      'Limited energy may be making enjoyment harder to access. Rest, reduced demands, and appropriate support may be more useful than adding another goal.'
    );
  }
  if ((f('gratitude') ?? 0) >= 7 && (f('joy') ?? 99) <= 5) {
    insights.push(
      'Gratitude remains accessible even though enjoyment is currently limited. These experiences can exist together.'
    );
  }

  const highImpLowF = (scored || []).filter(
    (x) => (x.importanceScore ?? 0) >= 8 && (x.fulfillmentScore ?? 99) <= 5
  );
  if (highImpLowF[0]) {
    insights.push(
      `${highImpLowF[0].label} is highly important to you but currently feels less fulfilling than desired.`
    );
  }

  const lowBoth = (scored || []).filter(
    (x) => (x.importanceScore ?? 99) <= 4 && (x.fulfillmentScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} currently receives limited importance and limited fulfillment. It may not require attention unless you choose to make it a priority.`
    );
  }

  if ((scored || []).filter((x) => (x.fulfillmentScore ?? 99) <= 5).length >= 4) {
    insights.push(
      'Several parts of life currently feel less satisfying. Choosing one source of support and one realistic priority may be more manageable than trying to change everything at once.'
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

export function buildPersonalFulfillmentSummary(
  template,
  responses,
  { mode = 'full', participantVersion = 'general-adult', priorityKeys = [] } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const fulfillment = r.currentFulfillmentScore ?? r.fulfillmentScore ?? null;
    if (fulfillment == null) continue;
    const importance = r.personalImportanceScore ?? r.importanceScore ?? null;
    const momentum = r.growthMomentumScore ?? r.momentumScore ?? null;
    const opportunity =
      importance != null
        ? calculateFulfillmentOpportunityScore(fulfillment, importance, momentum)
        : null;
    const quadrant = matrixQuadrant(fulfillment, importance);
    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.fulfillmentSystem,
      fulfillmentScore: Number(fulfillment),
      importanceScore: importance == null ? null : Number(importance),
      momentumScore: momentum == null ? null : Number(momentum),
      opportunityScore: opportunity,
      status: domainStatusLabel(fulfillment),
      momentumLabel: momentumLabel(momentum),
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      interpretation: interpretFulfillmentScore(fulfillment, d.label),
      reflectionChips: r.reflectionChips || [],
      supportPreference: r.supportPreference || 'none'
    });
    if (importance != null) {
      weighted.push({
        fulfillmentScore: Number(fulfillment),
        importanceScore: Number(importance)
      });
    }
  }

  const personalFulfillmentIndex = calculatePersonalFulfillmentIndex(
    scored.map((x) => x.fulfillmentScore)
  );
  const weightedFulfillmentIndex = calculateWeightedFulfillmentIndex(weighted);

  const systemScores = {
    meaningAndDirection: avgScores(
      FULFILLMENT_SYSTEMS['meaning-and-direction'].keys.map(
        (k) => byKey[k]?.currentFulfillmentScore ?? byKey[k]?.fulfillmentScore
      )
    ),
    positiveExperience: avgScores(
      FULFILLMENT_SYSTEMS['positive-experience'].keys.map(
        (k) => byKey[k]?.currentFulfillmentScore ?? byKey[k]?.fulfillmentScore
      )
    ),
    capabilityAndProgress: avgScores(
      FULFILLMENT_SYSTEMS['capability-and-progress'].keys.map(
        (k) => byKey[k]?.currentFulfillmentScore ?? byKey[k]?.fulfillmentScore
      )
    ),
    connectionAndAutonomy: avgScores(
      FULFILLMENT_SYSTEMS['connection-and-autonomy'].keys.map(
        (k) => byKey[k]?.currentFulfillmentScore ?? byKey[k]?.fulfillmentScore
      )
    )
  };

  const strengths = scored
    .filter((x) => x.fulfillmentScore >= 8)
    .sort((a, b) => b.fulfillmentScore - a.fulfillmentScore);
  const highImportanceOpportunities = scored
    .filter((x) => (x.importanceScore ?? 0) >= 8 && x.fulfillmentScore <= 5)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
  const pleasantExtras = scored.filter(
    (x) => x.fulfillmentScore >= 7 && (x.importanceScore ?? 99) <= 5
  );
  const lowerPriority = scored.filter(
    (x) => x.fulfillmentScore <= 5 && (x.importanceScore ?? 99) <= 4
  );

  const insights = buildDeterministicInsights(scored);
  if (
    personalFulfillmentIndex != null &&
    personalFulfillmentIndex >= 75 &&
    scored.filter((x) => x.fulfillmentScore <= 4).length === 1
  ) {
    insights.unshift(
      'Most areas currently feel fulfilling, while one domain stands out as a potential priority.'
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
    personalFulfillmentIndex,
    weightedFulfillmentIndex,
    statusLabel: personalFulfillmentIndexLabel(personalFulfillmentIndex),
    systemScores,
    strengths,
    highImportanceOpportunities,
    pleasantExtras,
    lowerPriority,
    domains: scored,
    insights: insights.slice(0, 8),
    strengthDomainCount: strengths.length,
    highImportanceOpportunityCount: highImportanceOpportunities.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'The Personal Fulfillment Index summarizes current satisfaction across the domains you completed. It does not measure your worth, success, productivity, or mental health.',
    matrixClarification:
      'A lower-priority domain does not need improvement unless it matters to you.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'general-adult', label: 'General adult', description: 'Full ten-domain assessment' },
  { id: 'young-adult', label: 'Young adult', description: 'Identity, purpose, and future focus' },
  { id: 'midlife', label: 'Midlife', description: 'Changing priorities and energy' },
  { id: 'later-life', label: 'Later life / retirement', description: 'Contribution, relationships, curiosity' },
  { id: 'career-coaching', label: 'Career coaching', description: 'Purpose, freedom, accomplishment' },
  { id: 'life-coaching', label: 'Life coaching', description: 'Full assessment with action planning' },
  { id: 'counseling', label: 'Counseling', description: 'Deeper reflection and privacy controls' }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full assessment', description: 'About 12–18 minutes', time: '12–18 min' },
  { id: 'quick', label: 'Quick check-in', description: 'Selected domains', time: '3–6 min' },
  {
    id: 'life-transition',
    label: 'Life transition review',
    description: 'During a significant change',
    time: '10–15 min'
  },
  {
    id: 'recovery-review',
    label: 'Fulfillment recovery review',
    description: 'After a demanding period',
    time: '8–12 min'
  },
  { id: 'targeted', label: 'Targeted review', description: 'One to three domains', time: '5–8 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'idea-to-try', label: 'I would like an idea to try' },
  { id: 'guided-reflection', label: 'I would like a guided reflection' },
  { id: 'coach', label: 'I would like to speak with a coach' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'mentor', label: 'I would like to speak with a mentor' },
  { id: 'trusted-person', label: 'I would like to speak with another trusted person' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'unsure', label: 'I am unsure' }
];

export const PRIORITY_TYPES = [
  { id: 'increase', label: 'Increase' },
  { id: 'protect', label: 'Protect' },
  { id: 'restore', label: 'Restore' },
  { id: 'explore', label: 'Explore' },
  { id: 'rebalance', label: 'Rebalance' },
  { id: 'maintain', label: 'Maintain' }
];

export const LIFE_SEASON_OPTIONS = [
  'Building a career',
  'Raising a family',
  'Caring for others',
  'Student or training period',
  'Major transition',
  'Recovery or rebuilding',
  'Leadership season',
  'Financial rebuilding',
  'Relationship transition',
  'Health-focused season',
  'Retirement',
  'General reflection',
  'Other',
  'Prefer not to answer'
];
