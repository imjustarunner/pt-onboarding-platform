/**
 * College Readiness — scoring helpers (mirrors backend).
 */

export const LAUNCH_STAGES = [
  { key: 'explore', label: 'Explore' },
  { key: 'prepare', label: 'Prepare' },
  { key: 'apply', label: 'Apply' },
  { key: 'enroll', label: 'Enroll' },
  { key: 'transition', label: 'Transition' },
  { key: 'launch', label: 'Launch' }
];

export const SYSTEM_META = [
  { key: 'academic', label: 'Academic Readiness' },
  { key: 'independence', label: 'Independence Readiness' },
  { key: 'planning', label: 'Planning Readiness' },
  { key: 'financial', label: 'Financial Readiness' },
  { key: 'transition', label: 'Transition Readiness' }
];

export const STUDENT_VERSIONS = [
  { id: 'junior', label: 'High school junior' },
  { id: 'senior', label: 'High school senior' },
  { id: 'first-generation', label: 'First-generation student' },
  { id: 'community-college', label: 'Community college' },
  { id: 'residential-four-year', label: 'Four-year residential' },
  { id: 'transfer', label: 'Transfer student' },
  { id: 'returning-adult', label: 'Returning adult student' }
];

export const MODE_OPTIONS = [
  {
    id: 'full',
    label: 'Full College Readiness Assessment',
    time: '12–18 min',
    description: 'Build a complete College Launch Plan.'
  },
  {
    id: 'quick',
    label: 'Quick Readiness Check',
    time: '3–5 min',
    description: 'Track current preparation and barriers.'
  },
  {
    id: 'application',
    label: 'Application Readiness Check',
    time: '5–8 min',
    description: 'Focus on applications, deadlines, and financial aid.'
  },
  {
    id: 'transition',
    label: 'Transition Readiness Check',
    time: '6–10 min',
    description: 'Independent living, systems, and first-semester prep.'
  }
];

export const SUPPORT_OPTIONS = [
  { id: 'none', label: 'No support needed' },
  { id: 'information', label: 'I would like information' },
  { id: 'checklist', label: 'I would like a checklist' },
  { id: 'counselor', label: 'I would like help from a counselor' },
  { id: 'college-advisor', label: 'I would like help from a college advisor' },
  { id: 'family', label: 'I would like help from my family' },
  { id: 'mentor', label: 'I would like help from a mentor' },
  { id: 'private-follow-up', label: 'I would like a private follow-up' },
  { id: 'unsure', label: 'I am not sure' }
];

export const PRIORITY_OPTIONS = [
  { id: 'academic_foundations', label: 'Academic Preparation' },
  { id: 'study_strategies', label: 'Study Skills' },
  { id: 'time_management', label: 'Time Management' },
  { id: 'self_advocacy', label: 'Self-Advocacy' },
  { id: 'independent_living', label: 'Independent Living' },
  { id: 'financial_readiness', label: 'Financial Planning' },
  { id: 'application_enrollment', label: 'Applications / Enrollment' },
  { id: 'career_direction', label: 'Career Direction' },
  { id: 'systems_navigation', label: 'Campus Systems' },
  { id: 'social_emotional', label: 'Social and Emotional Readiness' },
  { id: 'support_network', label: 'Support Network' },
  { id: 'other', label: 'Other' }
];

export const CONCERN_OPTIONS = [
  'Academic preparation',
  'Paying for college',
  'Choosing a major',
  'Application process',
  'Time management',
  'Living independently',
  'Making friends',
  'Stress',
  'Asking for help',
  'Understanding college systems',
  'Family expectations',
  'Other'
];

export const CHECKLIST_STATUSES = [
  { id: 'not-started', label: 'Not Started' },
  { id: 'in-progress', label: 'In Progress' },
  { id: 'completed', label: 'Completed' },
  { id: 'needs-help', label: 'Needs Help' },
  { id: 'not-applicable', label: 'Not Applicable' }
];

export function calculateCollegeReadinessScore(scores) {
  const completed = (scores || []).filter((s) => s != null && Number.isFinite(Number(s))).map(Number);
  if (!completed.length) return null;
  return Math.round((completed.reduce((a, b) => a + b, 0) / completed.length) * 10);
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

export function interpretScore(score, labels = {}) {
  if (score == null) return '';
  if (score <= 3) return labels.low || 'Not prepared yet in this area';
  if (score <= 6) return labels.mid || 'Partially prepared in this area';
  return labels.high || 'Stronger readiness in this area';
}

export function buildCollegeReadinessSummary(template, responses, ctx = {}) {
  const mode = ctx.mode || 'full';
  const studentVersion = ctx.studentVersion || 'senior';
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
  const needingSupport = [...scored].sort((a, b) => a.readinessScore - b.readinessScore).slice(0, 3);

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
  if (financial != null && financial <= 5) {
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
    supportRequestCount: (responses || []).filter(
      (r) => r.supportPreference && r.supportPreference !== 'none'
    ).length,
    scoredCount: scored.length,
    domainCount: domains.length
  };
}

export function buildSuggestedChecklist(domains, responses) {
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));
  const items = [];
  for (const d of domains || []) {
    const score = byKey[d.key]?.readinessScore;
    if (score == null) continue;
    const suggestions = d.checklistSuggestions || [];
    for (const title of suggestions) {
      items.push({
        id: `${d.key}:${title}`,
        domainKey: d.key,
        category: d.launchStage || 'preparation',
        categoryLabel: d.shortLabel || d.label,
        title,
        status: score >= 8 ? 'completed' : score >= 5 ? 'in-progress' : 'not-started'
      });
    }
  }
  return items;
}
