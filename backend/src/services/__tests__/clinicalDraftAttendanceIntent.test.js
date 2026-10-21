import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ execute: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: database }));
import ClinicalNoteDraft from '../../models/ClinicalNoteDraft.model.js';
import { maybeEncryptNotePayload } from '../clinicalNoteCrypto.service.js';
import { hasAuthoredDraftChange } from '../clinicalDraftAttendanceIntent.js';

const inputText = 'Client practiced grounding during the session.';
const body = { attendanceIntent: 'authored_session_draft', inputText };
beforeEach(() => {
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32).toString('base64'));
  database.execute.mockReset();
});
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

it('rejects replay of unchanged encrypted pre-end content after session end', () => {
  const previousDraft = { input_text: maybeEncryptNotePayload(inputText) };
  expect(hasAuthoredDraftChange({ body, draft: { id: 1 }, previousDraft })).toBe(false);
  expect(hasAuthoredDraftChange({ body: { ...body, inputText: `  ${inputText}\n` }, draft: { id: 1 }, previousDraft })).toBe(false);
});
it('accepts a genuinely changed authored draft compared with its decrypted prior value', () => {
  const previousDraft = { input_text: maybeEncryptNotePayload('We discussed coping skills.') };
  expect(hasAuthoredDraftChange({ body, draft: { id: 1 }, previousDraft })).toBe(true);
});
it.each([
  { inputText },
  { attendanceIntent: 'authored_session_draft' },
  { ...body, inputText: ' \n ' },
  { ...body, inputText: '---' },
  { ...body, inputText: { template: 'not authored input' } }
])('rejects hydration, metadata-only, and non-authored content (%j)', (request) => {
  expect(hasAuthoredDraftChange({ body: request, draft: { _createdForThisRequest: true }, previousDraft: { input_text: '' } })).toBe(false);
});
it('does not treat an unreadable previous encrypted value as proof of authorship', () => {
  expect(hasAuthoredDraftChange({ body, draft: { id: 1 }, previousDraft: { input_text: '{"_enc":true,"ciphertext":"invalid"}' } })).toBe(false);
});
it('marks only a true model insert as fresh, without exposing the marker in JSON or object spreads', async () => {
  vi.spyOn(ClinicalNoteDraft, 'findReusableOpen').mockResolvedValue(null);
  vi.spyOn(ClinicalNoteDraft, 'findByIdForUser').mockResolvedValue({ id: 90, input_text: maybeEncryptNotePayload(inputText) });
  database.execute.mockResolvedValue([{ insertId: 90 }]);
  const draft = await ClinicalNoteDraft.create({ userId: 45, inputText });
  expect(hasAuthoredDraftChange({ body, draft })).toBe(true);
  expect({ ...draft }).not.toHaveProperty('_createdForThisRequest');
  expect(JSON.parse(JSON.stringify(draft))).not.toHaveProperty('_createdForThisRequest');
});
it.each([false, true])('reused create requests cannot claim fresh attendance even if metadata changes (patch=%s)', async (patch) => {
  const reusable = { id: 90, input_text: maybeEncryptNotePayload(inputText) };
  vi.spyOn(ClinicalNoteDraft, 'findReusableOpen').mockResolvedValue(reusable);
  vi.spyOn(ClinicalNoteDraft, 'updateForUser').mockResolvedValue({ ...reusable, office_event_id: 80 });
  const draft = await ClinicalNoteDraft.create({ userId: 45, inputText, ...(patch ? { officeEventId: 80 } : {}) });
  expect(hasAuthoredDraftChange({ body, draft })).toBe(false);
  expect(database.execute).not.toHaveBeenCalled();
});
