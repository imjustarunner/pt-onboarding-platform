import { callPrivateSessionText } from './sessionAiPrivacy.service.js';
import { shouldUseGeminiPro, TRANSCRIPT_FIDELITY_INSTRUCTIONS } from '../config/clinicalNotePlanOutput.js';

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

export function clinicalWriterOptions(tool, { model, vertexOnly, sensitive } = {}) {
  return {
    temperature: Number.isFinite(tool.temperature) ? tool.temperature : 0.2,
    maxOutputTokens: Math.max(
      Number.isFinite(tool.maxOutputTokens) ? tool.maxOutputTokens : 1600,
      shouldUseGeminiPro(tool.id) ? 4000 : 0
    ),
    model: model || tool.model || (shouldUseGeminiPro(tool.id) ? 'gemini-2.5-pro' : null),
    ...(vertexOnly !== undefined ? { vertexOnly } : {}),
    ...(sensitive !== undefined ? { sensitive } : {})
  };
}

export async function generateClinicalText({ tool, prompt, privacyContext, ...options }) {
  return callPrivateSessionText({ prompt, privacyContext, ...clinicalWriterOptions(tool, options) });
}
