/**
 * Pure College Readiness scoring (no DB).
 */

export const LAUNCH_STAGES = [
  { key: 'explore', label: 'Explore' },
  { key: 'prepare', label: 'Prepare' },
  { key: 'apply', label: 'Apply' },
  { key: 'enroll', label: 'Enroll' },
  { key: 'transition', label: 'Transition' },
  { key: 'launch', label: 'Launch' }
];

export function calculateCollegeReadinessScore(scores) {
  const completed = (scores || []).filter((s) => s != null && Number.isFinite(Number(s))).map(Number);
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + score, 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateWeightedCollegeReadinessScore(values) {
  const list = (values || []).filter(
    (i) => i && Number.isFinite(Number(i.score)) && Number.isFinite(Number(i.weight)) && Number(i.weight) > 0
  );
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!totalWeight) return null;
  const weightedTotal = list.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return Math.round((weightedTotal / totalWeight) * 10);
}

export function calculateCollegeConfidenceGap(readinessScore, confidenceScore) {
  const r = Number(readinessScore);
  const c = Number(confidenceScore);
  if (!Number.isFinite(r) || !Number.isFinite(c)) return null;
  return r - c;
}

export function calculateCollegeSupportGap(readinessScore, supportScore) {
  const r = Number(readinessScore);
  const s = Number(supportScore);
  if (!Number.isFinite(r) || !Number.isFinite(s)) return null;
  return r - s;
}

