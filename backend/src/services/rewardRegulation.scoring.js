/**
 * Reward Regulation scoring — pure functions, no DB.
 * Reward Regulation Score uses currentRegulationScore only (weighted avg × 10).
 * personalImportanceScore, momentum, stimulation load, readiness, and Channel Impact
 * do NOT change the standard regulation score.
 * Scientifically responsible: behavior / self-report patterns only — never dopamine
 * levels, addiction diagnosis, receptor damage, or “brain reset.”
 */

export const REGULATION_LEVELS = {
  reactive: { id: 'reactive', label: 'Reactive', min: 0, max: 39 },
  aware: { id: 'aware', label: 'Aware', min: 40, max: 54 },
  rebalancing: { id: 'rebalancing', label: 'Rebalancing', min: 55, max: 69 },
  directed: { id: 'directed', label: 'Directed', min: 70, max: 84 },
  'self-governed': { id: 'self-governed', label: 'Self-Governed', min: 85, max: 100 }
};

export const REGULATION_SYSTEMS = {
  command: {
    id: 'command',
    label: 'Command',
    keys: ['attention_control', 'impulse_control', 'delayed_gratification', 'boredom_tolerance']
  },
  regulation: {
    id: 'regulation',
    label: 'Regulation',
    keys: ['emotional_regulation', 'sleep_and_recovery', 'physical_activation']
  },
  environment: {
    id: 'environment',
    label: 'Environment',
    keys: ['digital_boundaries', 'environment_and_access']
  },
  direction: {
    id: 'direction',
    label: 'Direction',
    keys: ['purpose_and_direction', 'real_world_connection', 'consistency_and_recovery']
  }
};

/**
 * Weighted average of regulation scores × 10.
 * Accepts numbers or { score, weight } objects. Missing/null scores excluded.
 * Unrated / N/A channels never enter this function.
 */
export function calculateRewardRegulationScore(values) {
  const list = (values || [])
    .map((v) => {
      if (v == null) return null;
      if (typeof v === 'number' || typeof v === 'string') {
        const score = Number(v);
        if (!Number.isFinite(score)) return null;
        return { score, weight: 10 };
      }
      const score = Number(v.score ?? v.currentRegulationScore);
      const weight = Number(v.weight ?? 10);
      if (!Number.isFinite(score)) return null;
      return { score, weight: Number.isFinite(weight) && weight > 0 ? weight : 10 };
    })
    .filter(Boolean);
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, v) => sum + v.weight, 0);
  if (!totalWeight) return null;
  const weighted = list.reduce((sum, v) => sum + v.score * v.weight, 0) / totalWeight;
  return Math.round(weighted * 10);
}

