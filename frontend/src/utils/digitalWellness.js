/**
 * Digital Wellness scoring — pure functions, no DB.
 * Intentional Control and Personal Importance do not change the Digital Wellness Index.
 * Optional time/duration data must never determine wellness scores.
 */

export function calculateDigitalWellnessIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateDigitalFrictionScore(currentWellnessScore, intentionalControlScore) {
  const wellness = Number(currentWellnessScore);
  const control = Number(intentionalControlScore);
  if (!Number.isFinite(wellness) || !Number.isFinite(control)) return null;
  const wellnessFriction = 11 - wellness;
  const controlFriction = 11 - control;
  return Number((wellnessFriction * 0.6 + controlFriction * 0.4).toFixed(1));
}

export function calculateDigitalWellnessOpportunityScore(
  currentWellnessScore,
  intentionalControlScore,
  personalImportanceScore
) {
  const wellness = Number(currentWellnessScore);
  const control = Number(intentionalControlScore);
  const importance = Number(personalImportanceScore);
  if (!Number.isFinite(wellness) || !Number.isFinite(control) || !Number.isFinite(importance)) {
    return null;
  }
  const wellnessGap = 11 - wellness;
  const controlGap = 11 - control;
  return Number((wellnessGap * 0.45 + controlGap * 0.25 + importance * 0.3).toFixed(2));
}

export function digitalWellnessIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Significant Digital Friction';
  if (s <= 54) return 'Several Digital Habits Feel Disruptive';
  if (s <= 69) return 'Mixed Digital Wellness';
  if (s <= 84) return 'Generally Intentional';
  return 'Strong Digital Alignment';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Frequently Disruptive';
  if (s <= 5) return 'Current Friction';
  if (s <= 7) return 'Mixed or Developing';
  if (s <= 9) return 'Balanced and Supportive';
  return 'Strongly Intentional';
}

export function digitalFrictionLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 3) return 'Low Digital Friction';
  if (s <= 5) return 'Manageable Friction';
  if (s <= 7) return 'Meaningful Digital Friction';
  if (s <= 8.5) return 'High Digital Friction';
  return 'Significant Support Opportunity';
}

