import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../communicationAccess.service.js', () => ({ requireConversationAccess: vi.fn() }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { listMessages: vi.fn() } }));
vi.mock('../unifiedInbox.service.js', () => ({ getConversationDetail: vi.fn(), replyToConversation: vi.fn(), composeNewEmail: vi.fn(), undoOutboundMessage: vi.fn() }));
vi.mock('../personalMailbox.service.js', () => ({ findPersonalInbox: vi.fn(), ensurePersonalMailbox: vi.fn() }));
vi.mock('../communicationAttachments.service.js', () => ({ downloadCommunicationAttachment: vi.fn() }));
vi.mock('../hubMessageReactions.service.js', () => ({ listMessageReactions: vi.fn(async () => new Map()), reactToHubMessage: vi.fn() }));
import { requireConversationAccess } from '../communicationAccess.service.js';
import Conversation from '../../models/CommunicationConversation.model.js';
import { getConversationDetail, replyToConversation, composeNewEmail } from '../unifiedInbox.service.js';
import { findPersonalInbox } from '../personalMailbox.service.js';
import { getQuickConversation, postQuickReply, postQuickCompose, getQuickAttachment } from '../../controllers/quickViewMessaging.controller.js';
import { downloadCommunicationAttachment } from '../communicationAttachments.service.js';
const req = () => ({ quickView: { userId: 5, agencyId: 2 }, params: { id: '10' }, query: {}, body: {} });
const res = () => ({ status: vi.fn().mockReturnThis(), json: vi.fn() });
beforeEach(() => { vi.clearAllMocks(); requireConversationAccess.mockResolvedValue({ id: 10, agency_id: 2, channel: 'email' }); findPersonalInbox.mockResolvedValue({ id: 7 }); });
it('QV replies use the shared email service with Reply all, recipients, attachments, and undo', async () => {
  const r = req(); r.body = { mode: 'reply_all', text: 'Reply', to: 'a@example.org', cc: 'b@example.org', attachments: [{ filename: 'a.txt' }] };
  await postQuickReply(r, res(), vi.fn());
  expect(requireConversationAccess).toHaveBeenCalledWith({ id: 5, role: 'provider' }, '10');
  expect(replyToConversation).toHaveBeenCalledWith(10, expect.objectContaining({ ...r.body, undoDelaySeconds: 20 }), { userId: 5 });
});
it('new QV group email uses the staff mailbox and preserves CC/BCC', async () => {
  const r = req(); r.body = { to: 'a@example.org, b@example.org', cc: 'c@example.org', bcc: 'private@example.org', text: 'Group mail' };
  await postQuickCompose(r, res(), vi.fn());
  expect(composeNewEmail).toHaveBeenCalledWith(expect.objectContaining({ agencyId: 2, userId: 5, inboxId: 7, payload: expect.objectContaining(r.body) }));
});
it('older pages use the stable message cursor without marking new mail read', async () => {
  getConversationDetail.mockResolvedValue({ conversation: { id: 10, channel: 'email' }, messages: [] });
  Conversation.listMessages.mockResolvedValue([{ id: 4 }]);
  const r = req(); r.query.beforeId = '5'; const response = res();
  await getQuickConversation(r, response, vi.fn());
  expect(getConversationDetail).toHaveBeenCalledWith('10', { userId: 5, markRead: false });
  expect(Conversation.listMessages).toHaveBeenCalledWith('10', { beforeId: 5 });
  expect(response.json).toHaveBeenCalledWith(expect.objectContaining({ messages: [expect.objectContaining({ id: 4 })] }));
});
it('denies file downloads before touching storage when conversation access is denied', async () => {
  requireConversationAccess.mockRejectedValueOnce(Object.assign(new Error('Not found'), { status: 404 }));
  const response = res(); await getQuickAttachment(req(), response, vi.fn());
  expect(response.status).toHaveBeenCalledWith(404);
  expect(downloadCommunicationAttachment).not.toHaveBeenCalled();
});
