/**
 * Burden & Purpose Assessment scoring — pure functions, no DB.
 * Importance, capacity, and load do NOT change standard Burden Readiness.
 * Meaningful responsibility ≠ suffering / pain tolerance / overwork glorification.
 * Developmental orientations are pattern-based, not score ranks.
 */

/** Barriers that can qualify avoidance only when score gates also pass. */
export const AVOIDANCE_BARRIER_MARKERS = [
  'I am avoiding clarifying this even though it matters',
  'I avoid challenge even though it matters',
  'I avoid structure even though it matters',
  'I avoid responsibility even though it matters',
  'I avoid recovery even though it matters',
  'I avoid physical care even though it matters',
  'I avoid hard thinking even though it matters',
  'I avoid accountability even though it matters',
  'I avoid closeness even though it matters',
  'I avoid serving even though it matters',
  'I avoid adventure even though it matters',
  'I avoid thinking about legacy even though it matters',
  'I am avoiding this even though it matters',
  'Fear of failure keeps me from starting',
  'I keep putting this off though it matters'
];

export function calculateBurdenReadinessIndex(scores) {
  const completed = (scores || []).filter(
    (score) => score !== null && score !== undefined && Number.isFinite(Number(score))
  );
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + Number(score), 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateImportanceWeightedReadiness(values) {
  const list = (values || []).filter(
    (v) =>
      v &&
      Number.isFinite(Number(v.currentPracticeScore)) &&
      Number.isFinite(Number(v.personalImportanceScore))
  );
  if (!list.length) return null;
  const totalImportance = list.reduce((sum, v) => sum + Number(v.personalImportanceScore), 0);
  if (!totalImportance) return null;
  const weightedTotal = list.reduce(
    (sum, v) => sum + Number(v.currentPracticeScore) * Number(v.personalImportanceScore),
    0
  );
  return Math.round((weightedTotal / totalImportance) * 10);
}

/**
 * Growth opportunity = practiceGap*0.45 + importance*0.3 + capacity*0.15 + avoidanceAdjustment
 * Capacity here is sustainable capacity (higher capacity + low practice = more opportunity).
 */
export function calculateGrowthOpportunityScore(
  currentPracticeScore,
  personalImportanceScore,
  sustainableCapacityScore,
  { avoidance = false } = {}
) {
  const practice = Number(currentPracticeScore);
  const importance = Number(personalImportanceScore);
  const capacity = Number(sustainableCapacityScore);
  if (!Number.isFinite(practice) || !Number.isFinite(importance) || !Number.isFinite(capacity)) {
    return null;
  }
  const practiceGap = 11 - practice;
  const avoidanceAdjustment = avoidance ? 1.5 : 0;
  return Number(
    (practiceGap * 0.45 + importance * 0.3 + capacity * 0.15 + avoidanceAdjustment).toFixed(2)
  );
}

/** Overextension: practice and importance high, sustainable capacity low. */
export function isOverextensionSignal(
  currentPracticeScore,
  personalImportanceScore,
  sustainableCapacityScore
) {
  const practice = Number(currentPracticeScore);
  const importance = Number(personalImportanceScore);
  const capacity = Number(sustainableCapacityScore);
  if (!Number.isFinite(practice) || !Number.isFinite(importance) || !Number.isFinite(capacity)) {
    return false;
  }
  return practice >= 7 && importance >= 7 && capacity <= 4;
}

/**
 * Avoidance ONLY when importance≥8, capacity≥6, practice≤5,
 * AND participant selects avoidance barriers — never infer from low practice alone.
 */
export function isAvoidanceSignal(response = {}) {
  const practice = Number(response.currentPracticeScore);
  const importance = Number(response.personalImportanceScore);
  const capacity = Number(response.sustainableCapacityScore);
  if (!(importance >= 8 && capacity >= 6 && practice <= 5)) return false;

  const chips = [
    ...(Array.isArray(response.barriers) ? response.barriers : []),
    ...(Array.isArray(response.reflectionChips) ? response.reflectionChips : [])
  ].map((x) => String(x || ''));

  return chips.some((c) =>
    AVOIDANCE_BARRIER_MARKERS.some(
      (m) => c === m || c.toLowerCase().includes('avoid') && c.toLowerCase().includes('matters')
    )
  );
}

export function burdenReadinessLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Early Path — Significant Growth Space';
  if (s <= 54) return 'Forming Path — Several Pillars Underbuilt';
  if (s <= 69) return 'Mixed Builder Readiness';
  if (s <= 84) return 'Strong Practice With Clear Priorities';
  return 'Integrated Builder Practice';
}

