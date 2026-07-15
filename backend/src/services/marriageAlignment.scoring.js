/**
 * Marriage Alignment scoring — pure functions, no DB.
 * Current Alignment = perceived present alignment.
 * Desired Emphasis = preferred future attention.
 * Does not measure love, compatibility, commitment, or divorce risk.
 */

export function calculateIndividualMarriageAlignmentIndex(scores) {
  const completed = (scores || []).filter(
    (s) => s != null && Number.isFinite(Number(s))
  );
  if (!completed.length) return null;
  return Math.round(
    (completed.reduce((a, b) => a + Number(b), 0) / completed.length) * 10
  );
}

export function calculateMarriageAlignmentIndex(domainAverages) {
  return calculateIndividualMarriageAlignmentIndex(domainAverages);
}

export function calculateCoupleCurrentAlignmentAverage(a, b) {
  return Number(((Number(a) + Number(b)) / 2).toFixed(1));
}

export function calculateCurrentPerceptionGap(a, b) {
  return Number(Math.abs(Number(a) - Number(b)).toFixed(1));
}

export function calculateSharedDesiredEmphasis(a, b) {
  return Number(((Number(a) + Number(b)) / 2).toFixed(1));
}

export function calculateDesiredEmphasisGap(a, b) {
  return Number(Math.abs(Number(a) - Number(b)).toFixed(1));
}

export function calculateSharedCollaborationConfidence(a, b) {
  if (a == null || b == null) return null;
  return Number(((Number(a) + Number(b)) / 2).toFixed(1));
}

export function calculateSharedDirectionIndex(desiredEmphasisGaps) {
  const completed = (desiredEmphasisGaps || []).filter(
    (g) => g != null && Number.isFinite(Number(g))
  );
  if (!completed.length) return null;
  const averageGap =
    completed.reduce((sum, g) => sum + Number(g), 0) / completed.length;
  return Math.max(0, Math.round(100 - averageGap * 10));
}

export function calculateMarriageAlignmentOpportunityScore(
  coupleCurrentAlignment,
  sharedDesiredEmphasis,
  currentPerceptionGap,
  desiredEmphasisGap
) {
  const currentAlignmentGap = 10 - Number(coupleCurrentAlignment);
  return Number(
    (
      currentAlignmentGap * 0.45 +
      Number(sharedDesiredEmphasis) * 0.3 +
      Number(currentPerceptionGap) * 0.15 +
      Number(desiredEmphasisGap) * 0.1
    ).toFixed(2)
  );
}

export function marriageAlignmentIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Several Significant Alignment Concerns';
  if (s <= 54) return 'Limited Current Alignment';
  if (s <= 69) return 'Mixed Current Alignment';
  if (s <= 84) return 'Generally Aligned';
  return 'Strong Current Alignment';
}

export function sharedDirectionIndexLabel(score) {
  if (score == null || !Number.isFinite(Number(score))) return null;
  const s = Number(score);
  if (s <= 39) return 'Quite Different Priorities';
  if (s <= 54) return 'Mixed Future Priorities';
  if (s <= 69) return 'Moderately Similar Priorities';
  if (s <= 84) return 'Generally Similar Priorities';
  return 'Closely Shared Priorities';
}

export function currentPerceptionGapLabel(gap) {
  if (gap == null) return null;
  if (gap <= 0.9) return 'Similar Current View';
  if (gap <= 1.9) return 'Mild Perception Difference';
  if (gap <= 3.4) return 'Different Current Experiences';
  if (gap <= 4.9) return 'Meaningful Perception Gap';
  return 'Substantial Perception Gap';
}

export function currentPerceptionGapKey(gap) {
  if (gap == null) return null;
  if (gap <= 0.9) return 'similar-current-view';
  if (gap <= 1.9) return 'mild-perception-difference';
  if (gap <= 3.4) return 'different-current-experiences';
  if (gap <= 4.9) return 'meaningful-perception-gap';
  return 'substantial-perception-gap';
}

export function desiredEmphasisGapLabel(gap) {
  if (gap == null) return null;
  if (gap <= 0.9) return 'Closely Shared Priority';
  if (gap <= 1.9) return 'Generally Similar Emphasis';
  if (gap <= 3.4) return 'Different Levels of Emphasis';
  if (gap <= 4.9) return 'Meaningful Priority Difference';
  return 'Substantial Priority Difference';
}

export function desiredEmphasisGapKey(gap) {
  if (gap == null) return null;
  if (gap <= 0.9) return 'closely-shared-priority';
  if (gap <= 1.9) return 'generally-similar-emphasis';
  if (gap <= 3.4) return 'different-levels-of-emphasis';
  if (gap <= 4.9) return 'meaningful-priority-difference';
  return 'substantial-priority-difference';
}

