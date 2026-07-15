/**
 * Pure Relationship Health scoring & comparison (no DB).
 */

export function calculateIndividualRelationshipIndex(scores) {
  const completed = (scores || []).filter((s) => s != null && Number.isFinite(Number(s))).map(Number);
  if (!completed.length) return null;
  return Math.round((completed.reduce((a, b) => a + b, 0) / completed.length) * 10);
}

export function calculateCoupleRelationshipIndex(domainAverages) {
  return calculateIndividualRelationshipIndex(domainAverages);
}

export function calculatePartnerDifference(a, b) {
  return Math.abs(Number(a) - Number(b));
}

export function calculateSignedPartnerDifference(a, b) {
  return Number((Number(a) - Number(b)).toFixed(1));
}

export function calculateCoupleDomainAverage(a, b) {
  return Number(((Number(a) + Number(b)) / 2).toFixed(1));
}

export function calculateSharedImportance(a, b) {
  if (a == null || b == null) return null;
  return Number(((Number(a) + Number(b)) / 2).toFixed(1));
}

export function calculateRelationshipOpportunityScore(coupleAverage, sharedImportance, partnerDifference) {
  const currentGap = 11 - Number(coupleAverage);
  const imp = sharedImportance == null ? 5 : Number(sharedImportance);
  const diff = Number(partnerDifference) || 0;
  return Number((currentGap * 0.5 + imp * 0.3 + diff * 0.2).toFixed(1));
}

export function differenceStatusLabel(diff) {
  if (diff == null) return null;
  if (diff <= 0.9) return 'Closely Aligned';
  if (diff <= 1.9) return 'Slight Difference';
  if (diff <= 3.4) return 'Different Experiences';
  if (diff <= 4.9) return 'Meaningful Perception Gap';
  return 'Significant Perception Gap';
}

export function differenceStatusKey(diff) {
  if (diff == null) return null;
  if (diff <= 0.9) return 'closely-aligned';
  if (diff <= 1.9) return 'slight-difference';
  if (diff <= 3.4) return 'different-experiences';
  if (diff <= 4.9) return 'meaningful-perception-gap';
  return 'significant-perception-gap';
}

export function relationshipStatusLabel(score) {
  if (score == null) return null;
  if (score <= 39) return 'Significant Concerns Reported';
  if (score <= 54) return 'Relationship Under Strain';
  if (score <= 69) return 'Mixed Relationship Experience';
  if (score <= 84) return 'Positive Relationship Foundation';
  return 'Strongly Positive Shared Experience';
}

export function domainsForMode(template, mode = 'full') {
  return (template?.domains || []).filter((d) => {
    const modes = d.availableModes || ['full'];
    return !modes.length || modes.includes(mode);
  });
}

function scoreOf(response) {
  if (!response || response.isNotApplicable) return null;
  return response.currentExperienceScore ?? null;
}

export function buildIndividualSummary(template, responses, mode = 'full') {
  const domains = domainsForMode(template, mode);
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));
  const scores = [];
  const scored = [];

  for (const d of domains) {
    const r = byKey[d.key];
    const score = scoreOf(r);
    if (score == null) continue;
    scores.push(score);
    scored.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      score,
      importanceScore: r?.importanceScore ?? null,
      desiredExperienceScore: r?.desiredExperienceScore ?? null,
      reflectionChips: r?.reflectionChips || [],
      conversationPrompts: d.conversationPrompts || []
    });
  }

  scored.sort((a, b) => b.score - a.score);
  const index = calculateIndividualRelationshipIndex(scores);

  return {
    individualRelationshipIndex: index,
    individualStatus: relationshipStatusLabel(index),
    strongest: scored.slice(0, 3),
    concerns: [...scored].sort((a, b) => a.score - b.score).slice(0, 3),
    scoredCount: scored.length,
    domainCount: domains.filter((d) => !(byKey[d.key]?.isNotApplicable)).length
  };
}