export function pillarStatusLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return '';
  const s = Number(score);
  if (s <= 3) return 'Largely Unpracticed';
  if (s <= 5) return 'Emerging Practice';
  if (s <= 7) return 'Developing Practice';
  if (s <= 9) return 'Current Strength';
  return 'Well Integrated Practice';
}

export function interpretPracticeScore(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} has limited current practice. That is information about this season — not a verdict on worth, toughness, or potential.`;
  }
  if (s <= 5) {
    return `${label} appears emerging. Growth can include clearer practice, wiser limits, recovery, or releasing what is not yours.`;
  }
  if (s <= 7) {
    return `${label} appears developing. Strengthening it may mean more consistency — or more sustainable capacity, not more strain.`;
  }
  return `${label} appears to be a current practiced strength on your path.`;
}

/** Meaningful Burden Matrix: Meaning (importance) × Sustainable Capacity */
export function matrixQuadrant(importance, capacity) {
  if (importance == null || capacity == null) return null;
  const highM = Number(importance) >= 7;
  const highC = Number(capacity) >= 7;
  if (highM && highC) return 'meaningful-sustainable';
  if (highM && !highC) return 'overextended-meaning';
  if (!highM && highC) return 'capacity-without-meaning';
  return 'lower-current-priority';
}

export const MATRIX_QUADRANT_LABELS = {
  'meaningful-sustainable': 'Meaningful & Sustainable',
  'overextended-meaning': 'Overextended Meaning',
  'capacity-without-meaning': 'Capacity Without Clear Meaning',
  'lower-current-priority': 'Lower Current Priority'
};

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export const BURDEN_SYSTEMS = {
  'direction-and-identity': {
    id: 'direction-and-identity',
    label: 'Direction and Identity',
    regionOrder: 1,
    keys: ['purpose', 'character', 'legacy']
  },
  'capacity-and-readiness': {
    id: 'capacity-and-readiness',
    label: 'Capacity and Readiness',
    regionOrder: 2,
    keys: ['discipline', 'resilience', 'physical_readiness', 'mental_fortitude']
  },
  'responsibility-and-contribution': {
    id: 'responsibility-and-contribution',
    label: 'Responsibility and Contribution',
    regionOrder: 3,
    keys: ['responsibility', 'relationships', 'service']
  },
  'growth-and-exploration': {
    id: 'growth-and-exploration',
    label: 'Growth and Exploration',
    regionOrder: 4,
    keys: ['voluntary_challenge', 'adventure']
  }
};

export const ORIENTATION_DEFINITIONS = {
  observer: {
    id: 'observer',
    label: 'Observer',
    description:
      'You are mostly watching the path and gathering orientation. Observation is a valid season — not lesser worth.'
  },
  seeker: {
    id: 'seeker',
    label: 'Seeker',
    description:
      'You are exploring what is worth carrying. Curiosity and clarification are active, even when practice is uneven.'
  },
  builder: {
    id: 'builder',
    label: 'Builder',
    description:
      'You are actively constructing capacity and practice. High readiness can still be a Builder pattern when stewardship evidence is not yet primary.'
  },
  steward: {
    id: 'steward',
    label: 'Steward',
    description:
      'You show practiced responsibility and contribution with evidence of mutual care — not martyrdom.'
  },
  pathfinder: {
    id: 'pathfinder',
    label: 'Pathfinder',
    description:
      'You combine purpose with voluntary exploration — choosing renewing challenge rather than chaos or escape.'
  },
  'legacy-builder': {
    id: 'legacy-builder',
    label: 'Legacy Builder',
    description:
      'You practice direction, character, and contribution with a clear long view — evidence-based, not status-based.'
  }
};

function practiceOf(byKey, key) {
  const v = byKey[key]?.currentPracticeScore;
  return v == null || !Number.isFinite(Number(v)) ? null : Number(v);
}

function avgKeys(byKey, keys) {
  return avgScores(keys.map((k) => practiceOf(byKey, k)));
}

function hasStewardEvidence(byKey, scored) {
  const responsibility = practiceOf(byKey, 'responsibility');
  const service = practiceOf(byKey, 'service');
  const relationships = practiceOf(byKey, 'relationships');
  const scoreGate =
    (responsibility != null && responsibility >= 7 && service != null && service >= 6) ||
    (responsibility != null &&
      responsibility >= 7 &&
      relationships != null &&
      relationships >= 7) ||
    (service != null && service >= 7 && relationships != null && relationships >= 6);

  if (!scoreGate) return false;

  const evidenceChips = (scored || []).some((x) => {
    const chips = [...(x.reflectionChips || []), ...(x.personalStrengths || [])];
    return chips.some((c) => {
      const t = String(c || '').toLowerCase();
      return (
        t.includes('service') ||
        t.includes('mentor') ||
        t.includes('mutual') ||
        t.includes('family care') ||
        t.includes('community') ||
        t.includes('currently feel')
      );
    });
  });

  // Steward+ requires score gate; chip evidence strengthens but sustained high practice on 2+ contribution pillars counts.
  const contributionHigh = [responsibility, service, relationships].filter((n) => n != null && n >= 7)
    .length;
  return contributionHigh >= 2 || evidenceChips;
}

/**
 * Pattern-based orientation. Configurable priority: legacy-builder → pathfinder → steward → builder → seeker → observer.
 * High overall readiness alone does NOT force steward/legacy — can remain Builder.
 */
export function determineDevelopmentalOrientation(scored = [], { rules } = {}) {
  const byKey = Object.fromEntries((scored || []).map((x) => [x.domainKey, x]));
  const directionAvg = avgKeys(byKey, BURDEN_SYSTEMS['direction-and-identity'].keys);
  const capacityAvg = avgKeys(byKey, BURDEN_SYSTEMS['capacity-and-readiness'].keys);
  const responsibilityAvg = avgKeys(byKey, BURDEN_SYSTEMS['responsibility-and-contribution'].keys);
  const growthAvg = avgKeys(byKey, BURDEN_SYSTEMS['growth-and-exploration'].keys);
  const overall = avgScores((scored || []).map((x) => x.currentPracticeScore));

  const cfg = {
    legacyMinLegacy: 8,
    legacyMinDirection: 7.5,
    legacyMinResponsibility: 7,
    pathfinderMinGrowth: 7.5,
    pathfinderMinPurpose: 6,
    pathfinderMinAdventureOrChallenge: 7,
    stewardMinResponsibility: 7.5,
    stewardMinCapacity: 5,
    builderMinCapacity: 6.5,
    builderMinDiscipline: 7,
    builderMinPurpose: 6,
    seekerMinOverall: 4.5,
    ...(rules || {})
  };

  const purpose = practiceOf(byKey, 'purpose');
  const legacy = practiceOf(byKey, 'legacy');
  const character = practiceOf(byKey, 'character');
  const adventure = practiceOf(byKey, 'adventure');
  const challenge = practiceOf(byKey, 'voluntary_challenge');
  const discipline = practiceOf(byKey, 'discipline');
  const stewardEvidence = hasStewardEvidence(byKey, scored);

  let id = 'observer';
  let evidence = [];

  if (
    legacy != null &&
    legacy >= cfg.legacyMinLegacy &&
    directionAvg != null &&
    directionAvg >= cfg.legacyMinDirection &&
    responsibilityAvg != null &&
    responsibilityAvg >= cfg.legacyMinResponsibility &&
    stewardEvidence &&
    character != null &&
    character >= 7
  ) {
    id = 'legacy-builder';
    evidence = [
      `Legacy practice ${legacy}/10`,
      `Direction average ${directionAvg}`,
      `Contribution evidence present`
    ];
  } else if (
    growthAvg != null &&
    growthAvg >= cfg.pathfinderMinGrowth &&
    purpose != null &&
    purpose >= cfg.pathfinderMinPurpose &&
    ((adventure != null && adventure >= cfg.pathfinderMinAdventureOrChallenge) ||
      (challenge != null && challenge >= cfg.pathfinderMinAdventureOrChallenge))
  ) {
    id = 'pathfinder';
    evidence = [
      `Growth average ${growthAvg}`,
      `Purpose ${purpose}/10`,
      adventure != null && adventure >= 7
        ? `Adventure ${adventure}/10`
        : `Voluntary challenge ${challenge}/10`
    ];
  } else if (
    responsibilityAvg != null &&
    responsibilityAvg >= cfg.stewardMinResponsibility &&
    stewardEvidence &&
    (capacityAvg == null || capacityAvg >= cfg.stewardMinCapacity)
  ) {
    id = 'steward';
    evidence = [
      `Responsibility system ${responsibilityAvg}`,
      'Contribution evidence requirements met'
    ];
  } else if (
    (capacityAvg != null && capacityAvg >= cfg.builderMinCapacity) ||
    (discipline != null &&
      discipline >= cfg.builderMinDiscipline &&
      purpose != null &&
      purpose >= cfg.builderMinPurpose) ||
    (overall != null && overall >= 7 && (responsibilityAvg == null || responsibilityAvg < 7.5))
  ) {
    // High overall readiness can still be Builder when steward+ evidence is absent.
    id = 'builder';
    evidence = [
      capacityAvg != null ? `Capacity average ${capacityAvg}` : null,
      overall != null ? `Overall practice ${overall}` : null,
      'Steward/legacy evidence pattern not primary'
    ].filter(Boolean);
  } else if (
    (overall != null && overall >= cfg.seekerMinOverall) ||
    (growthAvg != null && growthAvg >= 5) ||
    (directionAvg != null && directionAvg >= 5)
  ) {
    id = 'seeker';
    evidence = [
      overall != null ? `Overall practice ${overall}` : 'Emerging engagement across pillars'
    ];
  } else {
    id = 'observer';
    evidence = ['Limited practiced engagement across pillars in this season'];
  }

  const def = ORIENTATION_DEFINITIONS[id];
  return {
    id: def.id,
    label: def.label,
    description: def.description,
    selfReported: true,
    notARankOfWorth: true,
    evidence,
    systemAverages: {
      directionAndIdentity: directionAvg,
      capacityAndReadiness: capacityAvg,
      responsibilityAndContribution: responsibilityAvg,
      growthAndExploration: growthAvg,
      overall
    }
  };
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

export function buildDeterministicInsights(scored) {
  const byKey = Object.fromEntries((scored || []).map((x) => [x.domainKey, x]));
  const insights = [];
  const p = (k) => byKey[k]?.currentPracticeScore;
  const i = (k) => byKey[k]?.personalImportanceScore;
  const c = (k) => byKey[k]?.sustainableCapacityScore;

  if ((p('purpose') ?? 0) >= 8 && (p('resilience') ?? 99) <= 5) {
    insights.push(
      'Your direction appears clear, while recovery capacity feels thinner. Purpose is more sustainable when resilience and rest are protected — not when strain is praised.'
    );
  }
  if ((p('discipline') ?? 0) >= 8 && (p('physical_readiness') ?? 99) <= 5) {
    insights.push(
      'Follow-through looks strong, while body capacity receives less support. Discipline that ignores sleep and recovery eventually undermines readiness.'
    );
  }
  if ((p('responsibility') ?? 0) >= 8 && (p('relationships') ?? 99) <= 5) {
    insights.push(
      'You report strong ownership of responsibility, while mutual relationships feel thinner. Carrying alone is not the same as carrying well.'
    );
  }
  if ((p('service') ?? 0) >= 8 && (c('service') ?? 99) <= 4) {
    insights.push(
      'Service matters and practice is high, but sustainable capacity looks low. Meaningful contribution includes boundaries — martyrdom is not the goal.'
    );
  }
  if ((p('voluntary_challenge') ?? 0) >= 8 && (p('resilience') ?? 99) <= 5) {
    insights.push(
      'You choose challenge readily, while recovery looks limited. Voluntary challenge should remain recoverable; intensity without restoration is not fortitude.'
    );
  }
  if ((p('legacy') ?? 0) >= 8 && (p('character') ?? 99) <= 5) {
    insights.push(
      'Legacy feels important, while day-to-day character practice feels less steady. Long-view influence is built through present integrity, not image.'
    );
  }
  if ((p('adventure') ?? 0) >= 8 && (p('responsibility') ?? 99) <= 5) {
    insights.push(
      'Exploration feels alive, while owned responsibility feels thinner. Adventure renews the path best when it returns you to commitments stronger, not escaping them.'
    );
  }
  if ((p('mental_fortitude') ?? 0) >= 8 && (p('relationships') ?? 99) <= 5) {
    insights.push(
      'Mental steadiness appears strong while connection is limited. Fortitude includes asking for perspective — silence is not automatically strength.'
    );
  }
  if ((i('purpose') ?? 0) >= 8 && (p('purpose') ?? 99) <= 5) {
    insights.push(
      'Purpose is highly important to you but less practiced right now. Clarifying one seasonal commitment may matter more than finding a permanent life thesis.'
    );
  }

  const overextended = (scored || []).filter((x) => x.overextension);
  if (overextended[0]) {
    insights.push(
      `${overextended[0].label} looks meaningful and highly practiced, but sustainable capacity is low. Consider release, recovery, or shared load — not more strain.`
    );
  }

  const avoided = (scored || []).filter((x) => x.avoidance);
  if (avoided[0]) {
    insights.push(
      `You marked avoidance around ${avoided[0].label}, while importance and capacity suggest room to engage. A small, recoverable first step may fit better than a dramatic push.`
    );
  }

  if (
    (scored || []).filter(
      (x) => (x.personalImportanceScore ?? 0) >= 8 && (x.currentPracticeScore ?? 99) <= 5
    ).length >= 4
  ) {
    insights.push(
      'Several high-importance pillars show limited practice. Choosing one or two priorities is more responsible than trying to transform every area at once.'
    );
  }

  const lowBoth = (scored || []).filter(
    (x) => (x.currentPracticeScore ?? 99) <= 5 && (x.personalImportanceScore ?? 99) <= 4
  );
  if (lowBoth[0]) {
    insights.push(
      `${lowBoth[0].label} shows limited practice and lower importance in this season. It may not require immediate action.`
    );
  }

  return [...new Set(insights)].slice(0, 8);
}

function buildDashboardAnswers(scored, orientation, priorityKeys = []) {
  const driving = [...(scored || [])]
    .filter((x) => (x.personalImportanceScore ?? 0) >= 7 || (x.currentPracticeScore ?? 0) >= 8)
    .sort(
      (a, b) =>
        (b.personalImportanceScore || 0) +
        (b.currentPracticeScore || 0) -
        ((a.personalImportanceScore || 0) + (a.currentPracticeScore || 0))
    )
    .slice(0, 3);

  const carryingWell = [...(scored || [])]
    .filter(
      (x) =>
        (x.currentPracticeScore ?? 0) >= 7 &&
        (x.sustainableCapacityScore == null || x.sustainableCapacityScore >= 6) &&
        !x.overextension
    )
    .sort((a, b) => b.currentPracticeScore - a.currentPracticeScore)
    .slice(0, 4);

  const avoidingGrowth = [...(scored || [])]
    .filter((x) => x.avoidance || ((x.growthOpportunityScore ?? 0) >= 7 && (x.currentPracticeScore ?? 99) <= 5))
    .sort((a, b) => (b.growthOpportunityScore || 0) - (a.growthOpportunityScore || 0))
    .slice(0, 3);

  const nextSteps = [];
  if (priorityKeys?.length) {
    nextSteps.push(
      `Focus your Meaningful Commitment Plan on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(' and ')}.`
    );
  }
  if (avoidingGrowth[0]) {
    nextSteps.push(
      `Take one small, recoverable step in ${avoidingGrowth[0].label} — not a dramatic overhaul.`
    );
  }
  if ((scored || []).some((x) => x.overextension)) {
    nextSteps.push(
      'Protect recovery or release load in at least one overextended pillar before adding new challenge.'
    );
  }
  if (!nextSteps.length && carryingWell[0]) {
    nextSteps.push(
      `Protect what is working in ${carryingWell[0].label}, then choose one growth pillar with clear recovery.`
    );
  }
  if (!nextSteps.length) {
    nextSteps.push(
      'Complete priorities and a Carry / Release / Serve / Recover commitment for one pillar.'
    );
  }

  return {
    whatIsDrivingMe: {
      question: 'What is driving me?',
      summary:
        driving.length > 0
          ? `Your strongest drivers right now appear to be ${driving.map((x) => x.label).join(', ')}.`
          : 'Drivers will clarify as you rate importance and practice across pillars.',
      pillars: driving
    },
    whatAmICarryingWell: {
      question: 'What am I carrying well?',
      summary:
        carryingWell.length > 0
          ? `You appear to be carrying ${carryingWell.map((x) => x.label).join(', ')} with practiced strength and workable capacity.`
          : 'No high-practice, sustainable pillars are marked yet — that can still be an honest starting point.',
      pillars: carryingWell
    },
    whereAmIAvoidingGrowth: {
      question: 'Where am I avoiding growth?',
      summary:
        avoidingGrowth.length > 0
          ? `Growth tension shows most around ${avoidingGrowth.map((x) => x.label).join(', ')}. Avoidance is only marked when you indicated it — low practice alone is not avoidance.`
          : 'No avoidance pattern is marked. Low practice without your avoidance signal is treated as information, not accusation.',
      pillars: avoidingGrowth
    },
    whatShouldIDoNext: {
      question: 'What should I do next?',
      summary: nextSteps.join(' '),
      steps: nextSteps,
      orientationHint: orientation?.label
        ? `Self-reported orientation: ${orientation.label}. This is a pattern label, not a rank of worth.`
        : null
    }
  };
}

export function buildBurdenPurposeSummary(
  template,
  responses,
  { mode = 'full', participantVersion = 'general-adult', priorityKeys = [], orientationRules } = {}
) {
  const domains = domainsForContext(template, { mode, participantVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scored = [];
  const weighted = [];
  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.preferNotToAnswer || r.seasonStatus === 'not-relevant') continue;
    const practice = r.currentPracticeScore ?? null;
    if (practice == null) continue;
    const importance = r.personalImportanceScore ?? null;
    const capacity = r.sustainableCapacityScore ?? null;
    const load = r.currentLoadScore ?? null;
    const avoidance = isAvoidanceSignal(r);
    const overextension =
      importance != null && capacity != null
        ? isOverextensionSignal(practice, importance, capacity)
        : false;
    const opportunity =
      importance != null && capacity != null
        ? calculateGrowthOpportunityScore(practice, importance, capacity, { avoidance })
        : null;
    const quadrant =
      importance != null && capacity != null ? matrixQuadrant(importance, capacity) : null;

    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.burdenSystem || d.lifeSystem,
      relatedAssessments: d.relatedAssessmentIds || [],
      currentPracticeScore: Number(practice),
      personalImportanceScore: importance == null ? null : Number(importance),
      sustainableCapacityScore: capacity == null ? null : Number(capacity),
      currentLoadScore: load == null ? null : Number(load),
      growthOpportunityScore: opportunity,
      avoidance,
      overextension,
      status: pillarStatusLabel(practice),
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      interpretation: interpretPracticeScore(practice, d.label),
      reflectionChips: r.reflectionChips || [],
      barriers: r.barriers || [],
      personalStrengths: r.personalStrengths || [],
      personalDefinition: r.personalDefinition || '',
      supportPreference: r.supportPreference || 'none'
    });
    if (importance != null) {
      weighted.push({
        currentPracticeScore: Number(practice),
        personalImportanceScore: Number(importance)
      });
    }
  }

  const burdenReadinessIndex = calculateBurdenReadinessIndex(
    scored.map((x) => x.currentPracticeScore)
  );
  const importanceWeightedIndex = calculateImportanceWeightedReadiness(weighted);

  const systemScores = {
    directionAndIdentity: avgScores(
      BURDEN_SYSTEMS['direction-and-identity'].keys.map((k) => byKey[k]?.currentPracticeScore)
    ),
    capacityAndReadiness: avgScores(
      BURDEN_SYSTEMS['capacity-and-readiness'].keys.map((k) => byKey[k]?.currentPracticeScore)
    ),
    responsibilityAndContribution: avgScores(
      BURDEN_SYSTEMS['responsibility-and-contribution'].keys.map(
        (k) => byKey[k]?.currentPracticeScore
      )
    ),
    growthAndExploration: avgScores(
      BURDEN_SYSTEMS['growth-and-exploration'].keys.map((k) => byKey[k]?.currentPracticeScore)
    )
  };

  const carryingWell = scored
    .filter(
      (x) =>
        x.currentPracticeScore >= 8 &&
        (x.sustainableCapacityScore == null || x.sustainableCapacityScore >= 6) &&
        !x.overextension
    )
    .sort((a, b) => b.currentPracticeScore - a.currentPracticeScore);

  const growthOpportunities = scored
    .filter((x) => x.growthOpportunityScore != null)
    .sort((a, b) => (b.growthOpportunityScore || 0) - (a.growthOpportunityScore || 0));

  const overextendedPillars = scored.filter((x) => x.overextension);
  const avoidancePillars = scored.filter((x) => x.avoidance);

  const orientation = determineDevelopmentalOrientation(scored, { rules: orientationRules });
  const insights = buildDeterministicInsights(scored);
  if (priorityKeys?.length) {
    insights.push(
      `You chose to focus intentional attention on ${priorityKeys
        .map((k) => scored.find((x) => x.domainKey === k)?.label || k)
        .join(', ')}.`
    );
  }

  const dashboard = buildDashboardAnswers(scored, orientation, priorityKeys);

  return {
    burdenReadinessIndex,
    importanceWeightedIndex,
    statusLabel: burdenReadinessLabel(burdenReadinessIndex),
    systemScores,
    orientation,
    carryingWell,
    growthOpportunities,
    overextendedPillars,
    avoidancePillars,
    domains: scored,
    insights: insights.slice(0, 8),
    dashboard,
    carryingWellCount: carryingWell.length,
    growthOpportunityCount: growthOpportunities.filter((x) => (x.growthOpportunityScore || 0) >= 6.5)
      .length,
    overextensionCount: overextendedPillars.length,
    avoidanceCount: avoidancePillars.length,
    indexClarification:
      template?.settings?.indexClarification ||
      'Burden Readiness summarizes current practice across the pillars you completed. Importance and sustainable capacity do not change this standard score.',
    matrixClarification:
      template?.settings?.matrixClarification ||
      'High meaning with low capacity may signal overextension — not a call for more strain.',
    orientationClarification:
      template?.settings?.orientationClarification ||
      'Developmental orientations are self-reported pattern labels, not ranks of worth.',
    safetyNote:
      'This assessment never recommends unsafe challenge, sleep deprivation, abuse-as-loyalty, self-erasure, or emotional suppression-as-resilience. Low scores are not a crisis diagnosis.'
  };
}

export const PARTICIPANT_VERSION_OPTIONS = [
  { id: 'general-adult', label: 'General adult', description: 'Full twelve-pillar path' },
  { id: 'young-adult', label: 'Young adult', description: 'Emerging direction and capacity' },
  { id: 'midlife', label: 'Midlife', description: 'Rebalancing burden and legacy' },
  { id: 'leadership', label: 'Leadership', description: 'Responsibility with sustainable capacity' },
  { id: 'coaching', label: 'Coaching', description: 'Full scoring with commitment plans' },
  { id: 'retreat', label: 'Retreat / intensive', description: 'Reflection-forward path' }
];

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Builder\'s Path', description: '12 pillars', time: '18–25 min' },
  { id: 'quick', label: 'Quick check-in', description: 'Core pillars', time: '6–10 min' },
  { id: 'annual-review', label: 'Annual review', description: 'Full + seasonal reflection', time: '25–35 min' },
  { id: 'retreat', label: 'Retreat mode', description: 'Reflection-forward', time: '20–30 min' },
  { id: 'targeted', label: 'Targeted review', description: 'One to four pillars', time: '5–12 min' }
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

export const COMMITMENT_MOVES = [
  { id: 'carry', label: 'Carry', description: 'A meaningful burden I will keep practicing' },
  { id: 'release', label: 'Release', description: 'A load or pattern I will put down' },
  { id: 'serve', label: 'Serve', description: 'Bounded contribution that helps without self-erasure' },
  { id: 'recover', label: 'Recover', description: 'Rest or restoration that protects capacity' }
];

export const LIFE_STAGE_OPTIONS = [
  'Young adult',
  'Building a career',
  'Partnership / family building',
  'Raising children',
  'Midlife transition',
  'Leadership season',
  'Caregiving for others',
  'Career transition',
  'Later-life contribution',
  'General reflection',
  'Other',
  'Prefer not to answer'
];

export const CURRENT_GOAL_OPTIONS = [
  'Clarify what is worth carrying',
  'Build sustainable capacity',
  'Stop glorifying overwork',
  'Strengthen discipline with recovery',
  'Own responsibility with boundaries',
  'Deepen service without martyrdom',
  'Choose healthier challenge',
  'Build legacy through present character',
  'Create a Meaningful Commitment Plan',
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
  'personal-fulfillment': 'Personal Fulfillment Assessment',
  'values-alignment': 'Values Alignment Assessment',
  'athlete-readiness': 'Athlete Performance Readiness',
  'digital-wellness': 'Digital Wellness Assessment',
  'relationship-health': 'Relationship Health Assessment',
  'marriage-alignment': 'Marriage Alignment Assessment',
  'parenting-confidence': 'Parenting Confidence Assessment',
  'teen-wellbeing': 'Well-Being Assessment'
};