export function interpretIndividualAlignment(score, label) {
  if (score == null) return '';
  const s = Number(score);
  if (s <= 3) {
    return `Your responses suggest ${label} may currently feel misaligned. The difference may reflect expectations, experiences, timing, roles, or communication.`;
  }
  if (s <= 5) {
    return `${label} appears partially aligned from your perspective. This area may benefit from greater clarity.`;
  }
  if (s <= 7) {
    return `${label} appears generally aligned from your perspective. Alignment does not require identical preferences.`;
  }
  return `${label} appears strongly aligned from your perspective.`;
}

export function matrixQuadrant(coupleAlignment, sharedEmphasis) {
  if (coupleAlignment == null || sharedEmphasis == null) return null;
  const highA = Number(coupleAlignment) >= 7;
  const highE = Number(sharedEmphasis) >= 7;
  if (highA && highE) return 'protect-and-celebrate';
  if (!highA && highE) return 'shared-growth-priorities';
  if (highA && !highE) return 'stable-lower-priority';
  return 'seasonal-or-optional';
}

export const MATRIX_QUADRANT_LABELS = {
  'protect-and-celebrate': 'Protect and Celebrate',
  'shared-growth-priorities': 'Shared Growth Priorities',
  'stable-lower-priority': 'Stable but Lower Priority',
  'seasonal-or-optional': 'Seasonal or Optional Areas'
};

export const ALIGNMENT_SYSTEMS = {
  'shared-direction': {
    id: 'shared-direction',
    label: 'Shared Direction',
    keys: ['goals', 'faith', 'growth']
  },
  'home-and-responsibility': {
    id: 'home-and-responsibility',
    label: 'Home and Responsibility',
    keys: ['parenting', 'household', 'money']
  },
  'connection-and-partnership': {
    id: 'connection-and-partnership',
    label: 'Connection and Partnership',
    keys: ['time_together', 'romance']
  },
  'vitality-and-experience': {
    id: 'vitality-and-experience',
    label: 'Vitality and Experience',
    keys: ['health', 'adventure']
  }
};

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export function domainsForMode(template, mode = 'full', participantVersion = 'general') {
  return (template?.domains || []).filter((d) => {
    const versions = d.availableVersions || d.participantVersions || [];
    if (
      versions.length &&
      participantVersion &&
      participantVersion !== 'custom' &&
      !versions.includes(participantVersion)
    ) {
      return false;
    }
    const modes = d.availableModes || ['full'];
    if (modes.length && !modes.includes(mode)) return false;
    return d.isActive !== false;
  });
}

function classifySharedStatus(aCurrent, bCurrent, aDesired, bDesired, perceptionGap, desiredGap) {
  const coupleAvg = calculateCoupleCurrentAlignmentAverage(aCurrent, bCurrent);
  const sharedDesired = calculateSharedDesiredEmphasis(aDesired, bDesired);

  if (aCurrent >= 8 && bCurrent >= 8 && perceptionGap < 2 && sharedDesired >= 7) {
    return 'shared-strength';
  }
  if (coupleAvg >= 8 && sharedDesired >= 8) return 'protected-strength';
  if (coupleAvg <= 5 && sharedDesired >= 8 && desiredGap < 2) return 'shared-growth-priority';
  if (perceptionGap >= 3) return 'different-current-experiences';
  if (desiredGap >= 3) return 'different-future-priorities';
  if (coupleAvg >= 7 && sharedDesired <= 5) return 'aligned-lower-priority';
  if (aDesired <= 4 && bDesired <= 4) return 'shared-lower-priority';
  return 'mixed';
}

