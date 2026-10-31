import { beforeEach, afterEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Agency.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: vi.fn(), findById: vi.fn() } }));
vi.mock('../../services/geminiText.service.js', () => ({ callGeminiText: vi.fn() }));
vi.mock('../../services/schoolSupportReplyLibrary.service.js', () => ({
  buildReplyLibraryPromptBlock: () => '', inferIntentFromTicket: () => 'general',
  matchReplyLibraryForTicket: vi.fn(async () => []), promoteTicketAnswerToLibrary: vi.fn(),
  recordReplyLibraryUsage: vi.fn(), summarizeLibrarySources: () => []
}));
vi.mock('../../services/schoolSupportReplyLearning.service.js', () => ({
  buildAgencyPromptGuardrailsBlock: async () => '', createProposalFromEditedAnswer: vi.fn(),
  createPromptNoteFromRejection: vi.fn(), listActivePromptNotes: async () => []
}));
vi.mock('../../services/schoolSupportDraftSources.service.js', () => ({ persistTicketDraftSources: vi.fn() }));
import pool from '../../config/database.js';
import Agency from '../../models/Agency.model.js';
import User from '../../models/User.model.js';
import { callGeminiText } from '../../services/geminiText.service.js';
import { prepareEncryptedTicketText } from '../../utils/supportTicketCrypto.js';
import { generateSupportTicketResponse } from '../supportTickets.controller.js';

let ticket, messages;
const response = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
const request = (role = 'super_admin') => ({ user: { id: 20, role }, params: { id: '551' }, body: {} });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 7).toString('base64'));
  const question = prepareEncryptedTicketText('When was the student seen and by whom?');
  const reply = prepareEncryptedTicketText('Please check the Thursday schedule.');
  ticket = { id: 551, agency_id: 450, school_organization_id: 451, source_channel: 'portal',
    subject: 'Appointment question', question: question.plain, question_ciphertext: question.ciphertext,
    question_iv: question.iv, question_auth_tag: question.authTag, question_encryption_key_id: question.keyId,
    created_by_first_name: 'Jamie', created_by_last_name: 'QA', status: 'open', claimed_by_user_id: null };
  messages = [{ id: 1, author_first_name: 'Jamie', body: reply.plain, body_ciphertext: reply.ciphertext,
    body_iv: reply.iv, body_auth_tag: reply.authTag, encryption_key_id: reply.keyId }];
  Agency.findById.mockResolvedValue({ id: 451, organization_type: 'school' });
  User.getAgencies.mockResolvedValue([]);
  pool.execute.mockImplementation(async (sql) => {
    if (sql.includes('SELECT t.*') && sql.includes('WHERE t.id = ?')) return [[ticket]];
    if (sql.includes('information_schema')) return [[{ cnt: 1 }]];
    if (sql.includes('SELECT m.*')) return [messages];
    return [[]];
  });
  callGeminiText.mockResolvedValue({ text: 'We will review the Thursday schedule with the provider.', modelName: 'test', provider: 'vertex' });
});
afterEach(() => vi.unstubAllEnvs());

it('drafts from decrypted portal questions and thread messages after access checks, preserving ticket ownership', async () => {
  const res = response(), next = vi.fn();
  await generateSupportTicketResponse(request(), res, next);
  expect(next).not.toHaveBeenCalled();
  expect(callGeminiText).toHaveBeenCalledWith(expect.objectContaining({
    prompt: expect.stringContaining('When was the student seen and by whom?'), sensitive: true, vertexOnly: true
  }));
  expect(callGeminiText.mock.calls[0][0].prompt).toContain('Please check the Thursday schedule.');
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ suggestedAnswer: 'We will review the Thursday schedule with the provider.' }));
  expect(pool.execute.mock.calls.some(([sql]) => /SET\s+(?:claimed_by_user_id|status)/i.test(sql))).toBe(false);
});

it('does not call the model for a wrong organization or unauthorized role', async () => {
  const res = response();
  await generateSupportTicketResponse(request('school_staff'), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(403);
  expect(callGeminiText).not.toHaveBeenCalled();
  const denied = response();
  Agency.findById.mockResolvedValue(null);
  await generateSupportTicketResponse(request(), denied, vi.fn());
  expect(denied.status).toHaveBeenCalledWith(404);
  expect(callGeminiText).not.toHaveBeenCalled();
});

it('stops before generation when the encrypted received message cannot be read', async () => {
  vi.stubEnv('CLIENT_CHAT_ENCRYPTION_KEY_BASE64', Buffer.alloc(32, 8).toString('base64'));
  const res = response();
  await generateSupportTicketResponse(request(), res, vi.fn());
  expect(res.status).toHaveBeenCalledWith(503);
  expect(callGeminiText).not.toHaveBeenCalled();
});

it.each(['Thanks, [Your Name/Support Team]', 'Your message appears to be empty.'])('rejects invalid drafts before persistence: %s', async text => {
  callGeminiText.mockResolvedValue({ text });
  const res = response();
  await generateSupportTicketResponse(request(), res, vi.fn());
  expect(callGeminiText).toHaveBeenCalledTimes(2);
  expect(res.status).toHaveBeenCalledWith(422);
  expect(pool.execute.mock.calls.some(([sql]) => sql.includes('SET ai_draft_response'))).toBe(false);
});
