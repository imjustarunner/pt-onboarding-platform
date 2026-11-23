vi.mock('../afterHoursEmailPolicy.service.js', () => ({ usesAppEmailAvailability: vi.fn(async () => false) }));
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]), getConnection: vi.fn() } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: {
  findById: vi.fn(), findMessageById: vi.fn(), listParticipants: vi.fn(), listMessages: vi.fn(), addMessage: vi.fn(async () => 50), update: vi.fn(), updateMessage: vi.fn(), upsertParticipant: vi.fn(), create: vi.fn()
} }));
vi.mock('../../models/CommunicationInbox.model.js', () => ({ default: { findById: vi.fn() } }));
vi.mock('../communicationAttachments.service.js', () => ({ persistOutboundAttachments: vi.fn(), loadOutboundAttachments: vi.fn(async () => []) }));
vi.mock('../emailDeliveryChoice.service.js', () => ({ planEmailDelivery: vi.fn(), recordEmailDeliveryChoice: vi.fn() }));
import { planEmailDelivery, recordEmailDeliveryChoice } from '../emailDeliveryChoice.service.js';
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
import { resolveEmailSendMailbox } from '../emailSendMailbox.service.js';
vi.mock('../clientRecordAccess.service.js', () => ({ resolveClientRecordAccess: vi.fn() }));
import * as clientRecords from '../clientConversationRecord.service.js';
import * as clientAccess from '../clientRecordAccess.service.js';
const parent = { direction: 'outbound', internet_message_id: '<outbound@itsco.health>', to: [{ email: 'alice@example.org' }], cc: [], references_header: '<root@example.org>' };
beforeEach(() => {
  vi.clearAllMocks();
  resolveEmailSendMailbox.mockResolvedValue({ identity: { id: 7 }, inbox: { id: 3 }, fromEmail: 'messages@itsco.health', replyTo: 'messages@itsco.health', displayName: 'Messages' });
  Conversation.findById.mockResolvedValue({ id: 1, channel: 'email', agency_id: 2, inbox_id: 3, subject: 'Help' });
  Conversation.create.mockResolvedValue({ id: 2, channel: 'email', agency_id: 2, inbox_id: 3 });
  Conversation.listParticipants.mockResolvedValue([{ email: 'original@example.org', is_primary: 1 }]);
  Conversation.listMessages.mockResolvedValue([parent]);
  Inbox.findById.mockResolvedValue({ id: 3, sender_identity_id: 7, from_email: 'messages@itsco.health' });
  sendEmailFromIdentity.mockResolvedValue({ id: 'gmail-id', internetMessageId: '<new@itsco.health>', threadId: 'gmail-thread' });
});
describe('email sending', () => {
  it.each([{ clientIds: [41, 42], legacyClientId: null }, { clientIds: [41], legacyClientId: 41 }])('keeps immediate-send legacy logs scoped to $clientIds', async ({ clientIds, legacyClientId }) => {
    const filing = vi.spyOn(clientRecords, 'resolveEmailClientFiling').mockResolvedValueOnce({ clientIds, deferred: false });
    const access = vi.spyOn(clientAccess, 'resolveClientRecordAccess').mockResolvedValueOnce({ ok: true, client: { agency_id: 2 } });
    try {
      await composeNewEmail({ agencyId: 2, inboxId: 3, userId: 5, payload: {
        to: 'parent@example.org', text: 'Family update', skipUndo: true, clientId: 41, clientIds
      } });
      expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ clientId: legacyClientId }));
    } finally { filing.mockRestore(); access.mockRestore(); }
  });
  it.each(['new', 'reply', 'reply_all', 'forward'])('preserves the SSO work Reply-To and staff signature author for %s', async mode => {
    resolveEmailSendMailbox.mockResolvedValue({ identity: { id: 8 }, inbox: { id: 3 }, fromEmail: 'messages@itsco.health', replyTo: 'thughes@itsco.health', displayName: 'Tatainya Hughes' });
    const payload = { text: 'Hello', html: '<p>Hello</p>', to: 'client@example.org', skipUndo: true, mode };
    if (mode === 'new') await composeNewEmail({ agencyId: 2, inboxId: 3, userId: 5, payload });
    else await replyToConversation(1, payload, { userId: 5 });
    expect(sendEmailFromIdentity).toHaveBeenCalledWith(expect.objectContaining({ senderIdentityId: 8, replyToOverride: 'thughes@itsco.health', generatedByUserId: 5, source: 'manual', templateType: 'hub_email', html: expect.stringContaining('Hello') }));
    expect(Conversation.addMessage).toHaveBeenCalledWith(expect.objectContaining({ from: expect.objectContaining({ email: 'messages@itsco.health', replyTo: 'thughes@itsco.health' }) }));
  });
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