export function buildDeterministicInsights(comparisons) {
  const byKey = Object.fromEntries((comparisons || []).map((c) => [c.domainKey, c]));
  const insights = [];
  const g = (k) => byKey[k];

  if (g('goals') && g('goals').partnerACurrent >= 8 && g('goals').partnerBCurrent >= 8 && g('goals').desiredEmphasisGap < 2) {
    insights.push('Both partners report strong alignment around goals and similar expectations for future attention.');
  }
  if (g('goals') && g('goals').currentPerceptionGap >= 3) {
    insights.push('You currently see your shared goals differently. A useful first step may be listing the goals each partner believes the marriage is already pursuing.');
  }
  if (g('parenting') && g('parenting').coupleCurrentAlignmentAverage <= 5 && (g('parenting').partnerADesired ?? 0) >= 8 && (g('parenting').partnerBDesired ?? 0) >= 8) {
    insights.push('Both partners want stronger parenting alignment. Clarifying one responsibility or expectation may be more useful than trying to solve every parenting difference at once.');
  }
  if (g('household') && g('household').currentPerceptionGap >= 3) {
    insights.push('You report meaningfully different experiences of household alignment. Invisible planning, standards, or workload may be contributing to the difference.');
  }
  if (
    g('household') &&
    g('household').partnerACurrent <= 5 &&
    g('household').partnerBCurrent <= 5 &&
    (g('household').partnerADesired ?? 0) >= 8 &&
    (g('household').partnerBDesired ?? 0) >= 8
  ) {
    insights.push('Both partners want household responsibilities to become clearer and more aligned. A responsibility and mental-load review may be useful.');
  }
  if (
    g('time_together') &&
    (g('time_together').partnerADesired ?? 0) >= 8 &&
    (g('time_together').partnerBDesired ?? 0) >= 8 &&
    g('time_together').coupleCurrentAlignmentAverage <= 6
  ) {
    insights.push('Both partners want time together to receive greater attention, but the current pattern does not yet feel fully aligned.');
  }
  if (g('time_together') && g('time_together').desiredEmphasisGap >= 3) {
    insights.push('You want different amounts or types of time together. Clarifying what counts as meaningful connection for each partner may reduce assumptions.');
  }
  if (g('romance') && g('romance').currentPerceptionGap >= 3) {
    insights.push('You currently experience romantic alignment differently. Discussing affection, emotional closeness, expectations, consent, and pressure may help clarify the difference.');
  }
  if (g('faith') && g('faith').coupleCurrentAlignmentAverage >= 7 && g('faith').desiredEmphasisGap >= 3) {
    insights.push('Your current faith or spiritual arrangement feels relatively aligned, but you want different levels of future emphasis.');
  }
  if (g('money') && g('money').coupleCurrentAlignmentAverage <= 5 && g('money').sharedDesiredEmphasis >= 8) {
    insights.push('Financial alignment is important to both partners and currently feels limited. Clarifying information, responsibilities, and goals may be a useful starting point.');
  }
  if (g('money') && g('money').currentPerceptionGap >= 3) {
    insights.push('You experience financial alignment differently. Begin with shared facts and role clarity rather than debating whose rating is correct.');
  }
  if (g('health') && g('health').desiredEmphasisGap >= 3) {
    insights.push('You want different levels of focus on health during the next season. Clarifying whether the goal is shared routines, individual support, or reduced pressure may help.');
  }
  if (g('adventure') && g('adventure').desiredEmphasisGap >= 3) {
    insights.push('Adventure carries different levels of importance for each partner. The difference may involve cost, energy, planning style, risk, or competing responsibilities.');
  }
  if (
    g('growth') &&
    g('growth').partnerACurrent >= 8 &&
    g('growth').partnerBCurrent >= 8 &&
    (g('growth').partnerADesired ?? 0) >= 8 &&
    (g('growth').partnerBDesired ?? 0) >= 8
  ) {
    insights.push('Both partners report strong support for personal and relationship growth.');
  }
  if (g('growth') && g('growth').desiredEmphasisGap >= 3) {
    insights.push('One partner wants greater emphasis on change or development. The other may currently prioritize stability, recovery, or another responsibility.');
  }
  if ((comparisons || []).filter((c) => c.sharedStatus === 'shared-growth-priority').length >= 4) {
    insights.push('Several important areas deserve attention. Selecting one or two priorities may create more progress than attempting to change every domain simultaneously.');
  }

  return [...new Set(insights)].slice(0, 8);
}

export function buildIndividualSummary(template, responses, mode = 'full', participantVersion = 'general') {
  const domains = domainsForMode(template, mode, participantVersion);
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));
  const scored = [];

  for (const d of domains) {
    const r = byKey[d.key];
    if (!r || r.isNotRelevant || r.preferNotToAnswer) continue;
    const current = r.currentAlignmentScore ?? null;
    if (current == null) continue;
    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      currentAlignmentScore: Number(current),
      desiredEmphasisScore: r.desiredEmphasisScore ?? null,
      collaborationConfidenceScore: r.collaborationConfidenceScore ?? null,
      interpretation: interpretIndividualAlignment(current, d.label),
      reflectionChips: r.reflectionChips || []
    });
  }

  const index = calculateIndividualMarriageAlignmentIndex(
    scored.map((x) => x.currentAlignmentScore)
  );
  const byCurrent = [...scored].sort((a, b) => b.currentAlignmentScore - a.currentAlignmentScore);
  const byDesired = [...scored]
    .filter((x) => x.desiredEmphasisScore != null)
    .sort((a, b) => b.desiredEmphasisScore - a.desiredEmphasisScore);

  return {
    individualMarriageAlignmentIndex: index,
    individualStatus: marriageAlignmentIndexLabel(index),
    highestCurrent: byCurrent.slice(0, 3),
    highestDesired: byDesired.slice(0, 3),
    possiblePriorities: scored
      .filter((x) => (x.desiredEmphasisScore ?? 0) >= 8 && x.currentAlignmentScore <= 5)
      .slice(0, 3),
    scoredCount: scored.length,
    domainCount: domains.filter((d) => !(byKey[d.key]?.isNotRelevant)).length,
    domains: scored
  };
}

