import { beforeEach, expect, it, vi } from 'vitest';
const h = vi.hoisted(() => ({ execute: vi.fn(), reply: vi.fn(), persist: vi.fn(), modify: vi.fn(), defer: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: h.execute }, onTableWrite: () => {} }));
vi.mock('../unifiedEmail/gmailInboundRetry.js', () => ({ deferredInboundMessages: async () => new Set(), deferInboundMessage: h.defer, clearInboundRetry: vi.fn() }));
vi.mock('../unifiedEmail/gmailLabels.js', () => ({ ensureLabelId: async name => name }));
vi.mock('../../models/EmailSenderIdentity.model.js', () => ({ default: { findByInboundAddress: vi.fn(async () => null), findByFromEmail: vi.fn(async () => null) } }));
vi.mock('../enrollmentFollowupReply.service.js', () => ({ ingestEnrollmentFollowupReply: h.reply }));
vi.mock('../supportTicketEmailInbound.service.js', () => ({ ingestSupportTicketEmail: h.persist }));
vi.mock('../unifiedEmail/gmailClient.js', () => ({ getImpersonatedUser: () => 'ai@example.org', getGmailClient: async () => ({ users: { messages: {
  list: async () => ({ data: { messages: [{ id: 'inbound-1' }] } }), modify: h.modify,
  get: async () => ({ data: { threadId: 'thread-1', payload: { headers: [
    { name: 'From', value: 'family@example.com' }, { name: 'To', value: 'schools@itsco.health' },
    { name: 'Message-ID', value: '<reply-1@example.com>' }, { name: 'In-Reply-To', value: '<outbound@example.com>' },
    { name: 'Authentication-Results', value: 'mx.google.com; dmarc=pass header.from=example.com;' }
  ], body: { data: Buffer.from('Yes, we would like help getting started.').toString('base64url') } } } })
} } }) }));
import { runInboundEmailAgentOnce } from '../unifiedEmail/inboundEmailAgent.service.js';
beforeEach(() => {
  vi.clearAllMocks(); h.execute.mockResolvedValue([[]]);
  h.reply.mockResolvedValue({ matched: true, reopened: true, clientId: 51, agencyId: 2 });
  h.persist.mockResolvedValue({ handled: true, ticketId: 19 });
  h.modify.mockResolvedValue({});
});
it('files a matched family reply against the existing client and skips new-client intake', async () => {
  expect((await runInboundEmailAgentOnce()).inboxDeliveries).toBe(1);
  expect(h.persist).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, fromEmail: 'family@example.com', generateDraft: false, bodyText: 'Yes, we would like help getting started.' }));
  expect(h.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE support_tickets SET client_id'), [51, 19, 2, 51]);
  expect(h.execute.mock.calls.some(([sql]) => /INSERT INTO clients|INSERT INTO users/.test(sql))).toBe(false);
  expect(h.modify).toHaveBeenCalledWith(expect.objectContaining({ requestBody: { addLabelIds: ['AI_PROCESSED', 'AI_NEEDS_HUMAN'] } }));
});
it('leaves a reply queued if inbox persistence fails after reopening', async () => {
  h.persist.mockRejectedValueOnce(new Error('Temporary inbox failure'));
  await runInboundEmailAgentOnce();
  expect(h.modify).not.toHaveBeenCalled();
  expect(h.defer).toHaveBeenCalled();
});
