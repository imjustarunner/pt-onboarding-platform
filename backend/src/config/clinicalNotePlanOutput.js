/**
 * Shared Note Aid output contracts.
 *
 * Progress notes (90837, H0004, family, H2014, …) share one SOIP panel pipeline:
 * Subjective / Objective / Interventions / Plan — same copy UX, different tone/directions.
 *
 * Treatment plans share one Goal/Objective/Projected Time/Discharge structure with
 * mandatory 1–10 scales (same form/function as paste-import review).
 *
 * Updating these constants applies to every Note Aid consumer (generate API, Session
 * Recording, Quick View) because tools load through applySharedNoteAidToolContracts().
 */

export const TRANSCRIPT_FIDELITY_INSTRUCTIONS = [
  'The clinician transcript under "User input" is the source of truth.',
  'Retain the substance of what was said: names of topics, specific examples, quotes, sequence of discussion, affect, and interventions implied by the transcript.',
  'Do not compress a long transcript into two or three generic sentences. If the clinician provided many details, the note sections must be correspondingly detailed.',
  'Paraphrase into clinical language, but do not drop content. Knowledge-base examples are style-only and must not replace or shrink the transcript.'
].join('\n');

/** Machine-enforced SOIP section contract (90837 / H0004 / family / H2014 / TPT). */
export const PROGRESS_NOTE_OUTPUT_INSTRUCTIONS = [
  'Return the progress note only—no preamble, title block, or closing commentary.',
  'Use these four SOIP section headers exactly, each on its own line, then the body on the following lines:',
  'Subjective:',
  'Objective:',
  'Interventions:',
  'Plan:',
  'Long clinical titles are aliases only (they map to the same four copyable panels):',
  '"Symptom Description and Subjective Report" → Subjective,',
  '"Objective Content" → Objective,',
  '"Interventions Used" → Interventions.',
  'Interventions must be a single comma-separated list of interventions supported by the session content (no narrative paragraphs).',
  'Do not merge sections. Do not use one heading such as "Output" for the whole note.',
  TRANSCRIPT_FIDELITY_INSTRUCTIONS
].join('\n');

/**
 * Appended to SOIP tool system prompts so aid-specific tone/directions stay, while
 * section headers stay machine-compatible with the shared copy UX.
 */
export const SOIP_STRUCTURE_CONTRACT = [
  'MACHINE OUTPUT CONTRACT (overrides conflicting section outlines in the style guide above):',
  'Emit ONLY these four SOIP headers so panels stay independently copyable:',
  'Subjective:',
  'Objective:',
  'Interventions:',
  'Plan:',
  'Keep this aid’s tone, vocabulary, and clinical directions, but map all content into these four panels.',
  'Interventions must be a comma-separated list (not paragraphs).'
].join('\n');

/**
 * Machine-enforced treatment-plan section contract.
 * Independently copyable Goal N / Objective N panels depend on these exact titles.
 * Scale rules match paste-import review (1–10 current → target, measurement method).
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
  'Objectives must be SMART and ratable on a 1–10 scale.',
  'Every Objective MUST include: current level (e.g. 4/10), target level (e.g. 8/10), what 1 and 10 mean, and how progress is measured (self-report, family report, school report, and/or clinical observation as applicable).',
  'Preferred scale phrasing: "from a current level of X/10 to a Y/10, where 1 = … and 10 = …".',
  'Projected Time to Completion should be a duration in months (e.g. "3 months") when possible.',
  'Use the clinician transcript in full: include specific details, quotes, and functional examples rather than generic summaries.',
  'When updating an existing plan, also include Diagnosis: and Diagnostic Justification: before Goal 1.'
].join('\n');

/**
 * Appended to every treatment-plan system prompt so H0004 / Skill Builders / TPT / etc.
 * keep unique writing directions but share form and scale rules with paste import.
 */
export const TREATMENT_PLAN_STRUCTURE_CONTRACT = [
  'MACHINE OUTPUT CONTRACT (overrides conflicting outline headings in the style guide above):',
  'Emit ONLY these headers (each on its own line): Goal 1:, Objective 1:, Projected Time to Completion 1:, Goal 2:, Objective 2:, Projected Time to Completion 2:, Goal 3:, Objective 3:, Projected Time to Completion 3:, Discharge Plan:.',
  'When updating, also include Diagnosis: and Diagnostic Justification: before Goal 1.',
  'Every Objective MUST include a 1–10 scale with current and target (e.g. "from a current level of 4/10 to an 8/10"), definitions of 1 and 10, and measurement via self-report / family / school / clinical observation as applicable.',
  'Do NOT use alternate top-level outlines such as Presenting Concerns, Services and Support Plan, or 1.1/1.2 objective numbers as section headers.',
  'Keep this aid’s tone and wording appropriate for the service line, but use the Goal / Objective / Projected Time / Discharge structure above so charts, copy panels, and paste-import stay consistent.'
].join('\n');