export function interpretWellnessScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may currently feel disruptive. Timing, purpose, content, and context all matter — this is not a diagnosis.`;
  }
  if (s <= 5) {
    return `${label} appears mixed. This digital habit may be affecting another part of life, or may currently require stronger boundaries.`;
  }
  if (s <= 7) {
    return `${label} appears mixed or developing. This pattern may be worth exploring if it matters to you.`;
  }
  return `${label} appears balanced and intentional in your current experience.`;
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const DIGITAL_WELLNESS_SYSTEMS = {
  'digital-consumption': {
    id: 'digital-consumption',
    label: 'Digital Consumption',
    keys: ['screen_time', 'gaming', 'social_media']
  },
  'recovery-and-body': {
    id: 'recovery-and-body',
    label: 'Recovery and Body',
    keys: ['sleep', 'exercise']
  },
  'performance-and-attention': {
    id: 'performance-and-attention',
    label: 'Performance and Attention',
    keys: ['productivity', 'focus']
  },
  'connection-and-presence': {
    id: 'connection-and-presence',
    label: 'Connection and Presence',
    keys: ['relationships', 'mindfulness']
  },
  integration: {
    id: 'integration',
    label: 'Integration',
    keys: ['balance']
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

function hasChip(scored, key, substrings) {
  const chips = scored.find((x) => x.domainKey === key)?.reflectionChips || [];
  const joined = chips.join(' ').toLowerCase();
  return substrings.some((s) => joined.includes(s.toLowerCase()));
}

export function buildDeterministicInsights(scored, { usageSummary = null, index = null } = {}) {
  const byKey = Object.fromEntries((scored || []).map((x) => [x.domainKey, x]));
  const insights = [];
  const w = (k) => byKey[k]?.currentWellnessScore;
  const c = (k) => byKey[k]?.intentionalControlScore;
  const i = (k) => byKey[k]?.personalImportanceScore;

  const recreationalHours =
    usageSummary?.recreationalScreenMinutes != null
      ? Number(usageSummary.recreationalScreenMinutes) / 60
      : usageSummary?.recreationalScreenHours != null
        ? Number(usageSummary.recreationalScreenHours)
        : null;

  if (
    recreationalHours != null &&
    recreationalHours >= 4 &&
    (w('screen_time') ?? 0) >= 8 &&
    (w('balance') ?? 0) >= 7
  ) {
    insights.push(
      'Your total screen use may be substantial, but you currently experience it as intentional and compatible with your responsibilities and priorities.'
    );
  }

  if (
    recreationalHours != null &&
    recreationalHours <= 2 &&
    (w('screen_time') ?? 99) <= 5
  ) {
    insights.push(
      'Even a limited amount of screen use may feel disruptive when the timing, content, or level of choice does not support your goals.'
    );
  }

  if ((w('social_media') ?? 99) <= 5 && hasChip(scored, 'social_media', ['comparison'])) {
    insights.push(
      'Comparison appears to be reducing the value you receive from social media. Adjusting the content you follow may be more useful than eliminating the platform entirely.'
    );
  }

  if (
    (w('gaming') ?? 99) <= 5 &&
    (w('sleep') ?? 99) <= 5 &&
    (hasChip(scored, 'gaming', ['lose sleep', 'sleep']) ||
      hasChip(scored, 'sleep', ['gaming']))
  ) {
    insights.push(
      'Gaming timing may be affecting sleep. Testing an earlier stopping point could help clarify the relationship.'
    );
  }

  if (
    (w('gaming') ?? 0) >= 8 &&
    (w('relationships') ?? 0) >= 8 &&
    hasChip(scored, 'gaming', ['connect', 'social'])
  ) {
    insights.push(
      'Gaming appears to be a meaningful source of recreation and social connection.'
    );
  }

  if ((w('social_media') ?? 99) <= 5 && (w('relationships') ?? 0) >= 7) {
    insights.push(
      'Your relationships may be supportive overall, while social-media interactions or comparison feel less positive.'
    );
  }

  if ((w('sleep') ?? 99) <= 5 && (w('focus') ?? 99) <= 5) {
    insights.push(
      'Digital sleep disruption and focus difficulty may currently be reinforcing one another. A bedtime boundary may be a useful first experiment.'
    );
  }

  if ((w('productivity') ?? 0) >= 7 && (w('focus') ?? 99) <= 5) {
    insights.push(
      'You are completing responsibilities, but frequent digital interruption may be increasing the effort required.'
    );
  }

  if ((w('focus') ?? 0) >= 8 && (w('balance') ?? 99) <= 5) {
    insights.push(
      'You may be able to focus effectively while still feeling that digital life crowds out rest, relationships, or offline activities.'
    );
  }

  if (
    (w('relationships') ?? 99) <= 5 &&
    (w('mindfulness') ?? 99) <= 5 &&
    hasChip(scored, 'relationships', ['interrupt'])
  ) {
    insights.push(
      'Automatic device checking may be reducing presence during relationships. A shared device-free routine may be worth testing.'
    );
  }

  if (
    (w('exercise') ?? 99) <= 5 &&
    (w('screen_time') ?? 99) <= 5 &&
    hasChip(scored, 'exercise', ['sitting'])
  ) {
    insights.push(
      'Digital routines may be reducing opportunities for movement. Adding short movement transitions may be more realistic than attempting a major schedule change.'
    );
  }

  const highImpLowControl = (scored || []).filter(
    (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.intentionalControlScore ?? 99) <= 5
  );
  if (highImpLowControl[0]) {
    insights.push(
      `${highImpLowControl[0].label} matters to you, but changing it may require environmental support rather than relying only on willpower.`
    );
  }

  if ((scored || []).filter((x) => (x.digitalFrictionScore ?? 0) > 6).length >= 4) {
    insights.push(
      'Several digital patterns feel difficult at the same time. Choosing one environment, one time period, and one behavior may be more manageable than changing every device habit at once.'
    );
  }

  if (
    index != null &&
    index >= 75 &&
    (scored || []).filter((x) => (x.currentWellnessScore ?? 99) <= 4).length === 1
  ) {
    insights.push(
      'Most areas currently feel intentional, while one digital pattern stands out as a possible priority.'
    );
  }

  // silence unused helpers in tree-shake contexts
  void c;
  void i;

  return [...new Set(insights)].slice(0, 8);
}

export function buildDigitalWellnessSummary(
  template,
  responses,
  {
    mode = 'full',
    participantVersion = 'general-adult',
    priorityKeys = [],
    usageSummary = null
  } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const wellness = r.currentWellnessScore ?? null;
    if (wellness == null) continue;
    const control = r.intentionalControlScore ?? null;
    const importance = r.personalImportanceScore ?? null;
    const friction =
      control != null ? calculateDigitalFrictionScore(wellness, control) : null;
    const opportunity =
      control != null && importance != null
        ? calculateDigitalWellnessOpportunityScore(wellness, control, importance)
        : null;

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.digitalWellnessSystem,
      currentWellnessScore: Number(wellness),
      intentionalControlScore: control == null ? null : Number(control),
      personalImportanceScore: importance == null ? null : Number(importance),
      digitalFrictionScore: friction,
      opportunityScore: opportunity,
      status: domainStatusLabel(wellness),
      frictionLabel: digitalFrictionLabel(friction),
      interpretation: interpretWellnessScore(wellness, d.label),
      reflectionChips: r.reflectionChips || [],
      valueProvided: r.valueProvided || [],
      barriers: r.barriers || [],
      supportPreference: r.supportPreference || 'none'
    });
  }

  const digitalWellnessIndex = calculateDigitalWellnessIndex(
    scored.map((x) => x.currentWellnessScore)
  );

  const systemScores = {
    digitalConsumption: avgScores(
      DIGITAL_WELLNESS_SYSTEMS['digital-consumption'].keys.map(
        (k) => byKey[k]?.currentWellnessScore
      )
    ),
    recoveryAndBody: avgScores(
      DIGITAL_WELLNESS_SYSTEMS['recovery-and-body'].keys.map(
        (k) => byKey[k]?.currentWellnessScore
      )
    ),
    performanceAndAttention: avgScores(
      DIGITAL_WELLNESS_SYSTEMS['performance-and-attention'].keys.map(
        (k) => byKey[k]?.currentWellnessScore
      )
    ),
    connectionAndPresence: avgScores(
      DIGITAL_WELLNESS_SYSTEMS['connection-and-presence'].keys.map(
        (k) => byKey[k]?.currentWellnessScore
      )
    ),
    integration: avgScores(
      DIGITAL_WELLNESS_SYSTEMS.integration.keys.map((k) => byKey[k]?.currentWellnessScore)
    )
  };

  const balanced = scored.filter(
    (x) =>
      x.currentWellnessScore >= 8 &&
      (x.intentionalControlScore == null || x.intentionalControlScore >= 7)
  );
  const frictionAreas = scored
    .filter(
      (x) =>
        x.currentWellnessScore <= 5 ||
        (x.intentionalControlScore != null && x.intentionalControlScore <= 5) ||
        (x.digitalFrictionScore != null && x.digitalFrictionScore >= 5.1)
    )
    .sort((a, b) => (b.digitalFrictionScore || 0) - (a.digitalFrictionScore || 0));
  const highImportanceOpportunities = scored
    .filter(
      (x) =>
        (x.personalImportanceScore ?? 0) >= 8 &&
        (x.currentWellnessScore <= 5 || (x.intentionalControlScore ?? 99) <= 5)
    )
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));

  const insights = buildDeterministicInsights(scored, {
    usageSummary,
    index: digitalWellnessIndex
  });

  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  return {
    digitalWellnessIndex,
    statusLabel: digitalWellnessIndexLabel(digitalWellnessIndex),
    systemScores,
    balancedHabits: balanced,
    frictionAreas,
    highImportanceOpportunities,
    domains: scored,
    insights: insights.slice(0, 8),
    balancedDomainCount: balanced.length,
    frictionDomainCount: frictionAreas.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'The Digital Wellness Index summarizes how digital habits currently affect your life. It does not diagnose addiction or determine whether your total screen time is good or bad.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'general-adult', label: 'General adult', description: 'All ten domains' },
  { id: 'teen', label: 'Teen', description: 'Social media, gaming, sleep, school, friendships' },
  {
    id: 'college-student',
    label: 'College student',
    description: 'Unstructured time, studying, sleep, focus'
  },
  {
    id: 'parent-caregiver',
    label: 'Parent or caregiver',
    description: 'Modeling, family routines, shared expectations'
  },
  {
    id: 'workplace',
    label: 'Workplace',
    description: 'Notifications, meetings, focus, work boundaries'
  },
  { id: 'family', label: 'Family', description: 'Shared expectations and household routines' },
  {
    id: 'coaching-counseling',
    label: 'Coaching or counseling',
    description: 'Deeper reflection and support requests'
  }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Digital Wellness Assessment', description: '10 domains', time: '12–18 min' },
  { id: 'quick', label: 'Quick Digital Check-In', description: 'Selected domains', time: '3–6 min' },
  { id: 'evening', label: 'Evening Digital Review', description: 'Sleep prep and evening habits', time: '2–4 min' },
  {
    id: 'focus-productivity',
    label: 'Focus and Productivity Review',
    description: 'Focus, notifications, work boundaries',
    time: '5–8 min'
  },
  {
    id: 'family',
    label: 'Family Digital Wellness Review',
    description: 'Shared routines and expectations',
    time: '8–12 min'
  },
  { id: 'targeted', label: 'Targeted Domain Review', description: 'One to three domains', time: '5–8 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'strategy', label: 'I would like a strategy to try' },
  { id: 'setting-change', label: 'I would like help changing a setting' },
  { id: 'accountability', label: 'I would like an accountability partner' },
  { id: 'caregiver', label: 'I would like to speak with a caregiver' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'coach-or-mentor', label: 'I would like to speak with a coach or mentor' },
  { id: 'school-or-work', label: 'I would like workplace or school support' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'online-safety', label: 'I have an online-safety concern' },
  { id: 'unsure', label: 'I am unsure' }
];

export const PRIORITY_TYPES = [
  { id: 'reduce', label: 'Reduce' },
  { id: 'protect', label: 'Protect' },
  { id: 'schedule', label: 'Schedule' },
  { id: 'restructure', label: 'Restructure' },
  { id: 'replace', label: 'Replace' },
  { id: 'increase-value', label: 'Increase Value' },
  { id: 'improve-boundaries', label: 'Improve Boundaries' },
  { id: 'improve-control', label: 'Improve Control' },
  { id: 'maintain', label: 'Maintain' }
];

export const PRIMARY_DEVICE_OPTIONS = [
  'Personal phone',
  'School device',
  'Work device',
  'Gaming system',
  'Tablet',
  'Shared family device',
  'Multiple devices',
  'Other'
];

export const PRIMARY_USE_OPTIONS = [
  'Work',
  'School',
  'Gaming',
  'Social media',
  'Streaming',
  'Communication',
  'Creativity',
  'Learning',
  'News',
  'Shopping',
  'Organization',
  'Health or fitness',
  'Other'
];

export const CURRENT_CONCERN_OPTIONS = [
  'I use screens longer than intended',
  'Sleep is affected',
  'Focus is affected',
  'I feel pressure to respond',
  'Gaming is difficult to stop',
  'Social media creates stress',
  'I compare myself with others',
  'Work reaches into personal time',
  'Devices interrupt relationships',
  'I am not moving enough',
  'I want more intentional use',
  'My digital habits currently feel balanced',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Reduce automatic checking',
  'Improve sleep',
  'Improve focus',
  'Create better work boundaries',
  'Make gaming more balanced',
  'Use social media more intentionally',
  'Protect relationships',
  'Add more movement',
  'Build mindfulness',
  'Create a balanced weekly routine',
  'Other'
];

export const TIMEFRAME_OPTIONS = [
  { id: 'past-seven-days', label: 'Past 7 days' },
  { id: 'past-fourteen-days', label: 'Past 14 days' },
  { id: 'past-thirty-days', label: 'Past 30 days' },
  { id: 'current-season', label: 'Current season' },
  { id: 'custom', label: 'Custom period' }
];

export const DAYFLOW_PERIODS = [
  { id: 'waking', label: 'Waking' },
  { id: 'morning', label: 'Morning' },
  { id: 'school-or-work', label: 'School or work' },
  { id: 'midday', label: 'Midday' },
  { id: 'afternoon', label: 'Afternoon' },
  { id: 'evening', label: 'Evening' },
  { id: 'bedtime', label: 'Bedtime' },
  { id: 'overnight', label: 'Overnight' }
];

export const VALUE_CATEGORIES = [
  'Connection',
  'Learning',
  'Creativity',
  'Entertainment',
  'Relaxation',
  'Achievement',
  'Competition',
  'Work',
  'Organization',
  'Support',
  'Inspiration',
  'Escape',
  'Habit',
  'Obligation'
];
