import { callPrivateSessionText } from './sessionAiPrivacy.service.js';
import { shouldUseGeminiPro, TRANSCRIPT_FIDELITY_INSTRUCTIONS } from '../config/clinicalNotePlanOutput.js';
import { clinicalNoteModelOptions } from '../config/clinicalNoteModel.js';
import { applyNarrivaWritingGuidance } from './narrivaPlatformSettings.service.js';

// Shared writer contract. Callers authorize and assemble only their permitted
// clinical context; this service does not discover patients, agencies or data.
export function buildPromptForTool({ tool, inputText }) {
  const header = [
    tool?.systemPrompt || '',
    '',
    tool?.outputInstructions ? `Output instructions:\n${tool.outputInstructions}` : '',
    '',
    'Transcript fidelity:',
    TRANSCRIPT_FIDELITY_INSTRUCTIONS,
    '',
    'User input (clinician transcript — retain this content in the note):',
    String(inputText || '')
  ]
    .filter(Boolean)
    .join('\n');
  return header;
}

export function clinicalWriterOptions(tool, { model, vertexOnly, sensitive, fastDraft=false } = {}) {
  const modelOptions = clinicalNoteModelOptions({ model, toolModel: tool.model });
  const usesThinkingLevel = Boolean(modelOptions.thinkingLevel);
  return {
    temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
    maxOutputTokens: Math.max(
      Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 1600,
      shouldUseGeminiPro(tool.id) ? 4000 : 0,
      tool.sectionSchema === 'treatment_plan' ? (usesThinkingLevel ? 16384 : 8192) : 0,
      usesThinkingLevel ? 8192 : 0
    ),
    // Leave room for the actual plan; unbounded thinking can consume the old
    // 4,000-token allowance before objectives and interventions are complete.
    ...(tool.sectionSchema === 'treatment_plan' && !usesThinkingLevel ? { thinkingBudget: 2048 } : {}),
    ...modelOptions,
    ...(fastDraft && usesThinkingLevel && tool.sectionSchema!=='treatment_plan'?{thinkingLevel:'LOW'}:{}),
    ...(vertexOnly !== undefined ? { vertexOnly } : {}),
    ...(sensitive !== undefined ? { sensitive } : {})
  };
}

export async function generateClinicalText({ tool, prompt, privacyContext, generatorGuidance = null, ...options }) {
  const configured = await applyNarrivaWritingGuidance({ prompt, toolId: tool.id, alreadyApplied: Boolean(generatorGuidance), expectedSettingsVersion: generatorGuidance?.generatorSettingsVersion });
  const result = await callPrivateSessionText({ prompt: configured.prompt, privacyContext, ...clinicalWriterOptions(tool, options) });
  if (tool.sectionSchema === 'treatment_plan' && result.finishReason && result.finishReason !== 'STOP') {
    throw Object.assign(new Error('The treatment plan was not completed. Please try again; no partial plan was saved.'), { status: 502, code: 'CLINICAL_PLAN_INCOMPLETE' });
  }
  return { ...result, generatorSettingsVersion: configured.settingsVersion };
}

export function assertH0031DiagnosisScope(text,diagnoses=[]) {
 const carried=new Set(diagnoses.map(row=>String(row.icd10_code || row.code || '').toUpperCase()));
 const generated=[...String(text || '').matchAll(/\bF\d{2}(?:\.[A-Z0-9]{1,4})?\b/gi)].map(match=>match[0].toUpperCase());
 if(generated.some(code=>!carried.has(code)))throw Object.assign(new Error('The H0031 draft proposed a new mental health disorder. Retry using social determinants and carry only verified diagnoses already on file.'),{status:422,code:'H0031_DIAGNOSIS_SCOPE'});
}

export const encounterTimingInstruction = 'The encounter header is the authority for date, start time, end time, and duration. Leave those details to the structured header. Do not repeat, infer, or change encounter dates, clock times, or duration in the note prose from narrative, enrollment, screening, or other sources. Preserve clinically relevant history and symptom durations.';