export const TREATMENT_PLAN_TOOL_IDS = new Set([
  'clinical_psychotherapy_plan',
  'clinical_skill_builders_plan',
  'clinical_tpt_plan',
  'clinical_h0004_plan',
  'clinical_individual_plan',
  'clinical_90791_intake_plan'
]);

/** Tools that use the shared SOIP Subjective/Objective/Interventions/Plan panels. */
export const SOIP_PROGRESS_NOTE_TOOL_IDS = new Set([
  'clinical_psychotherapy_note',
  'clinical_family_note',
  'clinical_h2014_group',
  'clinical_h2014_individual',
  'clinical_h0004_note',
  'clinical_tpt_note'
]);

export const PROGRESS_NOTE_TOOL_IDS = new Set([
  ...SOIP_PROGRESS_NOTE_TOOL_IDS,
  'clinical_cs_note_build'
]);

export function isCsNoteBuildToolId(toolId) {
  return String(toolId || '') === 'clinical_cs_note_build';
}

export function isTreatmentPlanToolId(toolId) {
  return TREATMENT_PLAN_TOOL_IDS.has(String(toolId || ''));
}

export function isSoipProgressNoteToolId(toolId) {
  return SOIP_PROGRESS_NOTE_TOOL_IDS.has(String(toolId || ''));
}

/** 90785 Interactive Complexity — progress notes (and Code Decider) only. */
export function isProgressNoteToolId(toolId) {
  const id = String(toolId || '');
  return PROGRESS_NOTE_TOOL_IDS.has(id) || id === 'clinical_code_decider';
}

export function shouldUseGeminiPro(toolId) {
  const id = String(toolId || '');
  return TREATMENT_PLAN_TOOL_IDS.has(id) || PROGRESS_NOTE_TOOL_IDS.has(id);
}

export function getOutputInstructionsForTool(toolId) {
  const id = String(toolId || '');
  if (isSoipProgressNoteToolId(id)) return PROGRESS_NOTE_OUTPUT_INSTRUCTIONS;
  if (id === 'clinical_90791_intake_plan') {
    return [
      'Return intake sections first with their titled headers, then the treatment plan.',
      TREATMENT_PLAN_OUTPUT_INSTRUCTIONS
    ].join('\n');
  }
  if (isTreatmentPlanToolId(id)) return TREATMENT_PLAN_OUTPUT_INSTRUCTIONS;
  return null;
}

/**
 * Normalize tool definitions so SOIP notes and treatment plans share one contract.
 * Call once when exporting CLINICAL_NOTE_AGENT_TOOLS.
 */
export function applySharedNoteAidToolContracts(tools) {
  return (Array.isArray(tools) ? tools : []).map((tool) => {
    if (!tool || typeof tool !== 'object') return tool;
    const id = String(tool.id || '');
    const next = { ...tool };

    if (isSoipProgressNoteToolId(id)) {
      next.outputInstructions = PROGRESS_NOTE_OUTPUT_INSTRUCTIONS;
      next.maxOutputTokens = Math.max(Number(tool.maxOutputTokens || 0), 4000);
      next.model = tool.model || 'gemini-2.5-pro';
      next.sectionSchema = 'soip';
      const prompt = String(tool.systemPrompt || '');
      if (!prompt.includes('MACHINE OUTPUT CONTRACT') && id !== 'clinical_psychotherapy_note') {
        next.systemPrompt = `${prompt.trim()}\n\n${SOIP_STRUCTURE_CONTRACT}`;
      }
    }

    if (isTreatmentPlanToolId(id)) {
      next.outputInstructions = getOutputInstructionsForTool(id) || TREATMENT_PLAN_OUTPUT_INSTRUCTIONS;
      next.maxOutputTokens = Math.max(Number(tool.maxOutputTokens || 0), 4000);
      next.model = tool.model || 'gemini-2.5-pro';
      next.sectionSchema = 'treatment_plan';
      const prompt = String(tool.systemPrompt || '');
      if (!prompt.includes('MACHINE OUTPUT CONTRACT')) {
        next.systemPrompt = `${prompt.trim()}\n\n${TREATMENT_PLAN_STRUCTURE_CONTRACT}`;
      }
    }

    return next;
  });
}