export function buildComparison(
  template,
  partnerAResponses,
  partnerBResponses,
  { mode = 'full', participantVersion = 'general' } = {}
) {
  const domains = domainsForMode(template, mode, participantVersion);
  const aMap = Object.fromEntries((partnerAResponses || []).map((r) => [r.domainKey, r]));
  const bMap = Object.fromEntries((partnerBResponses || []).map((r) => [r.domainKey, r]));

  const comparisons = [];
  const domainAverages = [];
  const desiredGaps = [];

  for (const d of domains) {
    const a = aMap[d.key];
    const b = bMap[d.key];
    if (a?.isNotRelevant || b?.isNotRelevant || a?.preferNotToAnswer || b?.preferNotToAnswer) {
      continue;
    }
    const aCurrent = a?.currentAlignmentScore ?? null;
    const bCurrent = b?.currentAlignmentScore ?? null;
    const aDesired = a?.desiredEmphasisScore ?? null;
    const bDesired = b?.desiredEmphasisScore ?? null;
    if (aCurrent == null || bCurrent == null || aDesired == null || bDesired == null) continue;

    const coupleAvg = calculateCoupleCurrentAlignmentAverage(aCurrent, bCurrent);
    const perceptionGap = calculateCurrentPerceptionGap(aCurrent, bCurrent);
    const sharedDesired = calculateSharedDesiredEmphasis(aDesired, bDesired);
    const desiredGap = calculateDesiredEmphasisGap(aDesired, bDesired);
    const opportunity = calculateMarriageAlignmentOpportunityScore(
      coupleAvg,
      sharedDesired,
      perceptionGap,
      desiredGap
    );
    const sharedStatus = classifySharedStatus(
      aCurrent,
      bCurrent,
      aDesired,
      bDesired,
      perceptionGap,
      desiredGap
    );
    const quadrant = matrixQuadrant(coupleAvg, sharedDesired);

    comparisons.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      system: d.alignmentSystem,
      partnerACurrent: aCurrent,
      partnerBCurrent: bCurrent,
      coupleCurrentAlignmentAverage: coupleAvg,
      currentPerceptionGap: perceptionGap,
      partnerADesired: aDesired,
      partnerBDesired: bDesired,
      sharedDesiredEmphasis: sharedDesired,
      desiredEmphasisGap: desiredGap,
      partnerAConfidence: a?.collaborationConfidenceScore ?? null,
      partnerBConfidence: b?.collaborationConfidenceScore ?? null,
      sharedCollaborationConfidence: calculateSharedCollaborationConfidence(
        a?.collaborationConfidenceScore,
        b?.collaborationConfidenceScore
      ),
      opportunityScore: opportunity,
      currentGapStatus: currentPerceptionGapKey(perceptionGap),
      currentGapStatusLabel: currentPerceptionGapLabel(perceptionGap),
      desiredGapStatus: desiredEmphasisGapKey(desiredGap),
      desiredGapStatusLabel: desiredEmphasisGapLabel(desiredGap),
      sharedStatus,
      quadrant,
      quadrantLabel: quadrant ? MATRIX_QUADRANT_LABELS[quadrant] : null,
      conversationPrompts: d.conversationPrompts || [],
      partnerASharedNote:
        a?.noteVisibility === 'share-after-both-submit' ||
        a?.noteVisibility === 'partner-and-professional'
          ? a?.sharedNote || ''
          : '',
      partnerBSharedNote:
        b?.noteVisibility === 'share-after-both-submit' ||
        b?.noteVisibility === 'partner-and-professional'
          ? b?.sharedNote || ''
          : ''
    });
    domainAverages.push(coupleAvg);
    desiredGaps.push(desiredGap);
  }

  const marriageAlignmentIndex = calculateMarriageAlignmentIndex(domainAverages);
  const sharedDirectionIndex = calculateSharedDirectionIndex(desiredGaps);
  const insights = buildDeterministicInsights(comparisons);

  const systemScores = {
    sharedDirection: avgScores(
      ALIGNMENT_SYSTEMS['shared-direction'].keys.map(
        (k) => comparisons.find((c) => c.domainKey === k)?.coupleCurrentAlignmentAverage
      )
    ),
    homeAndResponsibility: avgScores(
      ALIGNMENT_SYSTEMS['home-and-responsibility'].keys.map(
        (k) => comparisons.find((c) => c.domainKey === k)?.coupleCurrentAlignmentAverage
      )
    ),
    connectionAndPartnership: avgScores(
      ALIGNMENT_SYSTEMS['connection-and-partnership'].keys.map(
        (k) => comparisons.find((c) => c.domainKey === k)?.coupleCurrentAlignmentAverage
      )
    ),
    vitalityAndExperience: avgScores(
      ALIGNMENT_SYSTEMS['vitality-and-experience'].keys.map(
        (k) => comparisons.find((c) => c.domainKey === k)?.coupleCurrentAlignmentAverage
      )
    )
  };

  return {
    marriageAlignmentIndex,
    marriageAlignmentStatus: marriageAlignmentIndexLabel(marriageAlignmentIndex),
    sharedDirectionIndex,
    sharedDirectionStatus: sharedDirectionIndexLabel(sharedDirectionIndex),
    systemScores,
    comparisons,
    sharedStrengths: comparisons.filter((c) => c.sharedStatus === 'shared-strength'),
    protectedStrengths: comparisons.filter((c) => c.sharedStatus === 'protected-strength'),
    sharedGrowthPriorities: comparisons.filter((c) => c.sharedStatus === 'shared-growth-priority'),
    differentCurrentExperiences: comparisons.filter(
      (c) => c.sharedStatus === 'different-current-experiences' || c.currentPerceptionGap >= 3
    ),
    differentFuturePriorities: comparisons.filter(
      (c) => c.sharedStatus === 'different-future-priorities' || c.desiredEmphasisGap >= 3
    ),
    insights,
    indexClarification:
      template?.settings?.indexClarification ||
      'The Marriage Alignment Index summarizes how aligned both partners currently perceive the marriage to be. It does not measure love, compatibility, commitment, or the future of the marriage.',
    directionClarification:
      template?.settings?.directionClarification ||
      'The Shared Direction Index measures similarity in preferred emphasis. It does not require identical preferences.',
    matrixClarification: 'A lower-priority domain does not automatically need improvement.'
  };
}