export function collegeReadinessStatusLabel(score) {
  if (score == null) return null;
  if (score <= 39) return 'Significant Preparation Needed';
  if (score <= 54) return 'Building Foundations';
  if (score <= 69) return 'Developing Readiness';
  if (score <= 84) return 'Building Strong Readiness';
  return 'Strong Readiness';
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export function domainsForContext(template, { mode = 'full', studentVersion = 'senior' } = {}) {
  return (template?.domains || []).filter((d) => {
    const versions = d.studentVersions || [];
    if (versions.length && studentVersion && !versions.includes(studentVersion)) return false;
    if (d.isOptional && Number(d.weight) <= 0) return false;
    const modes = d.availableModes || ['full'];
    if (modes.length && !modes.includes(mode)) return false;
    return true;
  });
}

export function buildSummary(template, responses, { mode = 'full', studentVersion = 'senior' } = {}) {
  const domains = domainsForContext(template, { mode, studentVersion });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scoreList = [];
  const weighted = [];
  for (const d of domains) {
    const score = byKey[d.key]?.readinessScore;
    if (score == null) continue;
    scoreList.push(score);
    if (Number(d.weight) > 0) weighted.push({ score, weight: Number(d.weight) });
  }

  const collegeReadinessScore =
    weighted.length > 0
      ? calculateWeightedCollegeReadinessScore(weighted)
      : calculateCollegeReadinessScore(scoreList);

  const systemOf = (keys) =>
    avgScores(keys.map((k) => byKey[k]?.readinessScore).filter((s) => s != null));

  const systemScores = {
    academic: systemOf(['academic_foundations', 'study_strategies', 'time_management']),
    independence: systemOf(['self_advocacy', 'independent_living', 'systems_navigation']),
    planning: systemOf(['application_enrollment', 'career_direction']),
    financial: systemOf(['financial_readiness']),
    transition: systemOf(['social_emotional', 'support_network', 'motivation_confidence'])
  };

  const stageProgress = {};
  for (const stage of LAUNCH_STAGES) {
    const stageDomains = domains.filter((d) => d.launchStage === stage.key);
    const done = stageDomains.filter((d) => byKey[d.key]?.readinessScore != null).length;
    stageProgress[stage.key] = {
      total: stageDomains.length,
      completed: done,
      illuminated: stageDomains.length > 0 && done === stageDomains.length
    };
  }

  const scored = domains
    .map((d) => {
      const r = byKey[d.key];
      if (!r || r.readinessScore == null) return null;
      return {
        domainKey: d.key,
        label: d.label,
        shortLabel: d.shortLabel,
        color: d.color,
        system: d.launchSystem,
        stage: d.launchStage,
        readinessScore: r.readinessScore,
        confidenceScore: r.confidenceScore ?? null,
        supportAvailabilityScore: r.supportAvailabilityScore ?? null,
        confidenceGap: calculateCollegeConfidenceGap(r.readinessScore, r.confidenceScore),
        supportGap: calculateCollegeSupportGap(r.readinessScore, r.supportAvailabilityScore),
        supportPreference: r.supportPreference || 'none',
        reflectionChips: r.reflectionChips || [],
        checklistSuggestions: d.checklistSuggestions || []
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.readinessScore - a.readinessScore);

  const strengths = scored.filter((s) => s.readinessScore >= 8);
  const strongest = scored.slice(0, 3);
  const needingSupport = [...scored]
    .sort((a, b) => a.readinessScore - b.readinessScore)
    .slice(0, 3);

  const indicators = [];
  const academic = byKey.academic_foundations?.readinessScore;
  const timeMgmt = byKey.time_management?.readinessScore;
  const motivation = byKey.motivation_confidence?.readinessScore;
  const application = byKey.application_enrollment?.readinessScore;
  const living = byKey.independent_living?.readinessScore;
  const systems = byKey.systems_navigation?.readinessScore;
  const supportNet = byKey.support_network?.readinessScore;
  const financial = byKey.financial_readiness?.readinessScore;
  const advocacy = byKey.self_advocacy?.readinessScore;
  const social = byKey.social_emotional?.readinessScore;

  if (academic != null && academic >= 7 && timeMgmt != null && timeMgmt <= 5) {
    indicators.push({
      key: 'academic_time',
      message:
        'Your academic preparation appears solid, while independent scheduling may need more practice before college begins.'
    });
  }
  if (motivation != null && motivation >= 8 && application != null && application <= 5) {
    indicators.push({
      key: 'motivation_application',
      message:
        'You appear motivated and optimistic. Creating a detailed application or enrollment checklist may help turn that confidence into action.'
    });
  }
  if (
    living != null &&
    living >= 7 &&
    ((systems != null && systems <= 5) || (supportNet != null && supportNet <= 5))
  ) {
    indicators.push({
      key: 'independence_support',
      message:
        'You feel capable of handling many responsibilities, but learning how to use college support systems may strengthen your transition.'
    });
  }
  for (const s of scored) {
    if (s.readinessScore >= 7 && s.confidenceScore != null && s.confidenceScore <= 5) {
      indicators.push({
        key: `confidence_gap_${s.domainKey}`,
        message: `${s.label}: your preparation may be stronger than your confidence currently suggests.`
      });
      break;
    }
  }
  if (
    financial != null &&
    financial <= 5 &&
    (byKey.financial_readiness?.reflectionChips || []).some((c) =>
      /cost|aid|loan|budget|bill/i.test(String(c))
    )
  ) {
    indicators.push({
      key: 'financial_concern',
      message:
        'College costs or financial processes remain unclear. A financial-aid or college-planning conversation may be useful.'
    });
  } else if (financial != null && financial <= 5) {
    indicators.push({
      key: 'financial_concern',
      message:
        'Financial readiness appears to need more clarity. A financial-aid or college-planning conversation may be useful.'
    });
  }
  if (application != null && application <= 5) {
    indicators.push({
      key: 'application_barrier',
      message:
        'Several application or enrollment steps may need attention. Creating a deadline-based checklist could reduce last-minute pressure.'
    });
  }
  if (
    advocacy != null &&
    advocacy <= 5 &&
    byKey.self_advocacy?.supportAvailabilityScore != null &&
    byKey.self_advocacy.supportAvailabilityScore >= 7
  ) {
    indicators.push({
      key: 'advocacy_gap',
      message:
        'Support appears available, but requesting help may still feel difficult. Practicing one specific help-seeking action may be useful.'
    });
  }
  if (social != null && social <= 5) {
    indicators.push({
      key: 'transition_stress',
      message:
        'The transition currently feels stressful or uncertain. Connecting with a trusted adult, counselor, mentor, or campus support person may help.'
    });
  }

  const insights = [];
  if (strongest[0]) {
    insights.push(`Your strongest current readiness areas include ${strongest[0].label}.`);
  }
  if (needingSupport[0]) {
    insights.push(
      `${needingSupport[0].label} appears to be an important preparation area based on your responses.`
    );
  }
  if (supportNet != null && supportNet >= 8) {
    insights.push(
      'Your support network appears strong, which may be an important resource during the transition.'
    );
  }

  const supportRequestCount = (responses || []).filter(
    (r) => r.supportPreference && r.supportPreference !== 'none'
  ).length;

  let currentLaunchStage = 'explore';
  for (const stage of LAUNCH_STAGES) {
    const prog = stageProgress[stage.key];
    if (prog.total && prog.completed < prog.total) {
      currentLaunchStage = stage.key;
      break;
    }
    if (prog.illuminated) currentLaunchStage = stage.key;
  }

  return {
    collegeReadinessScore,
    collegeReadinessStatus: collegeReadinessStatusLabel(collegeReadinessScore),
    systemScores,
    stageProgress,
    currentLaunchStage,
    strengths,
    strongest,
    needingSupport,
    indicators,
    insights,
    supportRequestCount,
    scoredCount: scored.length,
    domainCount: domains.length
  };
}