export function calculateImportanceWeightedScore(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentRegulationScore)) &&
      Number.isFinite(Number(v.personalImportanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.personalImportanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentRegulationScore) * Number(v.personalImportanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

/**
 * Opportunity = regulationGap*0.45 + importance*0.35 + (low momentum boost)*0.2
 */
export function calculateOpportunityScore(
  currentRegulationScore,
  personalImportanceScore,
  momentumScore = null
) {
  const regulation = Number(currentRegulationScore);
  const importance = Number(personalImportanceScore);
  if (!Number.isFinite(regulation) || !Number.isFinite(importance)) return null;
  const regulationGap = 11 - regulation;
  const momentum = Number.isFinite(Number(momentumScore)) ? Number(momentumScore) : 5;
  const momentumBoost = 11 - momentum;
  return Number((regulationGap * 0.45 + importance * 0.35 + momentumBoost * 0.2).toFixed(2));
}

/**
 * Channel Impact Index — SEPARATE from Reward Regulation Score.
 * Uses pull, frequency, and cost of relevant rated channels only.
 * Unselected / N/A channels never zero the core regulation score.
 */
export function calculateChannelImpactIndex(channels = []) {
  const list = (channels || []).filter(
    (c) =>
      c &&
      c.isRelevant !== false &&
      !c.preferNotToAnswer &&
      Number.isFinite(Number(c.pullStrengthScore))
  );
  if (!list.length) return null;

  const impacts = list.map((c) => {
    const pull = Number(c.pullStrengthScore);
    const frequency = Number.isFinite(Number(c.frequencyScore)) ? Number(c.frequencyScore) : pull;
    const cost = Number.isFinite(Number(c.costScore)) ? Number(c.costScore) : 5;
    // Higher pull/frequency/cost → higher impact (0–100 scale)
    return (pull * 0.45 + frequency * 0.3 + cost * 0.25) * 10;
  });

  return Math.round(impacts.reduce((s, n) => s + n, 0) / impacts.length);
}

export function channelImpactLabel(index) {
  if (index == null || !Number.isFinite(Number(index))) return null;
  const s = Number(index);
  if (s <= 39) return 'Light Channel Load';
  if (s <= 54) return 'Moderate Channel Pull';
  if (s <= 69) return 'Elevated Channel Impact';
  if (s <= 84) return 'High Channel Capture';
  return 'Very High Channel Capture';
}

export function regulationLevelFromScore(score0to100) {
  if (score0to100 == null || !Number.isFinite(Number(score0to100))) return null;
  const s = Number(score0to100);
  if (s <= 39) return REGULATION_LEVELS.reactive;
  if (s <= 54) return REGULATION_LEVELS.aware;
  if (s <= 69) return REGULATION_LEVELS.rebalancing;
  if (s <= 84) return REGULATION_LEVELS.directed;
  return REGULATION_LEVELS['self-governed'];
}

export function regulationLevelFromDomain(score1to10) {
  if (score1to10 == null || !Number.isFinite(Number(score1to10))) return null;
  return regulationLevelFromScore(Number(score1to10) * 10);
}

export function rewardRegulationScoreLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const level = regulationLevelFromScore(score);
  if (!level) return null;
  if (level.id === 'reactive') return 'Reactive — Attention Often Captured';
  if (level.id === 'aware') return 'Aware — Patterns Visible, Choice Still Fragile';
  if (level.id === 'rebalancing') return 'Rebalancing — Mixed Regulation Practice';
  if (level.id === 'directed') return 'Directed — Stronger Choice With Clear Priorities';
  return 'Self-Governed — Steady, Recoverable Regulation';
}

export function domainStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const level = regulationLevelFromDomain(score);
  return level?.label || '';
}

