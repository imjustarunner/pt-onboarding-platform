vi.mock('google-auth-library',()=>({GoogleAuth:class{async getAccessToken(){return 'synthetic';}}}));
import { afterEach,beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../geminiText.service.js', () => ({ callGeminiText: vi.fn() }));
import { callGeminiText } from '../geminiText.service.js';
import { buildPromptForTool, generateClinicalText } from '../clinicalNoteWriter.service.js';
import { getNoteAidToolById } from '../../config/noteAidTools.js';
import { TRANSCRIPT_FIDELITY_INSTRUCTIONS } from '../../config/clinicalNotePlanOutput.js';
const input = { patientId: 'patient-one', aidId: 'clinical_psychotherapy_note', facts: 'Clinician verified session facts.', consentReviewed: true };
beforeEach(()=>{vi.stubEnv('GCP_PROJECT_ID','test');vi.stubEnv('CLINICAL_AI_PRIVACY_APPROVED','true');vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64',Buffer.alloc(32,7).toString('base64'));vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({result:{findings:[]}})})));});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(callGeminiText).mockResolvedValue({ text: 'Subjective: Synthetic report\nObjective: Synthetic observation\nInterventions: Mindfulness\nPlan: Reviewed follow-up', modelName: 'synthetic', finishReason: 'STOP' });
});
describe('shared clinical writer', () => {
  it('preserves the established full-suite prompt and model contract', async () => {
    const tool = getNoteAidToolById(input.aidId);
    const prompt = buildPromptForTool({ tool, inputText: input.facts });
    expect(prompt).toBe([tool.systemPrompt, `Output instructions:\n${tool.outputInstructions}`, 'Transcript fidelity:', TRANSCRIPT_FIDELITY_INSTRUCTIONS, 'User input (clinician transcript — retain this content in the note):', input.facts].join('\n'));
    await generateClinicalText({ tool, prompt });
    const sent = vi.mocked(callGeminiText).mock.calls[0][0];
    expect(sent.prompt).toContain(prompt);
    expect(sent.prompt).toContain('only as Client and Provider');
    expect(sent.temperature).toBe(tool.temperature);
    expect(sent.maxOutputTokens).toBeGreaterThanOrEqual(tool.maxOutputTokens);
    expect(sent.model).toBe(tool.model || 'gemini-2.5-pro');
    expect(sent.vertexOnly).toBe(true);
    expect(sent.sensitive).toBe(true);
  });
});
