/**
 * Pure Student Success scoring (no DB).
 */

export function calculateStudentSuccessScore(scores) {
  const completed = (scores || []).filter((s) => s != null && Number.isFinite(Number(s))).map(Number);
  if (!completed.length) return null;
  const average = completed.reduce((sum, score) => sum + score, 0) / completed.length;
  return Math.round(average * 10);
}

export function calculateWeightedStudentSuccessScore(values) {
  const list = (values || []).filter(
    (i) => i && Number.isFinite(Number(i.score)) && Number.isFinite(Number(i.weight)) && Number(i.weight) > 0
  );
  if (!list.length) return null;
  const totalWeight = list.reduce((sum, item) => sum + Number(item.weight), 0);
  if (!totalWeight) return null;
  const weightedTotal = list.reduce((sum, item) => sum + Number(item.score) * Number(item.weight), 0);
  return Math.round((weightedTotal / totalWeight) * 10);
}

export function calculateStudentOpportunityScore(currentScore, importanceScore) {
  const cur = Number(currentScore);
  const imp = Number(importanceScore);
  if (!Number.isFinite(cur) || !Number.isFinite(imp)) return null;
  return (11 - cur) * imp;
}

export function studentSuccessStatusLabel(score) {
  if (score == null) return null;
  if (score <= 39) return 'Significant Support Needed';
  if (score <= 54) return 'Building Foundations';
  if (score <= 69) return 'Developing Skills';
  if (score <= 84) return 'Building Strong Skills';
  return 'Strong and Consistent Skills';
}

function avgScores(scores) {
  const list = (scores || []).filter((n) => n != null && Number.isFinite(Number(n)));
  if (!list.length) return null;
  return Math.round((list.reduce((s, n) => s + Number(n), 0) / list.length) * 10) / 10;
}

export function domainsForContext(template, { mode = 'full', educationLevel = 'high-school' } = {}) {
  return (template?.domains || []).filter((d) => {
    const ages = d.ageGroups || [];
    if (ages.length && educationLevel && !ages.includes(educationLevel)) return false;
    if (d.isOptional && Number(d.weight) <= 0) return false;
    const modes = d.availableModes || ['full'];
    if (modes.length && !modes.includes(mode)) return false;
    return true;
  });
}

export function buildSummary(template, responses, { mode = 'full', educationLevel = 'high-school' } = {}) {
  const domains = domainsForContext(template, { mode, educationLevel });
  const byKey = Object.fromEntries((responses || []).map((r) => [r.domainKey, r]));

  const scoreList = [];
  const weighted = [];
  for (const d of domains) {
    const score = byKey[d.key]?.score;
    if (score == null) continue;
    scoreList.push(score);
    if (Number(d.weight) > 0) weighted.push({ score, weight: Number(d.weight) });
  }

  const studentSuccessScore =
    weighted.length > 0
      ? calculateWeightedStudentSuccessScore(weighted)
      : calculateStudentSuccessScore(scoreList);

  const systemOf = (keys) =>
    avgScores(keys.map((k) => byKey[k]?.score).filter((s) => s != null));

  const systemScores = {
    learningHabits: systemOf(['organization', 'time_management', 'assignment_completion', 'study_skills']),
    learningMindset: systemOf(['academic_confidence', 'persistence', 'goals_motivation']),
    readiness: systemOf(['attendance', 'stress']),
    supportNetwork: systemOf(['teacher_support', 'family_support'])
  };

  const scored = domains
    .map((d) => {
      const r = byKey[d.key];
      if (!r || r.score == null) return null;
      const importance = r.importanceScore ?? null;
      const opportunity =
        importance != null ? calculateStudentOpportunityScore(r.score, importance) : null;
      return {
        domainKey: d.key,
        label: d.label,
        shortLabel: d.shortLabel,
        color: d.color,
        system: d.successSystem,
        score: r.score,
        importanceScore: importance,
        confidenceScore: r.confidenceScore ?? null,
        opportunityScore: opportunity,
        supportPreference: r.supportPreference || 'none',
        reflectionChips: r.reflectionChips || []
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.score - a.score);

  const strengths = scored.filter((s) => s.score >= 8);
  const strongest = scored.slice(0, 3);
  const needingSupport = [...scored]
    .sort((a, b) => {
      const ao = a.opportunityScore ?? 11 - a.score;
      const bo = b.opportunityScore ?? 11 - b.score;
      if (bo !== ao) return bo - ao;
      return a.score - b.score;
    })
    .slice(0, 3);

  const indicators = [];
  const confidence = byKey.academic_confidence?.score;
  const completion = byKey.assignment_completion?.score;
  const persistence = byKey.persistence?.score;
  const organization = byKey.organization?.score;
  const study = byKey.study_skills?.score;
  const stress = byKey.stress?.score;
  const teacher = byKey.teacher_support?.score;
  const timeMgmt = byKey.time_management?.score;
  const habitsAvg = systemScores.learningHabits;

  if (confidence != null && confidence >= 7 && completion != null && completion <= 5) {
    indicators.push({
      key: 'confidence_completion',
      message:
        'You believe you can succeed, but starting, finishing, or submitting work may need a more consistent system.'
    });
  }
  if (persistence != null && persistence >= 7 && organization != null && organization <= 5) {
    indicators.push({
      key: 'effort_organization',
      message:
        'Your effort appears strong. Better organization may help that effort produce more consistent results.'
    });
  }
  if (study != null && study >= 7 && stress != null && stress <= 5) {
    indicators.push({
      key: 'study_stress',
      message:
        'You have useful study strategies, but stress may make them harder to use consistently.'
    });
  }
  if (confidence != null && confidence <= 5 && habitsAvg != null && habitsAvg >= 7) {
    indicators.push({
      key: 'confidence_habits',
      message:
        'Your habits appear stronger than your confidence. Reviewing your progress and evidence of improvement may help.'
    });
  }
  if (
    teacher != null &&
    teacher >= 7 &&
    (byKey.assignment_completion?.reflectionChips || []).includes('I avoid asking for help')
  ) {
    indicators.push({
      key: 'support_help_seeking',
      message:
        'Support appears available, but asking for help may still feel difficult. A simple help-request plan could be useful.'
    });
  }
  if (timeMgmt != null && timeMgmt <= 5 && completion != null && completion <= 5) {
    indicators.push({
      key: 'time_completion_gap',
      message:
        'Planning when to begin may be one of the most useful areas to address first.'
    });
  }
  if (stress != null && stress <= 4) {
    indicators.push({
      key: 'stress_support',
      message:
        'School-related stress feels difficult right now. A conversation with a trusted adult may be useful.'
    });
  }

  const insights = [];
  if (strongest[0]) {
    insights.push(`Your strongest current skills include ${strongest[0].label}.`);
  }
  if (needingSupport[0] && needingSupport[0].importanceScore != null && needingSupport[0].importanceScore >= 7) {
    insights.push(
      `${needingSupport[0].label} is highly important to you but is not yet as consistent as you would like.`
    );
  }
  if (timeMgmt != null && completion != null && timeMgmt <= 5 && completion <= 5) {
    insights.push(
      'Time Management and Assignment Completion may improve together if you create a consistent start routine.'
    );
  }
  if (teacher != null && teacher >= 8) {
    insights.push('Teacher and school support appears to be one of your current strengths.');
  }

  const supportRequestCount = (responses || []).filter(
    (r) => r.supportPreference && r.supportPreference !== 'none'
  ).length;

  return {
    studentSuccessScore,
    studentSuccessStatus: studentSuccessStatusLabel(studentSuccessScore),
    systemScores,
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
