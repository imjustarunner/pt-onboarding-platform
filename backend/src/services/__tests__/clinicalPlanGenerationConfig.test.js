import { describe, expect, it, vi } from 'vitest';
vi.mock('../googleWorkspaceAuth.service.js', () => ({ parseGoogleWorkspaceServiceAccountFromEnv: vi.fn() }));
import { translationGenerationConfig } from '../geminiText.service.js';
describe('clinical plan model allowance', () => {
  const options = { modelName: 'gemini-2.5-pro', temperature: 0.2, maxOutputTokens: 8192 };
  it('reserves response capacity by passing the explicit reasoning budget to Pro', () => {
    expect(translationGenerationConfig({ ...options, thinkingBudget: 2048 })).toEqual({ temperature: 0.2, maxOutputTokens: 8192, thinkingConfig: { thinkingBudget: 2048 } });
  });
  it('does not change callers without an explicit budget or turn off Pro reasoning', () => {
    expect(translationGenerationConfig(options).thinkingConfig).toBeUndefined();
    expect(translationGenerationConfig({ ...options, thinkingBudget: 0 }).thinkingConfig).toBeUndefined();
  });
  it('preserves Flash translation behavior and avoids unsupported model settings', () => {
    expect(translationGenerationConfig({ ...options, modelName: 'gemini-2.5-flash', thinkingBudget: 0 }).thinkingConfig).toEqual({ thinkingBudget: 0 });
    expect(translationGenerationConfig({ ...options, modelName: 'gemini-3-pro', thinkingBudget: 2048 }).thinkingConfig).toBeUndefined();
  });
});
