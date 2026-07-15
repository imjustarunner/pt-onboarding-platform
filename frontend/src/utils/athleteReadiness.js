/**
 * Athlete Performance Readiness — scoring helpers (mirrors backend).
 */

export const LAYER_META = [
  { key: 'competitive', label: 'Competitive Readiness', short: 'Competitive' },
  { key: 'emotional', label: 'Emotional Readiness', short: 'Emotional' },
  { key: 'mental', label: 'Mental Readiness', short: 'Mental' },
  { key: 'physical', label: 'Physical Readiness', short: 'Physical' },
  { key: 'recovery', label: 'Recovery', short: 'Recovery' }
];

export const MODE_OPTIONS = [
  {
    id: 'daily',
    label: 'Daily Readiness Check',
    time: '2–4 min',
    description: 'Quick check-in before training.'
  },
  {
    id: 'competition',
    label: 'Competition Readiness Check',
    time: '3–5 min',
    description: 'Pre-competition focus, confidence, and strategy clarity.'
  },
  {
    id: 'weekly',
    label: 'Weekly Athlete Review',
    time: '5–8 min',
    description: 'Review trends across the week.'
  },
  {
    id: 'return-to-performance',
    label: 'Return-to-Performance Check',
    time: '4–6 min',
    description: 'Confidence and comfort after absence — not medical clearance.'
  }
];

export const SUPPORT_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'coach', label: 'I would like to speak with my coach' },
  { id: 'athletic-trainer', label: 'I would like to speak with the athletic trainer' },
  { id: 'performance-staff', label: 'I would like to speak with performance staff' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'unsure', label: 'I am unsure' }
];

export const ACTION_OPTIONS = [
  'Hydrate',
  'Eat a recovery meal or snack',
  'Complete additional warm-up',
  'Speak with coach',
  'Speak with athletic trainer',
  'Use a breathing or focus exercise',
  'Review competition strategy',
  'Prioritize sleep tonight',
  'Complete mobility work',
  'Reduce nonessential demands',
  'Request additional recovery',
  'No action needed',
  'Other'
];

export const DOMAIN_QUESTIONS = {
  sleep: 'How restorative was your sleep?',
  recovery: 'How physically recovered do you feel today?',
  energy: 'How much usable energy do you have today?',
  soreness: 'How physically comfortable and ready to move do you feel?',
  focus: 'How focused and mentally clear do you feel?',
  confidence: 'How confident do you feel in your ability to perform today?',
  motivation: 'How motivated do you feel to train or compete today?',
  stress: 'How manageable does your current stress level feel?',
  nutrition: 'How well fueled and hydrated do you feel?',
  connection: 'How connected and supported do you feel by your team and coaching staff?',
  competition: 'How ready do you feel to compete?'
};

export const DOMAIN_REFLECTION_PROMPTS = {
  sleep: 'What most affected your sleep?',
  recovery: 'What is having the greatest effect on your recovery?',
  energy: 'When is your energy currently lowest?',
  soreness: 'Where are you experiencing soreness or discomfort?',
  focus: 'What is most affecting your focus?',
  confidence: 'What most influences your confidence today?',
  motivation: 'What is most affecting your motivation?',
  stress: 'What is contributing most to your stress?',
  nutrition: 'What may be limiting your nutrition or hydration today?',
  connection: 'What would most strengthen your connection?',
  competition: 'What would most improve your readiness before competition?'
};

export function calculateAthleteReadinessScore(inputs) {
  const list = (inputs || []).filter(
    (i) => i && Number.isFinite(Number(i.score)) && Number.isFinite(Number(i.weight)) && Number(i.weight) > 0
  );
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!totalWeight) return null;
  const weightedTotal = list.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return Math.round((weightedTotal / totalWeight) * 10);
}

export function readinessStatusLabel(score, athleteFacing = true) {
  if (score == null) return null;
  if (athleteFacing) {
    if (score <= 39) return 'Needs Support';
    if (score <= 54) return 'Limited Today';
    if (score <= 69) return 'Moderately Ready';
    if (score <= 84) return 'Ready';
    return 'Highly Ready';
  }
  if (score <= 39) return 'Significant Support Needed';
  if (score <= 54) return 'Low Readiness';
  if (score <= 69) return 'Limited Readiness';
  if (score <= 84) return 'Ready';
  return 'High Readiness';
}

