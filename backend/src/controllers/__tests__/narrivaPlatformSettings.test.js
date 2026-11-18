import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), load: vi.fn(), save: vi.fn(), history: vi.fn(), generate: vi.fn(), guidance: vi.fn(), redact: vi.fn(), feedback: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/NarrivaGeneratorSettings.model.js', () => ({ default: { save: mocks.save, history: mocks.history, feedback: mocks.feedback } }));
vi.mock('../../config/clinicalNoteAgentTools.js', () => ({ CLINICAL_NOTE_AGENT_TOOLS: [{ id: 'writer', name: 'Synthetic writer', systemPrompt: 'Source instructions', outputInstructions: 'Required headers', kbFolders: ['fictional'] }] }));
vi.mock('../../config/noteAidTools.js', () => ({ getNoteAidToolById: id => id === 'writer' ? { id, systemPrompt: 'Source' } : null }));
vi.mock('../../services/narrivaPlatformSettings.service.js', () => ({ loadNarrivaSettings: mocks.load, invalidateNarrivaSettings: vi.fn() }));
vi.mock('../../services/clinicalNoteWriter.service.js', () => ({ buildPromptForTool: ({ inputText }) => inputText, generateClinicalText: mocks.generate }));
vi.mock('../../services/narrivaGuidance.service.js', () => ({ loadNarrivaGuidanceContext: mocks.guidance }));
vi.mock('../../services/sessionAiPrivacy.service.js', () => ({ createSessionPrivacyContext: () => ({ redact: mocks.redact }) }));
vi.mock('../../services/narrivaInputPrivacy.service.js', () => ({ requireNarrivaIdentifierCorrection: vi.fn() }));
vi.mock('../../services/narrivaAccess.service.js', () => ({ requireNarrivaAgency: vi.fn() }));
vi.mock('../../models/AgencyMedicalServiceCode.model.js', () => ({ default: { listByAgency: vi.fn() } }));
import { assertNarrivaPlatformAccess, putNarrivaPlatformSettings, testNarrivaGenerator } from '../narrivaPlatformSettings.controller.js';
const response = () => ({ set: vi.fn(), json: vi.fn(), status: vi.fn().mockReturnThis() });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.load.mockResolvedValue({ version: 3, configuration: {} });
  mocks.redact.mockImplementation(async value => value);
  mocks.guidance.mockResolvedValue({ guidance: 'Shared clinical guidance', guidanceHash: 'opaque-fingerprint', supportCoverage: {} });
  mocks.generate.mockResolvedValue({ text: 'Synthetic output', modelName: 'gemini-4-hydrogen', finishReason: 'STOP', generatorSettingsVersion: 3 });
});
describe('Narriva platform settings and generator tester access', () => {
  it('denies provider, agency administrator, switched and demonstration identities', () => {
    for (const user of [{ id: 1, role: 'provider' }, { id: 1, role: 'admin' }, { id: 1, role: 'super_admin', demoMode: true }, { id: 1, role: 'super_admin', switchedFromUserId: 5 }]) expect(() => assertNarrivaPlatformAccess(user)).toThrow('own authorized platform');
    expect(() => assertNarrivaPlatformAccess({ id: 1, role: 'super_admin' })).not.toThrow();
  });
  it('requires a current version and change reason before persisting instructions', async () => {
    const next = vi.fn();
    await putNarrivaPlatformSettings({ user: { id: 1, role: 'super_admin' }, body: { expectedVersion: 3, reason: '' } }, response(), next);
    expect(next.mock.calls[0][0].status).toBe(400);
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('refuses linked chart/session context in the standalone tester', async () => {
    const next = vi.fn();
    await testNarrivaGenerator({ user: { id: 1, role: 'super_admin' }, body: { agencyId: 2, toolId: 'writer', serviceCode: '90837', inputText: 'Fictional facts', syntheticConfirmed: true, sessionId: 77 } }, response(), next);
    expect(next.mock.calls[0][0].status).toBe(422);
    expect(mocks.generate).not.toHaveBeenCalled();
  });
  it('uses the shared writer and shared guidance after privacy inspection without creating chart or signing artifacts', async () => {
    const res = response(), next = vi.fn();
    await testNarrivaGenerator({ user: { id: 1, role: 'super_admin' }, body: { agencyId: 2, toolId: 'writer', serviceCode: '90837', inputText: 'Fictional facts', syntheticConfirmed: true } }, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(mocks.generate).toHaveBeenCalledWith(expect.objectContaining({ prompt: expect.stringContaining('Shared clinical guidance') }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ model: 'gemini-4-hydrogen', quickSignEligible: false, savedToChart: false }));
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it('stops before model dispatch when the inspector finds identifying details', async () => {
    mocks.redact.mockResolvedValue('Redacted input');
    const next = vi.fn();
    await testNarrivaGenerator({ user: { id: 1, role: 'super_admin' }, body: { agencyId: 2, toolId: 'writer', serviceCode: '90837', inputText: 'Fictional facts', syntheticConfirmed: true } }, response(), next);
    expect(next.mock.calls[0][0].code).toBe('PHI_INPUT_REQUIRES_CORRECTION');
    expect(mocks.generate).not.toHaveBeenCalled();
  });
});
