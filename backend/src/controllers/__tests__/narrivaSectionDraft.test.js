import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => () => {} }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: {} }));
vi.mock('../../services/narrivaGuidance.service.js', () => ({ loadNarrivaGuidanceContext: vi.fn() }));
vi.mock('../../services/clinicalNoteWriter.service.js', () => ({ buildPromptForTool: ({ inputText }) => inputText, generateClinicalText: vi.fn() }));
import { createNarrivaSectionDraftHandler } from '../narrivaSectionDraft.controller.js';
let dependencies;
const request = patch => ({ user: { id: 8, role: 'provider' }, body: { agencyId: 2, clientId: 4, clinicalSessionId: 17, serviceCode: '90837', section: 'Plan', inputText: 'Fictional client practiced a coping strategy. Provider and client agreed to repeat this practice before the next presentation.', ...patch } });
const response = () => ({ set: vi.fn(), json: vi.fn() });
beforeEach(() => {
  dependencies = { findSession: vi.fn(async () => ({ id: 17, agency_id: 2, client_id: 4, provider_user_id: 8, appointment_id: 21, service_code: '90837', metadata_json: { serviceDate: '2026-11-17' } })), clientAccess: vi.fn(async () => ({ id: 4, full_name: 'Fictional Client' })), careEligibility: vi.fn(async () => ({ canProvideCare: true })), planEligibility: vi.fn(async () => ({})), settings: vi.fn(async () => ({ version: 3, configuration: {} })), guidance: vi.fn(async () => ({ guidance: 'Existing service and owner writing guidance', guidanceHash: 'synthetic-guidance' })), writer: vi.fn(async () => ({ text: 'Subjective:\nFictional report\nObjective:\nPractice\nInterventions:\nSkills Practice\nPlan:\nClient will repeat the agreed coping practice before the next presentation.', finishReason: 'STOP', modelName: 'gemini-4-hydrogen', generatorSettingsVersion: 3 })), features: vi.fn(async () => ({ writing: true })), privacy: vi.fn(() => ({ redact: async text => text })) };
});
describe('writer-backed guided Plan preview', () => {
  it('uses the canonical service writer, shared owner guidance, and privacy context without signing or persistence', async () => {
    const res = response(), next = vi.fn();
    await createNarrivaSectionDraftHandler(dependencies)(request(), res, next);
    expect(next).not.toHaveBeenCalled();
    expect(dependencies.writer).toHaveBeenCalledWith(expect.objectContaining({ tool: expect.objectContaining({ id: 'clinical_psychotherapy_note' }), privacyContext: expect.any(Object), prompt: expect.stringContaining('Existing service and owner writing guidance') }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ text: 'Client will repeat the agreed coping practice before the next presentation.', model: 'gemini-4-hydrogen', previewOnly: true, savedToChart: false, quickSignEligible: false }));
  });
  it('rejects other sections, arbitrary state and alternate client/session combinations before model dispatch', async () => {
    for (const body of [{ section: 'Diagnosis' }, { state: { arbitrary: true } }, { clientId: 99 }]) {
      const next = vi.fn();
      await createNarrivaSectionDraftHandler(dependencies)(request(body), response(), next);
      expect(next).toHaveBeenCalled();
    }
    expect(dependencies.writer).not.toHaveBeenCalled();
  });
  it('requires the actual assigned provider and matching service', async () => {
    const next = vi.fn();
    await createNarrivaSectionDraftHandler(dependencies)({ ...request(), user: { id: 99, role: 'provider' } }, response(), next);
    expect(next.mock.calls[0][0].status).toBe(403);
    const changed = vi.fn();
    await createNarrivaSectionDraftHandler(dependencies)(request({ serviceCode: '90834' }), response(), changed);
    expect(changed.mock.calls[0][0].status).toBe(409);
    expect(dependencies.writer).not.toHaveBeenCalled();
  });
  it('enforces the treatment-plan block and refuses incomplete model output', async () => {
    dependencies.planEligibility.mockRejectedValueOnce(Object.assign(new Error('Treatment plan missing'), { status: 409 }));
    const blocked = vi.fn();
    await createNarrivaSectionDraftHandler(dependencies)(request(), response(), blocked);
    expect(blocked.mock.calls[0][0].status).toBe(409);
    expect(dependencies.writer).not.toHaveBeenCalled();
    dependencies.writer.mockResolvedValue({ text: 'Plan:\nPartial', finishReason: 'MAX_TOKENS' });
    const incomplete = vi.fn();
    await createNarrivaSectionDraftHandler(dependencies)(request(), response(), incomplete);
    expect(incomplete.mock.calls[0][0].status).toBe(502);
  });
});
