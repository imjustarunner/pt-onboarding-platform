import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: {
  findById: vi.fn(), findMessageById: vi.fn(), listParticipants: vi.fn(), listMessages: vi.fn(), addMessage: vi.fn(async () => 50), update: vi.fn(), updateMessage: vi.fn(), upsertParticipant: vi.fn(), create: vi.fn()
} }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../communicationAttachments.service.js', () => ({ persistOutboundAttachments: vi.fn(), loadOutboundAttachments: vi.fn(async () => []) }));
import { persistOutboundAttachments, loadOutboundAttachments } from '../communicationAttachments.service.js';
vi.mock('../unifiedEmail/unifiedEmailSender.service.js', () => ({ sendEmailFromIdentity: vi.fn() }));
vi.mock('../ticketEmailInboxAdapter.service.js', () => ({}));
vi.mock('../channelInboxAdapter.service.js', () => ({}));
vi.mock('../unifiedInboxAi.service.js', () => ({}));
vi.mock('../clinicalSmsSend.service.js', () => ({}));
vi.mock('../availabilityWindow.service.js', () => ({ resolveSchedulePresetAt: vi.fn() }));
vi.mock('../emailSendMailbox.service.js', () => ({ resolveEmailSendMailbox: vi.fn(async () => ({
  identity: { id: 7 }, inbox: { id: 3 }, fromEmail: 'messages@itsco.health', replyTo: 'messages@itsco.health', displayName: 'Messages'
})) }));
vi.mock('../../models/UserCommunicationContact.model.js', () => ({ default: { upsertSafe: vi.fn() } }));
import Conversation from '../../models/CommunicationConversation.model.js';
import Inbox from '../../models/CommunicationInbox.model.js';
import { sendEmailFromIdentity } from '../unifiedEmail/unifiedEmailSender.service.js';
import pool from '../../config/database.js';
import { replyToConversation, composeNewEmail, undoOutboundMessage } from '../unifiedInbox.service.js';
const parent = { direction: 'outbound', internet_message_id: '<outbound@itsco.health>', to: [{ email: 'alice@example.org' }], cc: [], references_header: '<root@example.org>' };
beforeEach(() => {
  vi.clearAllMocks();
  Conversation.findById.mockResolvedValue({ id: 1, channel: 'email', agency_id: 2, inbox_id: 3, subject: 'Help' });
  Conversation.create.mockResolvedValue({ id: 2, channel: 'email', agency_id: 2, inbox_id: 3 });
  Conversation.listParticipants.mockResolvedValue([{ email: 'original@example.org', is_primary: 1 }]);
  Conversation.listMessages.mockResolvedValue([parent]);
  Inbox.findById.mockResolvedValue({ id: 3, sender_identity_id: 7, from_email: 'messages@itsco.health' });
  sendEmailFromIdentity.mockResolvedValue({ id: 'gmail-id', internetMessageId: '<new@itsco.health>', threadId: 'gmail-thread' });
});
describe('email sending', () => {
  it('persists reply headers during the undo delay, including outbound-only threads', async () => {
    await replyToConversation(1, { text: 'Following up' }, { userId: 5 });
    expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({ to: [{ email: 'alice@example.org', name: null }], inReplyTo: '<outbound@itsco.health>', referencesHeader: '<root@example.org> <outbound@itsco.health>', sendStatus: 'preparing' }));
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it('uses RFC message IDs for replies while retaining the Gmail thread ID', async () => {
    await replyToConversation(1, { text: 'Following up', undoDelaySeconds: 0 }, { userId: 5 });
    expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ inReplyTo: '<outbound@itsco.health>', references: '<root@example.org> <outbound@itsco.health>' }));
    expect(Conversation.updateMessage).toHaveBeenCalledWith(50, expect.objectContaining({ sendStatus: 'sent', internetMessageId: '<new@itsco.health>' }));
    expect(Conversation.update).toHaveBeenCalledWith(1, { externalThreadId: 'gmail-thread' });
  });
  it('honors an explicitly cleared CC list in reply-all', async () => {
    Conversation.listMessages.mockResolvedValue([{ ...parent, direction: 'inbound', from: { email: 'alice@example.org' }, cc: [{ email: 'removed@example.org' }] }]);
    await replyToConversation(1, { text: 'Hello', mode: 'reply_all', cc: '' }, { userId: 5 });
    expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({ cc: [] }));
  });
  it('registers all visible group recipients without exposing BCC', async () => {
    await composeNewEmail({ agencyId: 2, inboxId: 3, userId: 5, payload: { to: 'a@example.org, b@example.org', cc: 'c@example.org', bcc: 'private@example.org', text: 'Group email' } });
    expect(Conversation.upsertParticipant.mock.calls.map(([, p]) => p.email)).toEqual(['a@example.org', 'b@example.org', 'c@example.org']);
    expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({ bcc: [{ email: 'private@example.org', name: null }] }));
  });
  it('does not label an approval-held email as sent', async () => {
    sendEmailFromIdentity.mockResolvedValue({ queued: true, pendingApproval: true });
    await expect(replyToConversation(1, { text: 'Hello', undoDelaySeconds: 0 }, { userId: 5 })).rejects.toThrow('awaiting approval');
    expect(Conversation.updateMessage).toHaveBeenCalledWith(50, { sendStatus: 'failed' });
  });
  it('forwards into a new conversation with quoted content and no inherited recipients or headers', async () => {
    Conversation.listMessages.mockResolvedValue([{ ...parent, body_text: 'Original content' }]);
    const result = await replyToConversation(1, { text: 'Please review', mode: 'forward', to: 'new@example.org' }, { userId: 5 });
    expect(result.forwardedConversationId).toBe(2);
    expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({ conversationId: 2, to: [{ email: 'new@example.org', name: null }], bodyText: expect.stringContaining('Original content') }));
    expect(Conversation.addMessage.mock.calls[0][0].inReplyTo).toBeUndefined();
    expect(Conversation.upsertParticipant.mock.calls.map(([, p]) => p.email)).toEqual(['new@example.org']);
  });
  it('does not release a scheduled email until every attachment is durable', async () => {
    persistOutboundAttachments.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(replyToConversation(1, { text: 'Hello', attachments: [{ filename: 'a.txt', contentBase64: 'YQ==' }] }, { userId: 5 })).rejects.toThrow('Storage unavailable');
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
    expect(Conversation.updateMessage).not.toHaveBeenCalledWith(50, { sendStatus: 'scheduled' });
    expect(Conversation.updateMessage).toHaveBeenCalledWith(50, { sendStatus: 'failed' });
  });
  it('does not send an immediate email when attachment storage fails', async () => {
    persistOutboundAttachments.mockRejectedValueOnce(new Error('Storage unavailable'));
    await expect(replyToConversation(1, { text: 'Hello', skipUndo: true, attachments: [{}] }, { userId: 5 })).rejects.toThrow('Storage unavailable');
    expect(sendEmailFromIdentity).not.toHaveBeenCalled();
  });
  it('forwards the source attachments along with new attachments', async () => {
    const source = { filename: 'original.txt', contentBase64: 'YQ==' };
    loadOutboundAttachments.mockResolvedValueOnce([source]);
    await replyToConversation(1, { text: 'FYI', mode: 'forward', to: 'new@example.org' }, { userId: 5 });
    expect(persistOutboundAttachments).toHaveBeenCalledWith(50, [source]);
  });

});

it('does not report undo success after the delivery worker has claimed a message', async () => {
  Conversation.findMessageById.mockResolvedValue({ id: 50, conversation_id: 1, author_user_id: 5, direction: 'outbound', send_status: 'scheduled' });
  pool.execute.mockResolvedValueOnce([{ affectedRows: 0 }]);
  await expect(undoOutboundMessage(1, 50, { userId: 5 })).rejects.toThrow('Delivery has started');
});
it('does not let another mailbox member undo someone else’s send', async () => {
  Conversation.findMessageById.mockResolvedValue({ id: 50, conversation_id: 1, author_user_id: 6, direction: 'outbound', send_status: 'scheduled' });
  await expect(undoOutboundMessage(1, 50, { userId: 5 })).rejects.toThrow('Only the sender');
});
