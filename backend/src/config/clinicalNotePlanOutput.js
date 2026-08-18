/**
 * Machine-enforced treatment-plan section contract (same idea as 90837 SOAP headers).
 * Independently copyable Goal N / Objective N panels depend on these exact titles.
 */
export const TREATMENT_PLAN_OUTPUT_INSTRUCTIONS = [
  'Return the treatment plan only—no preamble, title block, or closing commentary.',
  'Use these headers exactly, each on its own line, then the body on the following lines:',
  'Goal 1:',
  'Objective 1:',
  'Projected Time to Completion 1:',
  'Goal 2:',
  'Objective 2:',
  'Projected Time to Completion 2:',
  'Goal 3:',
  'Objective 3:',
  'Projected Time to Completion 3:',
  'Discharge Plan:',
  'Each goal must have its matching numbered objective (Goal 1 with Objective 1, and so on).',
  'Objectives must be SMART: 1–10 scale, current level, what 10 and 1 mean, and how progress is measured (self, family, school, and/or clinical observation).',
  'Use the clinician transcript in full: include specific details, quotes, and functional examples rather than generic summaries.',
  'When updating an existing plan, also include Diagnosis: and Diagnostic Justification: before Goal 1.'
].join('\n');

export const TRANSCRIPT_FIDELITY_INSTRUCTIONS = [
  'The clinician transcript under "User input" is the source of truth.',
  'Retain the substance of what was said: names of topics, specific examples, quotes, sequence of discussion, affect, and interventions implied by the transcript.',
  'Do not compress a long transcript into two or three generic sentences. If the clinician provided many details, the note sections must be correspondingly detailed.',
  'Paraphrase into clinical language, but do not drop content. Knowledge-base examples are style-only and must not replace or shrink the transcript.'
].join('\n');

export const PROGRESS_NOTE_OUTPUT_INSTRUCTIONS = [
  'Return the note sections only with headers Subjective:, Objective:, Interventions:, Plan:.',
  'Interventions must be a single comma-separated list of interventions supported by the session content (no narrative paragraphs).',
  TRANSCRIPT_FIDELITY_INSTRUCTIONS
].join('\n');

export const TREATMENT_PLAN_TOOL_IDS = new Set([
  'clinical_psychotherapy_plan',
  'clinical_skill_builders_plan',
  'clinical_tpt_plan',
  'clinical_h0004_plan',
  'clinical_individual_plan',
  'clinical_90791_intake_plan'
]);

export const PROGRESS_NOTE_TOOL_IDS = new Set([
  'clinical_psychotherapy_note',
  'clinical_family_note',
  'clinical_h2014_group',
  'clinical_h2014_individual',
  'clinical_h0004_note',
  'clinical_tpt_note'
]);

export function isTreatmentPlanToolId(toolId) {
  return TREATMENT_PLAN_TOOL_IDS.has(String(toolId || ''));
}

export function shouldUseGeminiPro(toolId) {
  const id = String(toolId || '');
  return TREATMENT_PLAN_TOOL_IDS.has(id) || PROGRESS_NOTE_TOOL_IDS.has(id);
}