export function buildComparison(template, partnerAResponses, partnerBResponses, mode = 'full') {
  const domains = domainsForMode(template, mode);
  const aMap = Object.fromEntries((partnerAResponses || []).map((r) => [r.domainKey, r]));
  const bMap = Object.fromEntries((partnerBResponses || []).map((r) => [r.domainKey, r]));

  const comparisons = [];
  const domainAverages = [];
  const insights = [];

  for (const d of domains) {
    const a = aMap[d.key];
    const b = bMap[d.key];
    if (a?.isNotApplicable || b?.isNotApplicable) continue;
    const aScore = scoreOf(a);
    const bScore = scoreOf(b);
    if (aScore == null || bScore == null) continue;

    const absDiff = calculatePartnerDifference(aScore, bScore);
    const coupleAverage = calculateCoupleDomainAverage(aScore, bScore);
    const sharedImportance = calculateSharedImportance(a?.importanceScore, b?.importanceScore);
    const opportunityScore = calculateRelationshipOpportunityScore(
      coupleAverage,
      sharedImportance,
      absDiff
    );

    let sharedStatus = 'mixed';
    if (aScore >= 8 && bScore >= 8 && absDiff < 2) sharedStatus = 'shared-strength';
    else if (aScore >= 7 && bScore >= 7 && absDiff < 2) sharedStatus = 'stable-shared-area';
    else if (aScore <= 5 && bScore <= 5) sharedStatus = 'shared-concern';
    else if (absDiff >= 3) sharedStatus = 'perception-gap';

    comparisons.push({
      domainKey: d.key,
      label: d.label,
      shortLabel: d.shortLabel,
      color: d.color,
      partnerAScore: aScore,
      partnerBScore: bScore,
      partnerAImportance: a?.importanceScore ?? null,
      partnerBImportance: b?.importanceScore ?? null,
      partnerADesiredScore: a?.desiredExperienceScore ?? null,
      partnerBDesiredScore: b?.desiredExperienceScore ?? null,
      coupleAverage,
      absoluteDifference: absDiff,
      signedDifference: calculateSignedPartnerDifference(aScore, bScore),
      sharedImportance,
      opportunityScore,
      differenceStatus: differenceStatusKey(absDiff),
      differenceStatusLabel: differenceStatusLabel(absDiff),
      sharedStatus,
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
    domainAverages.push(coupleAverage);
  }

  const sharedStrengths = comparisons.filter((c) => c.sharedStatus === 'shared-strength');
  const sharedConcerns = comparisons.filter((c) => c.sharedStatus === 'shared-concern');
  const perceptionGaps = comparisons.filter((c) => c.absoluteDifference >= 3);
  const coupleIndex = calculateCoupleRelationshipIndex(domainAverages);

  // Deterministic insights
  const byKey = Object.fromEntries(comparisons.map((c) => [c.domainKey, c]));
  const comm = byKey.communication;
  const trust = byKey.trust;
  const friendship = byKey.friendship;
  const intimacy = byKey.intimacy;
  const teamwork = byKey.teamwork;
  const appreciation = byKey.appreciation;
  const conflict = byKey.conflict;
  const parenting = byKey.parenting;
  const finances = byKey.finances;
  const vision = byKey.shared_vision;

  if (comm && comm.partnerAScore >= 8 && comm.partnerBScore >= 8 && comm.absoluteDifference < 2) {
    insights.push({
      key: 'comm_strength',
      message: 'Both partners describe communication as a current relationship strength.'
    });
  }
  if (comm && comm.absoluteDifference >= 3) {
    insights.push({
      key: 'comm_gap',
      message:
        'You currently experience communication differently. Before choosing solutions, each partner may benefit from describing what effective communication looks and feels like to them.'
    });
  }
  if (trust && trust.partnerAScore <= 5 && trust.partnerBScore <= 5) {
    insights.push({
      key: 'trust_shared',
      message:
        'Both partners report concerns related to trust. A slower, structured conversation or professional support may be useful.'
    });
  }
  if (
    appreciation &&
    ((appreciation.partnerAScore >= 8 && appreciation.partnerBScore <= 5) ||
      (appreciation.partnerBScore >= 8 && appreciation.partnerAScore <= 5))
  ) {
    insights.push({
      key: 'appreciation_gap',
      message:
        'One partner experiences appreciation more positively than the other. Discussing how each partner recognizes and receives appreciation may help clarify the difference.'
    });
  }
  if (
    friendship &&
    intimacy &&
    friendship.partnerAScore >= 7 &&
    friendship.partnerBScore >= 7 &&
    intimacy.coupleAverage <= 5
  ) {
    insights.push({
      key: 'friendship_intimacy',
      message:
        'The friendship appears to be a positive foundation, while emotional or physical closeness may need more intentional attention.'
    });
  }
  if (teamwork && appreciation && teamwork.coupleAverage >= 7 && appreciation.coupleAverage <= 5) {
    insights.push({
      key: 'teamwork_appreciation',
      message:
        'The relationship appears to function effectively as a team, but one or both partners may not consistently feel noticed or valued.'
    });
  }
  if (comm && conflict && comm.coupleAverage <= 5 && conflict.coupleAverage <= 5) {
    insights.push({
      key: 'comm_conflict',
      message:
        'Communication and conflict patterns may be reinforcing one another. A structured pause, listening, and repair process may be worth developing.'
    });
  }
  if (parenting && parenting.absoluteDifference >= 3) {
    insights.push({
      key: 'parenting_gap',
      message:
        'You currently experience parenting teamwork differently. Clarifying responsibilities, expectations, and support needs may be useful.'
    });
  }
  if (finances && finances.absoluteDifference >= 3) {
    insights.push({
      key: 'finances_gap',
      message:
        'You currently experience financial collaboration differently. Begin by comparing expectations and responsibilities rather than debating which score is accurate.'
    });
  }
  if (vision && vision.partnerAScore >= 8 && vision.partnerBScore >= 8) {
    insights.push({
      key: 'vision_strength',
      message:
        'Both partners report a strong sense of alignment about the future you are building together.'
    });
  }
  if (vision && vision.partnerAScore <= 5 && vision.partnerBScore <= 5) {
    insights.push({
      key: 'vision_concern',
      message:
        'Both partners report uncertainty or limited alignment regarding the future. A structured shared-vision conversation may be a useful priority.'
    });
  }

  for (const c of perceptionGaps) {
    if (!insights.some((i) => i.key === `gap_${c.domainKey}`)) {
      insights.push({
        key: `gap_${c.domainKey}`,
        message: `${c.label}: you reported meaningfully different experiences. The difference may be worth discussing with curiosity before attempting to solve it.`
      });
    }
  }

  return {
    coupleRelationshipIndex: coupleIndex,
    coupleStatus: relationshipStatusLabel(coupleIndex),
    comparisons,
    sharedStrengths,
    sharedConcerns,
    perceptionGaps,
    insights,
    disclaimer:
      'The Relationship Health Index summarizes current self-reported experiences. It does not determine compatibility, predict the future, or assign responsibility.'
  };
}