export function dailyRecommendation(score) {
  if (score == null) return null;
  if (score >= 85) {
    return {
      status: 'High Readiness',
      message: 'Your responses suggest strong readiness for today’s planned demands.'
    };
  }
  if (score >= 70) {
    return {
      status: 'Ready',
      message: 'Your responses suggest that you are generally prepared, with a few areas worth monitoring.'
    };
  }
  if (score >= 55) {
    return {
      status: 'Modified Readiness',
      message:
        'Your responses suggest that one or more areas may benefit from adjustment or coach review.'
    };
  }
  return {
    status: 'Support Recommended',
    message:
      'Your responses suggest limited readiness. Discussing recovery, physical comfort, stress, or training demands may be useful before proceeding.'
  };
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export function domainsForMode(template, mode = 'daily') {
  return (template?.domains || []).filter((d) => {
    if (d.key === 'competition' || (d.isOptional && d.key === 'competition')) {
      return mode === 'competition';
    }
    const modes = d.availableModes || ['daily'];
    return !modes.length || modes.includes(mode);
  });
}

export function interpretScore(score, labels = {}) {
  if (score == null) return '';
  if (score <= 3) return labels.low || 'Lower readiness in this area';
  if (score <= 6) return labels.mid || 'Moderate readiness in this area';
  return labels.high || 'Stronger readiness in this area';
}

export function buildAthleteReadinessSummary(template, responses, mode = 'daily') {
  const domains = domainsForMode(template, mode);
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scoreInputs = [];
  for (const d of domains) {
    const score = byKey[d.key]?.score;
    if (score == null) continue;
    if (Number(d.weight) > 0) scoreInputs.push({ score, weight: Number(d.weight) });
  }

  const readinessScore = calculateAthleteReadinessScore(scoreInputs);
  const layerOf = (keys) => avgScores(keys.map((k) => byKey[k]?.score).filter((s) => s != null));

  const layerScores = {
    recovery: layerOf(['sleep', 'recovery']),
    physical: layerOf(['energy', 'soreness', 'nutrition']),
    mental: layerOf(['focus', 'motivation']),
    emotional: layerOf(['confidence', 'stress']),
    competitive: layerOf(
      mode === 'competition'
        ? ['competition', 'connection', 'confidence', 'focus']
        : ['connection', 'confidence', 'focus']
    )
  };

  const scored = domains
    .map((d) => {
      const r = byKey[d.key];
      if (!r || r.score == null) return null;
      return {
        domainKey: d.key,
        label: d.label,
        shortLabel: d.shortLabel,
        color: d.color,
        layer: d.readinessLayer,
        score: r.score,
        supportPreference: r.supportPreference || 'none',
        reflectionChips: r.reflectionChips || [],
        bodyAreas: r.bodyAreas || []
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const strongest = scored.slice(0, 3);
  const limiters = [...scored].sort((a, b) => a.score - b.score).slice(0, 3);

  const indicators = [];
  const sleep = byKey.sleep?.score;
  const recovery = byKey.recovery?.score;
  const soreness = byKey.soreness?.score;
  const stress = byKey.stress?.score;
  const focus = byKey.focus?.score;
  const motivation = byKey.motivation?.score;
  const confidence = byKey.confidence?.score;

  if ((sleep != null && sleep <= 4) || (recovery != null && recovery <= 4)) {
    indicators.push({
      key: 'recovery_concern',
      severity: 'attention',
      message:
        'Recovery is currently limited and may be worth discussing before high-intensity training.'
    });
  }
  if (soreness != null && soreness <= 4) {
    indicators.push({
      key: 'physical_comfort',
      severity: 'attention',
      message:
        'Notable discomfort or movement limitation was reported. Follow-up may be appropriate before training.'
    });
  }
  if (stress != null && stress <= 4 && focus != null && focus <= 5) {
    indicators.push({
      key: 'stress_focus',
      severity: 'attention',
      message: 'Elevated stress may be affecting concentration and readiness.'
    });
  }
  if (motivation != null && motivation >= 8 && recovery != null && recovery <= 4) {
    indicators.push({
      key: 'motivation_recovery',
      severity: 'info',
      message:
        'Motivation is high, but current recovery may not support the desired training intensity.'
    });
  }
  if (mode === 'competition' && confidence != null && confidence <= 4) {
    indicators.push({
      key: 'low_confidence_competition',
      severity: 'attention',
      message:
        'You may benefit from strategy review, reassurance, or mental-performance support before competing.'
    });
  }

  const insights = [];
  if (strongest[0]) {
    insights.push(`${strongest[0].label} is currently one of your strongest readiness areas.`);
  }
  if (limiters[0] && strongest[0] && limiters[0].domainKey !== strongest[0].domainKey) {
    insights.push(
      `${limiters[0].label} appears lower than your stronger areas and may be worth monitoring.`
    );
  }
  if (motivation != null && recovery != null && motivation >= 8 && recovery <= 4) {
    insights.push(
      'Motivation is high relative to recovery — responses suggest discussing intensity with your coach.'
    );
  }
  if (byKey.connection?.score != null && byKey.connection.score >= 8) {
    insights.push('Team connection appears to be supporting your current readiness.');
  }

  const supportRequestCount = (responses || []).filter(
    (r) => r.supportPreference && r.supportPreference !== 'none'
  ).length;

  const urgentBody =
    soreness != null &&
    soreness <= 3 &&
    (byKey.soreness?.bodyAreas || []).some((a) =>
      /head|neck|chest|inability|severe/i.test(String(a))
    );

  return {
    readinessScore,
    readinessStatus: readinessStatusLabel(readinessScore, true),
    readinessStatusCoach: readinessStatusLabel(readinessScore, false),
    recommendation: dailyRecommendation(readinessScore),
    layerScores,
    strongest,
    limiters,
    indicators,
    insights,
    supportRequestCount,
    scoredCount: scored.length,
    domainCount: domains.length,
    showUrgentFollowUp: urgentBody || (soreness != null && soreness <= 2)
  };
}

export function scoreBar(score, max = 10) {
  const n = Math.max(0, Math.min(max, Number(score) || 0));
  const filled = Math.round((n / max) * 10);
  return '█'.repeat(filled) + '░'.repeat(10 - filled);
}
