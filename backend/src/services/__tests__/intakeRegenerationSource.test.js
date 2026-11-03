import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ gemini: vi.fn(), update: vi.fn(), client: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../models/Client.model.js', () => ({ default: { findById: mocks.client } }));
vi.mock('../../models/ClientIntakeNoteDraft.model.js', () => ({ default: { updateContent: mocks.update } }));
vi.mock('../geminiText.service.js', () => ({ callGeminiText: mocks.gemini }));
vi.mock('../clinicalNoteCrypto.service.js', () => ({ maybeDecryptNotePayload: value => value, maybeEncryptNotePayload: value => value }));
vi.mock('../clientPhiNames.service.js', () => ({ collectClientPhiNames: vi.fn(async () => ['Synthetic Person']) }));
import { regenerateIntakeDraftFromAddendum } from '../intakePacketBootstrap.service.js';
const draft = { id: 1, client_id: 2304, status: 'ready', tool_id: 'clinical_90791_intake_plan', scrubbed_input_enc: 'Guardian reports sleep concerns.', note_body_enc: 'UNSUPPORTED_OLD_GENERATED_MSE', suggested_dx_json: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.client.mockResolvedValue({ id: 2304, full_name: 'Synthetic Person' });
  mocks.gemini.mockResolvedValue({ text: 'Mental Status Examination: Not observed in the source.\nRisk Assessment: Not assessed.\nDiagnosis: R69 — Unspecified illness', modelName: 'mock' });
  mocks.update.mockImplementation(async data => ({ ...draft, ...data }));
});
it('regenerates from source and scrubbed clinician additions, never from previous generated claims', async () => {
  await regenerateIntakeDraftFromAddendum({ draft, addendum: 'Synthetic Person: do not infer any observed behavior.' });
  const prompt = mocks.gemini.mock.calls[0][0].prompt;
  expect(prompt).toContain('Guardian reports sleep concerns.');
  expect(prompt).toContain('do not infer any observed behavior.');
  expect(prompt).not.toContain('UNSUPPORTED_OLD_GENERATED_MSE');
  expect(prompt).not.toContain('Synthetic Person');
  const saved = mocks.update.mock.calls[0][0];
  expect(saved.scrubbedInputEnc).toContain('Guardian reports sleep concerns.');
  expect(saved.scrubbedInputEnc).toContain('do not infer any observed behavior.');
  expect(saved.scrubbedInputEnc).not.toContain('Synthetic Person');
});
it('does not regenerate or overwrite finalized source content', async () => {
  await expect(regenerateIntakeDraftFromAddendum({ draft: { ...draft, status: 'final' }, addendum: 'Change it' })).rejects.toThrow('Cannot regenerate a finalized intake note');
  expect(mocks.gemini).not.toHaveBeenCalled();
  expect(mocks.update).not.toHaveBeenCalled();
});