export const MODE_OPTIONS = [
  { id: 'full', label: 'Full Marriage Alignment', time: '15–22 min each' },
  { id: 'quick', label: 'Quick check-in', time: '5–8 min each' },
  { id: 'annual-review', label: 'Annual marriage planning review', time: '20–30 min each' },
  { id: 'life-transition', label: 'Life transition review', time: '12–18 min each' },
  { id: 'premarital', label: 'Premarital alignment review', time: '15–22 min each' },
  { id: 'targeted', label: 'Targeted alignment review', time: '5–10 min each' }
];

export const VERSION_OPTIONS = [
  { id: 'general', label: 'General marriage' },
  { id: 'newlywed', label: 'Newlywed' },
  { id: 'premarital', label: 'Premarital' },
  { id: 'parents-young-children', label: 'Parents of young children' },
  { id: 'blended-family', label: 'Blended family' },
  { id: 'empty-nest', label: 'Empty nest' },
  { id: 'retirement', label: 'Retirement' },
  { id: 'counseling', label: 'Counseling' },
  { id: 'faith-based', label: 'Faith-based' }
];

export const SUPPORT_PREFERENCE_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'self-guided-resource', label: 'Self-guided resource' },
  { id: 'conversation-guide', label: 'Conversation guide' },
  { id: 'relationship-coach', label: 'Relationship coach' },
  { id: 'couples-counselor', label: 'Couples counselor' },
  { id: 'pastor', label: 'Pastor or spiritual leader' },
  { id: 'financial-professional', label: 'Financial professional' },
  { id: 'health-professional', label: 'Health professional' },
  { id: 'private-follow-up', label: 'Private follow-up' },
  { id: 'unsure', label: 'I am unsure' }
];

export const NOTE_VISIBILITY_OPTIONS = [
  { id: 'private', label: 'Private to me' },
  { id: 'share-after-both-submit', label: 'Share after both partners submit' },
  { id: 'professional-only', label: 'Share with professional only' },
  { id: 'partner-and-professional', label: 'Share with partner and professional' },
  { id: 'discussion-prompt-only', label: 'Convert to discussion prompt only' },
  { id: 'do-not-save', label: 'Do not save this note' }
];
