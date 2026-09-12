import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: {
  addMessage: vi.fn(), upsertParticipant: vi.fn(), findById: vi.fn()
} }));
vi.mock('../inboundEmailPersistence.service.js', () => ({ persistInboundEmail: vi.fn() }));
vi.mock('../communicationAttachments.service.js', () => ({ prepareInboundAttachments: vi.fn(async () => []) }));
import { persistInboundEmail } from '../inboundEmailPersistence.service.js';
import pool from '../../config/database.js';
import Conversation from '../../models/CommunicationConversation.model.js';
import { ingestHubEmailReply } from '../hubEmailInbound.service.js';

const base = {
  agencyId: 2, identity: { id: 7, agency_id: 2, identity_key: 'messages', from_email: 'messages@itsco.health' },
  fromEmail: 'support@itsco.health', subject: 'Re: Help', bodyText: 'A reply',
  toAddresses: ['messages@itsco.health'], ccAddresses: ['colleague@example.org'],
  messageIdHeader: '<incoming@example.org>'
};
beforeEach(() => { vi.resetAllMocks(); pool.execute.mockResolvedValue([[]]); Conversation.findById.mockResolvedValue({ id: 42, inbox_id: 3 }); persistInboundEmail.mockResolvedValue({ ingested: true, conversationId: 42 }); });
describe('shared mailbox reply routing', () => {
  it('does not join a conversation just because a group address sent another email', async () => {
    expect(await ingestHubEmailReply(base)).toMatchObject({ ingested: false });
    expect(pool.execute).not.toHaveBeenCalled();
    expect(Conversation.addMessage).not.toHaveBeenCalled();
  });
  it('routes by exact parent ID and preserves group recipients', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 42, agency_id: 2 }]]);
    expect(await ingestHubEmailReply({ ...base, inReplyTo: '<original@example.org>' })).toMatchObject({ conversationId: 42 });
    expect(pool.execute.mock.calls[0][1]).toEqual([2, 7, '<original@example.org>']);
    expect(persistInboundEmail).toHaveBeenCalledWith(expect.objectContaining({
      conversationId: 42, cc: [{ email: 'colleague@example.org' }], deliveryId: '<incoming@example.org>'
    }));
  });
  it('finds the nearest known ancestor when the immediate parent is unavailable', async () => {
    pool.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([[{ id: 41, agency_id: 2 }]]);
    await ingestHubEmailReply({ ...base, inReplyTo: '<missing@example.org>', referencesHeader: '<root@example.org> <known@example.org>' });
    expect(pool.execute.mock.calls[1][1]).toEqual([2, 7, '<known@example.org>']);
  });
  it('acknowledges an already ingested delivery without adding a duplicate', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 42, agency_id: 2 }]]);
    persistInboundEmail.mockResolvedValueOnce({ ingested: true, duplicate: true });
    expect(await ingestHubEmailReply({ ...base, inReplyTo: '<original@example.org>' })).toMatchObject({ ingested: true, duplicate: true });
    expect(Conversation.addMessage).not.toHaveBeenCalled();
  });
  it('refuses ambiguous shared-mailbox matches', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 1 }, { id: 2 }]]);
    expect(await ingestHubEmailReply({ ...base, inReplyTo: '<original@example.org>' })).toMatchObject({ ingested: false });
    expect(Conversation.addMessage).not.toHaveBeenCalled();
  });
  it('does not accept a reply token for another tenant', async () => {
    pool.execute.mockResolvedValueOnce([[{ agency_id: 3, conversation_id: 99 }]]);
    const result = await ingestHubEmailReply({ ...base, toAddresses: ['messages+1234567890abcdef@itsco.health'] });
    expect(result.ingested).toBe(false);
    expect(Conversation.addMessage).not.toHaveBeenCalled();
  });
});
