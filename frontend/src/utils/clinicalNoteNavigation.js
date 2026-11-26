const sections = [
  ['Diagnoses', /^(diagnos(?:is|es)(?: on file)?|diagnostic justification)$/i],
  ['Mental status', /mental status/i],
  ['Risk assessment', /^(risk|safety)/i],
  ['Treatment plan', /^treatment (?:plan|objective ratings|goals)/i],
  ['Subjective', /^(subjective|presenting problem)/i],
  ['Objective', /^objective/i],
  ['Interventions', /^interventions?/i],
  ['Plan', /^(plan|follow[- ]up|recommendations)/i],
  ['Assessments', /^(assessment(?:s| findings)?|screening|medications)$/i]
];

export const noteSectionNavigationLabel = title => sections.find(([,pattern])=>pattern.test(String(title || '').trim()))?.[0];