it('persists the explicit availability choice before releasing the undo queue', async () => {
 const plan={choice:'now',recipientIds:[6],scheduledAt:null};
 planEmailDelivery.mockResolvedValue(plan);
 await replyToConversation(1,{text:'Hello',availabilityChoiceRequired:true,deliveryChoice:'now'},{userId:5});
 expect(recordEmailDeliveryChoice).toHaveBeenCalledWith(50,5,plan);
 const stored=recordEmailDeliveryChoice.mock.invocationCallOrder[0];
 const queued=Conversation.updateMessage.mock.invocationCallOrder[0];
 expect(stored).toBeLessThan(queued);
});
it('schedules the chosen next availability and preserves a later explicit schedule', async () => {
 const next='2030-10-01T13:00:00.000Z';
 planEmailDelivery.mockResolvedValue({choice:'next_available',recipientIds:[6],scheduledAt:next});
 const first=await replyToConversation(1,{text:'Hello',availabilityChoiceRequired:true,deliveryChoice:'next_available'},{userId:5});
 expect(new Date(first.scheduledSendAt).toISOString()).toBe(next);
 const later='2030-10-02T13:00:00.000Z';
 const second=await replyToConversation(1,{text:'Hello',availabilityChoiceRequired:true,deliveryChoice:'now',scheduledSendAt:later},{userId:5});
 expect(new Date(second.scheduledSendAt).toISOString()).toBe(later);
});
it('does not create a message or conversation before the sender chooses',async()=>{
 planEmailDelivery.mockRejectedValueOnce(Object.assign(new Error('Choose delivery'),{status:409}));
 await expect(composeNewEmail({agencyId:2,inboxId:3,userId:5,payload:{to:'a@example.org',text:'Hello',availabilityChoiceRequired:true}})).rejects.toMatchObject({status:409});
 expect(Conversation.create).not.toHaveBeenCalled();expect(Conversation.addMessage).not.toHaveBeenCalled();
});


describe('blind caseload email', () => {
  const clients = [
    { id: 21, agency_id: 2, agency_name: 'Test practice' },
    { id: 22, agency_id: 2, agency_name: 'Test practice' },
    { id: 23, agency_id: 2, agency_name: 'Test practice' },
    { id: 24, agency_id: 2, agency_name: 'Test practice' }
  ];
  const draft = { id: 'bulk', agency_id: 2, version: 1, draft: { _myClients: true, subject: 'Schedule update', text: 'Please watch for an update.', undoDelaySeconds: 20 } };

  it('deduplicates authorized household addresses, commits separate scheduled Bcc messages and rolls back a raced Undo', async () => {
    const { cancellationRecipients } = await import('../cancellationRecipients.service.js');
    const { caseloadEmailAudience, queueCaseloadEmail, cancelCaseloadEmail, validateQueuedCaseloadRecipient } = await import('../caseloadEmail.service.js');
    const review = vi.spyOn(cancellationRecipients, 'review').mockImplementation(async id => ({
      recipients: [{ email: id <= 22 ? 'household@sample.org' : id === 23 ? 'second@sample.org' : 'restricted@sample.org' }]
    }));
    const permitted = vi.spyOn(cancellationRecipients, 'permitted').mockImplementation(async id => id !== 24);
    try {
      pool.execute.mockImplementation(async sql => {
        if (sql.includes('FROM clients c JOIN agencies')) return [clients];
        if (sql.includes('FROM agencies WHERE id=')) return [[{ id: 2, slug: 'practice', is_active: 1, organization_type: 'agency' }]];
        return [[]];
      });
      const { summary } = await caseloadEmailAudience(5, 2);
      expect(summary).toMatchObject({ total: 4, count: 2, missing: 1 });
      await expect(queueCaseloadEmail({ actor: { id: 5 }, draft, version: 1, fingerprint: 'changed' })).rejects.toMatchObject({ code: 'CASELOAD_EMAIL_CHANGED' });
      expect(pool.getConnection).not.toHaveBeenCalled();

      const db = {
        execute: vi.fn(async sql => [{ affectedRows: sql.includes("SET send_status = 'scheduled'") ? 2 : 1 }]),
        beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn()
      };
      pool.getConnection.mockResolvedValue(db);
      Conversation.addMessage.mockResolvedValueOnce(50).mockResolvedValueOnce(51);
      const receipt = await queueCaseloadEmail({ actor: { id: 5 }, draft, version: 1, fingerprint: summary.fingerprint });
      expect(receipt).toMatchObject({ batchCount: 2, scheduled: true, sent: false });
      expect(Conversation.addMessage.mock.calls.map(([message, executor]) => [message.bcc, message.to, executor === db])).toEqual([
        [[{ email: 'household@sample.org' }], undefined, true],
        [[{ email: 'second@sample.org' }], undefined, true]
      ]);
      expect(sendEmailFromIdentity).not.toHaveBeenCalled();
      expect(db.commit).toHaveBeenCalledTimes(1);
      await expect(cancelCaseloadEmail({ id: 5 }, { ...draft, state: 'sent', result: { messageIds: [50, 51] } })).rejects.toMatchObject({ status: 409 });
      expect(db.rollback).toHaveBeenCalledTimes(1);
      await expect(validateQueuedCaseloadRecipient({ agencyId: 2, userId: 5, to: [], cc: [], bcc: [{ email: 'previous@sample.org' }], clientIds: [21] })).rejects.toMatchObject({ status: 409 });
    } finally {
      pool.execute.mockImplementation(async () => [[]]);
      review.mockRestore();
      permitted.mockRestore();
    }
  });

  it('writes no client address into To or Cc in the MIME delivered by the blind route', async () => {
    const { blindClientEmailEnvelope, buildMimeMessage } = await import('../unifiedEmail/mime.js');
    const mime = buildMimeMessage({
      from: 'Messages <messages@sample.org>', subject: 'Schedule update',
      ...blindClientEmailEnvelope({ to: 'client@sample.org', bcc: 'provider@sample.org' })
    });
    expect(mime).toContain('To: undisclosed-recipients:;');
    expect(mime).toContain('Bcc: client@sample.org, provider@sample.org');
    expect(mime).not.toContain('Cc:');
    expect(() => blindClientEmailEnvelope({ to: 'client@sample.org, other@sample.org' })).toThrow();
  });
});