export function interpretRegulationScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} currently feels limited. That is information about behavior patterns in this season — not a dopamine reading, addiction diagnosis, or moral verdict.`;
  }
  if (s <= 5) {
    return `${label} appears emerging. Growth may mean clearer cues, more friction, better recovery, or a competing purpose — not white-knuckle abstinence.`;
  }
  if (s <= 7) {
    return `${label} appears developing. Strengthening it may mean more consistency — or more sustainable recovery after lapses.`;
  }
  if (s <= 8) {
    return `${label} appears to be a current practiced strength in your regulation system.`;
  }
  return `${label} appears highly practiced. Protect what works and watch for environments that quietly erode choice.`;
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

function isExcludedResponse(r) {
  if (!r) return true;
  return !!(r.preferNotToAnswer || r.seasonStatus === 'not-relevant');
}

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

export function classifyChannel(channel = {}) {
  const pull = Number(channel.pullStrengthScore);
  const cost = Number(channel.costScore);
  const value = Number(channel.valueScore);
  const control = Number(channel.controlScore);
  if (!Number.isFinite(pull)) return null;
  if (Number.isFinite(cost) && cost >= 7 && pull >= 7) return 'high-cost-capture';
  if (Number.isFinite(value) && value >= 7 && Number.isFinite(control) && control >= 7) {
    return 'valuable-and-managed';
  }
  if (Number.isFinite(control) && control <= 4 && pull >= 7) return 'low-choice-pull';
  if (Number.isFinite(value) && value <= 4 && pull >= 6) return 'low-value-pull';
  if (pull >= 7) return 'strong-pull';
  return 'moderate';
}

export function buildDeterministicInsights(scored, channels = []) {
  const byKey = Object.fromEntries((scored || []).map((x) => [x.domainKey, x]));
  const insights = [];
  const r = (k) => byKey[k]?.currentRegulationScore;
  const imp = (k) => byKey[k]?.personalImportanceScore;

  if ((r('attention_control') ?? 99) <= 5 && (r('digital_boundaries') ?? 99) <= 5) {
    insights.push(
      'Attention and digital boundaries both look thin. Environment design may help more than relying on willpower alone.'
    );
  }
  if ((r('impulse_control') ?? 99) <= 5 && (r('boredom_tolerance') ?? 99) <= 5) {
    insights.push(
      'Impulse and boredom tolerance both look limited. Inserting a short pause before seeking can create room for choice.'
    );
  }
  if ((r('sleep_and_recovery') ?? 99) <= 5 && (r('attention_control') ?? 99) <= 5) {
    insights.push(
      'Sleep/recovery and attention appear linked. Protecting wind-down may restore more command than another productivity hack.'
    );
  }
  if ((r('purpose_and_direction') ?? 0) >= 8 && (r('consistency_and_recovery') ?? 99) <= 5) {
    insights.push(
      'Direction looks clear while restart-after-lapse feels fragile. A simple lapse response plan may protect purpose from all-or-nothing collapse.'
    );
  }
  if ((r('physical_activation') ?? 99) <= 5 && (r('emotional_regulation') ?? 99) <= 5) {
    insights.push(
      'Body activation and emotional regulation both look limited. A short walk or stretch can be a replacement that discharges restlessness without shame.'
    );
  }
  if ((r('real_world_connection') ?? 99) <= 5 && (r('digital_boundaries') ?? 99) <= 5) {
    insights.push(
      'Real-world connection looks thin while digital boundaries are soft. Offline belonging can compete with stimulation loops more effectively than isolation.'
    );
  }
  if ((r('environment_and_access') ?? 99) <= 5 && (r('impulse_control') ?? 0) >= 7) {
    insights.push(
      'Impulse pause looks practiced while the environment still makes seeking effortless. Changing cues may lock in the skill you already have.'
    );
  }
  if ((imp('attention_control') ?? 0) >= 8 && (r('attention_control') ?? 99) <= 5) {
    insights.push(
      'Attention control matters highly to you but feels limited right now. One protected focus block may be more useful than a total digital detox.'
    );
  }

  const highPull = (channels || []).filter(
    (c) => c.isRelevant !== false && (c.pullStrengthScore ?? 0) >= 8
  );
  if (highPull.length >= 3) {
    insights.push(
      'Several reward channels show strong pull. Choosing one channel for friction and replacement is more sustainable than trying to overhaul every loop at once.'
    );
  }
  const costly = (channels || []).filter(
    (c) =>
      c.isRelevant !== false &&
      (c.pullStrengthScore ?? 0) >= 7 &&
      (c.costScore ?? 0) >= 7 &&
      (c.valueScore ?? 99) <= 5
  );
  if (costly[0]) {
    insights.push(
      `${costly[0].label || costly[0].channelKey} looks high-pull and high-cost with limited current value. Friction plus a replacement may matter more than moralizing the habit.`
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.currentRegulationScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several high-importance domains show limited regulation. Prioritize one or two focuses rather than attempting total self-governance overnight.'
    );
  }

  // Never diagnose addiction / dopamine from scores
  insights.push(
    'These insights describe self-reported behavior patterns. They do not measure dopamine, diagnose addiction, or imply receptor damage.'
  );

  return [...new Set(insights)].slice(0, 8);
}

export function buildCommandCenterAnswers(scored = [], channels = [], priorityKeys = []) {
  const capturing = [...(channels || [])]
    .filter((c) => c.isRelevant !== false && Number.isFinite(Number(c.pullStrengthScore)))
    .sort(
      (a, b) =>
        Number(b.pullStrengthScore) * 0.6 +
        Number(b.frequencyScore || b.pullStrengthScore) * 0.4 -
        (Number(a.pullStrengthScore) * 0.6 +
          Number(a.frequencyScore || a.pullStrengthScore) * 0.4)
    )
    .slice(0, 4);

  const providing = [...(channels || [])]
    .filter(
      (c) =>
        c.isRelevant !== false &&
        (c.valueScore ?? 0) >= 6 &&
        Number.isFinite(Number(c.pullStrengthScore))
    )
    .sort((a, b) => (b.valueScore || 0) - (a.valueScore || 0))
    .slice(0, 3);

  const costing = [...(channels || [])]
    .filter(
      (c) =>
        c.isRelevant !== false &&
        (c.costScore ?? 0) >= 6 &&
        Number.isFinite(Number(c.pullStrengthScore))
    )
    .sort((a, b) => (b.costScore || 0) - (a.costScore || 0))
    .slice(0, 4);

  if (!costing.length) {
    costing.push(
      ...[...(scored || [])]
        .filter((x) => (x.currentRegulationScore ?? 99) <= 5)
        .sort((a, b) => (a.currentRegulationScore || 0) - (b.currentRegulationScore || 0))
        .slice(0, 3)
        .map((x) => ({
          channelKey: x.domainKey,
          label: x.label,
          costScore: 11 - x.currentRegulationScore,
          fromDomain: true
        }))
    );
  }

  const regaining = [...(scored || [])]
    .filter((x) => x.currentRegulationScore >= 7)
    .sort((a, b) => b.currentRegulationScore - a.currentRegulationScore)
    .slice(0, 4);

  const nextSteps = [];
  if (priorityKeys?.length) {
    nextSteps.push(
      `Focus your friction/replacement plan on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(' and ')}.`
    );
  }
  const topOpp = [...(scored || [])]
    .filter((x) => x.opportunityScore != null)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))[0];
  if (topOpp) {
    nextSteps.push(
      `Start with one cue change and one replacement in ${topOpp.label} — not a full detox.`
    );
  }
  if (costing[0] && !costing[0].fromDomain) {
    nextSteps.push(
      `Add friction to ${costing[0].label || costing[0].channelKey} and write a simple lapse response.`
    );
  }
  if (!nextSteps.length) {
    nextSteps.push(
      'Choose one priority domain, remove one cue, add one friction step, and define a replacement you can actually start.'
    );
  }

  return {
    whatCapturesMe: {
      question: 'What captures me?',
      summary:
        capturing.length > 0
          ? `Strongest capture right now appears around ${capturing
              .map((c) => c.label || c.channelKey)
              .join(', ')}.`
          : 'Channel inventory will clarify what captures attention. Domain scores still map regulation capacity.',
      items: capturing
    },
    whatIsProviding: {
      question: 'What is it providing?',
      summary:
        providing.length > 0
          ? `Some channels still appear to provide value — especially ${providing
              .map((c) => c.label || c.channelKey)
              .join(', ')}. Regulation can protect value without shaming use.`
          : 'Value ratings will clarify what these patterns still give you — relief, connection, entertainment, or escape.',
      items: providing
    },
    whatIsCosting: {
      question: 'What is it costing?',
      summary:
        costing.length > 0
          ? `Cost shows most around ${costing
              .map((c) => c.label || c.channelKey)
              .join(', ')}. Cost is about goals and energy — not a clinical label.`
          : 'Cost signals will appear as you rate channels or low-regulation domains.',
      items: costing
    },
    whatAmIRegaining: {
      question: 'What am I regaining?',
      summary:
        regaining.length > 0
          ? `You already show practiced strength in ${regaining
              .map((x) => x.label)
              .join(', ')}. Protect these while upgrading one weaker zone.`
          : 'Strengths will appear as regulation scores rise — recovery and consistency count.',
      items: regaining
    },
    whatNext: {
      question: 'What is next?',
      summary: nextSteps.join(' '),
      steps: nextSteps
    }
  };
}

export function buildFrictionBoardSuggestions(scored = [], channels = []) {
  const domainOpp = [...scored]
    .filter((x) => x.opportunityScore != null)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0));
  const channelTargets = [...channels]
    .filter(
      (c) =>
        c.isRelevant !== false &&
        (c.pullStrengthScore ?? 0) >= 6 &&
        ((c.costScore ?? 0) >= 6 || (c.controlScore ?? 99) <= 5)
    )
    .sort((a, b) => (b.pullStrengthScore || 0) - (a.pullStrengthScore || 0));

  return {
    cueRemove: channelTargets[0] || domainOpp[0] || null,
    friction: channelTargets[0] || domainOpp[0] || null,
    replace: domainOpp.find((x) =>
      ['physical_activation', 'real_world_connection', 'purpose_and_direction'].includes(x.domainKey)
    ) || domainOpp[1] || null,
    protect: [...scored]
      .filter((x) => x.currentRegulationScore >= 7)
      .sort((a, b) => b.currentRegulationScore - a.currentRegulationScore)
      .slice(0, 2),
    lapseResponse: domainOpp.find((x) => x.domainKey === 'consistency_and_recovery') || domainOpp[0] || null
  };
}

export function buildRewardRegulationSummary(
  template,
  responses,
  {
    mode = 'full',
    participantVersion = 'general-adult',
    priorityKeys = [],
    context = {},
    channels = []
  } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weightedInputs = [];
  const importanceWeighted = [];

  for (const d of domains) {
    const r = byKey[d.key];
    if (isExcludedResponse(r)) continue;
    const regulation = r?.currentRegulationScore ?? null;
    if (regulation == null) continue;
    const importance = r.personalImportanceScore ?? null;
    const momentum = r.momentumScore ?? null;
    const opportunity =
      importance != null ? calculateOpportunityScore(regulation, importance, momentum) : null;
    const score100 = Number(regulation) * 10;
    const level = regulationLevelFromScore(score100);

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.regulationSystem || d.regulation_system,
      weight: Number(d.weight || 10),
      relatedAssessments: d.relatedAssessmentIds || [],
      currentRegulationScore: Number(regulation),
      score100,
      personalImportanceScore: importance == null ? null : Number(importance),
      momentumScore: momentum == null ? null : Number(momentum),
      opportunityScore: opportunity,
      level: level?.id || null,
      levelLabel: level?.label || null,
      status: domainStatusLabel(regulation),
      interpretation: interpretRegulationScore(regulation, d.label),
      reflectionChips: r.reflectionChips || [],
      barriers: r.barriers || [],
      strengths: r.strengths || [],
      supportPreference: r.supportPreference || 'none'
    });

    weightedInputs.push({
      score: Number(regulation),
      weight: Number(d.weight || 10)
    });
    if (importance != null) {
      importanceWeighted.push({
        currentRegulationScore: Number(regulation),
        personalImportanceScore: Number(importance)
      });
    }
  }

  const channelRows = (channels || [])
    .filter((c) => c && c.isRelevant !== false && !c.preferNotToAnswer)
    .map((c) => ({
      ...c,
      classification: classifyChannel(c),
      impactContribution:
        Number.isFinite(Number(c.pullStrengthScore))
          ? Number(
              (
                (Number(c.pullStrengthScore) * 0.45 +
                  (Number.isFinite(Number(c.frequencyScore))
                    ? Number(c.frequencyScore)
                    : Number(c.pullStrengthScore)) *
                    0.3 +
                  (Number.isFinite(Number(c.costScore)) ? Number(c.costScore) : 5) * 0.25) *
                10
              ).toFixed(1)
            )
          : null
    }));

  const rewardRegulationScore = calculateRewardRegulationScore(weightedInputs);
  const priorityWeightedScore = calculateImportanceWeightedScore(importanceWeighted);
  const channelImpactIndex = calculateChannelImpactIndex(channelRows);
  const overallLevel = regulationLevelFromScore(rewardRegulationScore);

  const activeKeys = new Set(scored.map((x) => x.domainKey));
  const systemScores = {
    command: avgScores(
      REGULATION_SYSTEMS.command.keys
        .filter((k) => activeKeys.has(k))
        .map((k) => scored.find((x) => x.domainKey === k)?.currentRegulationScore)
    ),
    commandLabel: REGULATION_SYSTEMS.command.label,
    regulation: avgScores(
      REGULATION_SYSTEMS.regulation.keys
        .filter((k) => activeKeys.has(k))
        .map((k) => scored.find((x) => x.domainKey === k)?.currentRegulationScore)
    ),
    regulationLabel: REGULATION_SYSTEMS.regulation.label,
    environment: avgScores(
      REGULATION_SYSTEMS.environment.keys
        .filter((k) => activeKeys.has(k))
        .map((k) => scored.find((x) => x.domainKey === k)?.currentRegulationScore)
    ),
    environmentLabel: REGULATION_SYSTEMS.environment.label,
    direction: avgScores(
      REGULATION_SYSTEMS.direction.keys
        .filter((k) => activeKeys.has(k))
        .map((k) => scored.find((x) => x.domainKey === k)?.currentRegulationScore)
    ),
    directionLabel: REGULATION_SYSTEMS.direction.label
  };

  const greatestStrengths = [...scored]
    .filter((x) => x.currentRegulationScore >= 7)
    .sort((a, b) => b.currentRegulationScore - a.currentRegulationScore)
    .slice(0, 5);

  const biggestOpportunities = [...scored]
    .filter((x) => x.opportunityScore != null)
    .sort((a, b) => (b.opportunityScore || 0) - (a.opportunityScore || 0))
    .slice(0, 5);

  const commandCenter = buildCommandCenterAnswers(scored, channelRows, priorityKeys);
  const frictionBoard = buildFrictionBoardSuggestions(scored, channelRows);
  const insights = buildDeterministicInsights(scored, channelRows);
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus regulation attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  const stimulationLoad =
    context.totalStimulationLoadScore != null &&
    Number.isFinite(Number(context.totalStimulationLoadScore))
      ? Number(context.totalStimulationLoadScore)
      : null;
  const readiness =
    context.readinessToChangeScore != null &&
    Number.isFinite(Number(context.readinessToChangeScore))
      ? Number(context.readinessToChangeScore)
      : null;

  return {
    rewardRegulationScore,
    priorityWeightedScore,
    channelImpactIndex,
    channelImpactLabel: channelImpactLabel(channelImpactIndex),
    statusLabel: rewardRegulationScoreLabel(rewardRegulationScore),
    overallLevel: overallLevel?.id || null,
    overallLevelLabel: overallLevel?.label || null,
    systemScores,
    greatestStrengths,
    biggestOpportunities,
    commandCenter,
    frictionBoard,
    channels: channelRows,
    domains: scored,
    insights: insights.slice(0, 8),
    domainCount: scored.length,
    expectedDomainCount: domains.length,
    incomplete: scored.length < domains.length,
    stimulationLoadScore: stimulationLoad,
    readinessToChangeScore: readiness,
    greatestStrengthCount: greatestStrengths.length,
    opportunityCount: biggestOpportunities.filter((x) => (x.opportunityScore || 0) >= 6.5).length,
    indexClarification:
      template?.settings?.indexClarification ||
      'Reward Regulation Score summarizes currentRegulationScore across completed domains. Importance, momentum, stimulation load, readiness, and Channel Impact do not change this standard score.',
    channelClarification:
      template?.settings?.channelClarification ||
      'Channel Impact Index is separate context. Skipping channels never zeroes your regulation score.',
    levelClarification:
      template?.settings?.levelClarification ||
      'Levels describe regulation practice bands. They are not addiction stages or medical diagnoses.',
    safetyNote:
      'This assessment never diagnoses addiction from scores, measures dopamine, recommends medical detox, or provides gambling strategies. Specialized support preferences are optional routing stubs only.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'general-adult', label: 'General adult', description: 'Full twelve-domain regulation map' },
  { id: 'young-adult', label: 'Young adult', description: 'Attention, boredom, and digital pull' },
  { id: 'professional', label: 'Professional', description: 'Focus, work loops, and recovery' },
  { id: 'athlete', label: 'Athlete / performer', description: 'Activation, sleep, and consistency' },
  { id: 'parent', label: 'Parent / caregiver', description: 'Boundaries with limited bandwidth' },
  { id: 'coaching', label: 'Coaching', description: 'Full scoring with friction plans' }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Regulation Map', description: '12 domains + channels', time: '18–25 min' },
  { id: 'quick', label: 'Quick check-in', description: 'Core domains', time: '6–10 min' },
  { id: 'targeted', label: 'Targeted review', description: 'Selected domains', time: '5–12 min' },
  { id: 'weekly', label: 'Regulation Week', description: 'Light weekly stub', time: '3–5 min' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'strategy', label: 'I would like a friction or replacement strategy' },
  { id: 'setting-change', label: 'I would like help changing an environment or setting' },
  { id: 'accountability', label: 'I would like an accountability partner' },
  { id: 'coach', label: 'I would like to speak with a coach' },
  { id: 'counselor', label: 'I would like to speak with a counselor' },
  { id: 'mentor', label: 'I would like to speak with a mentor' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'specialized-support', label: 'I may want specialized support for a sensitive area' },
  { id: 'support-today', label: 'I need support today' },
  { id: 'unsure', label: 'I am unsure' }
];

export const PLAN_SLOTS = [
  { id: 'cueRemove', label: 'Cue remove', description: 'What trigger or access will you remove or relocate?' },
  { id: 'friction', label: 'Friction', description: 'What step makes the old loop slightly harder?' },
  { id: 'replace', label: 'Replace', description: 'What healthier action starts instead?' },
  { id: 'protect', label: 'Protect', description: 'What already works that you will keep?' },
  { id: 'lapseResponse', label: 'Lapse response', description: 'How will you restart without shame?' }
];

export const WEEKLY_CHECKIN_KEYS = [
  { id: 'attention', label: 'Attention' },
  { id: 'impulse', label: 'Impulse' },
  { id: 'sleep', label: 'Sleep' },
  { id: 'boundaries', label: 'Boundaries' },
  { id: 'connection', label: 'Connection' },
  { id: 'consistency', label: 'Consistency' },
  { id: 'stimulation', label: 'Stimulation load' }
];

export const LIFE_STAGE_OPTIONS = [
  'Young adult',
  'Building a career',
  'Partnership / family building',
  'Raising children',
  'Midlife transition',
  'High-stress season',
  'Athletic / performance season',
  'Career transition',
  'Remote / always-online work',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Reclaim attention',
  'Reduce automatic checking',
  'Improve sleep by cutting late stimulation',
  'Build boredom tolerance',
  'Add friction to one high-pull channel',
  'Strengthen real-world connection',
  'Create a lapse response plan',
  'Protect focus for meaningful work',
  'Other'
];

export const TIMEFRAME_OPTIONS = [
  { id: 'past-seven-days', label: 'Past 7 days' },
  { id: 'past-thirty-days', label: 'Past 30 days' },
  { id: 'past-ninety-days', label: 'Past 90 days' },
  { id: 'current-season', label: 'Current life season' },
  { id: 'custom', label: 'Custom period' }
];

export const RELATED_ASSESSMENT_LABELS = {
  'digital-wellness': 'Digital Wellness Assessment',
  'savage-blueprint': 'The Savage Blueprint',
  'burden-purpose': 'Burden & Purpose Assessment',
  'mens-life': "Men's Life Assessment",
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'values-alignment': 'Values Alignment Assessment',
  'athlete-readiness': 'Athlete Performance Readiness',
  'relationship-health': 'Relationship Health Assessment'
};
