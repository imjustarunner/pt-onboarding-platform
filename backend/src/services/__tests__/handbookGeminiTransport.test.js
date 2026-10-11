import { afterEach, describe, expect, it, vi } from 'vitest';
import { callGeminiText, translationGenerationConfig } from '../geminiText.service.js';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });
describe('handbook structured AI transport', () => {
  it('reserves reasoning for policy answers on supported models without changing unrelated defaults', () => {
    const options = { temperature: 0, maxOutputTokens: 7200, modelName: 'gemini-2.5-flash', thinkingBudget: 2048 };
    expect(translationGenerationConfig(options).thinkingConfig).toEqual({ thinkingBudget: 2048 });
    expect(translationGenerationConfig({ ...options, modelName: 'gemini-2.5-pro' }).thinkingConfig).toEqual({ thinkingBudget: 2048 });
    expect(translationGenerationConfig({ ...options, thinkingBudget: undefined }).thinkingConfig).toBeUndefined();
    expect(translationGenerationConfig({ ...options, modelName: 'gemini-3-pro' }).thinkingConfig).toBeUndefined();
  });
  it('keeps instructions separate from question data and requests JSON without changing other callers', async () => {
    vi.stubEnv('GEMINI_FORCE_API_KEY', 'true'); vi.stubEnv('GEMINI_API_KEY', 'synthetic-test-key');
    const request = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '{"ok":true}' }] } }] }) });
    vi.stubGlobal('fetch', request);
    await callGeminiText({ prompt: 'question data', systemInstruction: 'Handbook-only instructions', jsonMode: true, sensitive: true });
    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(body.systemInstruction.parts[0].text).toBe('Handbook-only instructions');
    expect(body.contents[0].parts[0].text).toBe('question data');
    expect(body.generationConfig.responseMimeType).toBe('application/json');
    expect(request.mock.calls[0][1].signal).toBeDefined();
    await callGeminiText({ prompt: 'ordinary caller' });
    const ordinary = JSON.parse(request.mock.calls[1][1].body);
    expect(ordinary.systemInstruction).toBeUndefined(); expect(ordinary.generationConfig.responseMimeType).toBeUndefined();
  });
  it('does not log a sensitive provider error body', async () => {
    vi.stubEnv('GEMINI_FORCE_API_KEY', 'true'); vi.stubEnv('GEMINI_API_KEY', 'synthetic-test-key');
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429, text: async () => 'private question content' }));
    await expect(callGeminiText({ prompt: 'private question content', sensitive: true })).rejects.toMatchObject({ details: 'Sensitive request details withheld' });
    expect(JSON.stringify(log.mock.calls)).not.toContain('private question content');
  });
});
