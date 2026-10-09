import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), list: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: mocks.execute } }));
vi.mock('../../models/CommunicationConversation.model.js', () => ({ default: { list: mocks.list } }));
vi.mock('../hubMessageReactions.service.js', () => ({ listMessageReactions: vi.fn() }));
vi.mock('../communicationDirectory.service.js', () => ({ searchCommunicationDirectory: vi.fn(), listCommunicationDirectoryByKind: vi.fn() }));
vi.mock('../personalMailbox.service.js', () => ({ findPersonalInbox: vi.fn(), ensurePersonalMailbox: vi.fn() }));
vi.mock('../secureMessagingPolicy.service.js', () => ({ shouldDefaultToSecureMessage: vi.fn() }));
vi.mock('../unifiedInbox.service.js', () => ({ composeNewEmail: vi.fn() }));
vi.mock('../../controllers/chat.controller.js', () => ({ findOrCreateDirectThread: vi.fn(), findExistingDirectThreadBetweenUsers: vi.fn() }));
vi.mock('../chatEncryption.service.js', () => ({ decryptChatText: vi.fn(), isChatEncryptionConfigured: () => false }));
vi.mock('../hubMessageQueue.service.js', () => ({ listHubQueuedForPerson: vi.fn() }));
import { listHubConversationFeed } from '../messagesHub.service.js';
beforeEach(() => { vi.clearAllMocks(); mocks.execute.mockResolvedValue([[]]); });
describe('hub sender matches the displayed preview', () => {
  it.each([['inbox', 'Latest author'], ['unread', 'External author']])('%s uses its message author while preserving thread participants', async (mode, expected) => {
    mocks.list.mockResolvedValue([{
      id: 4, channel: 'email', is_unread: true,
      primary_participant_name: 'Original participant', primary_participant_email: 'original@example.com',
      last_sender_json: JSON.stringify({ name: 'Latest author', email: 'latest@example.com' }),
      last_inbound_sender_json: JSON.stringify({ name: 'External author', email: 'external@example.com' }),
      last_message_preview: 'Latest reply', last_inbound_preview: 'External reply'
    }]);
    const feed = await listHubConversationFeed({ agencyId: 2, userId: 1, mode });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ latestSenderName: expected, primaryEmail: 'original@example.com', displayName: 'Original participant' });
    expect(feed.items[0].preview).toBe(mode === 'unread' ? 'External reply' : 'Latest reply');
  });
});

it('uses the outgoing recipient avatar without changing the message author; unread uses the inbound author', async () => {
  mocks.list.mockResolvedValue([{
    id: 4, channel: 'email', is_unread: true,
    primary_participant_name: 'Haley', primary_participant_email: 'haley@example.com',
    last_message_direction: 'outbound',
    last_sender_json: { name: 'Michael', email: 'messages@example.com' },
    last_inbound_sender_json: { name: 'Haley', email: 'haley@example.com' }
  }]);
  mocks.execute.mockImplementation(async sql => /SELECT LOWER\(email\)/.test(sql)
    ? [[{ email: 'haley@example.com', profile_photo_path: '/uploads/haley.png' }]] : [[]]);
  const inbox = await listHubConversationFeed({ agencyId: 2, userId: 1, mode: 'inbox' });
  expect(inbox.items[0]).toMatchObject({ latestSenderName: 'Michael', latestMessageDirection: 'outbound', displayName: 'Haley' });
  expect(inbox.items[0].photoUrl).toContain('haley.png');
  const unread = await listHubConversationFeed({ agencyId: 2, userId: 1, mode: 'unread' });
  expect(unread.items[0]).toMatchObject({ latestSenderName: 'Haley', latestMessageDirection: 'inbound' });
});

it('reports email-load failures instead of returning an empty unread inbox', async () => {
  mocks.list.mockRejectedValueOnce(Object.assign(new Error('Database unavailable'), { code: 'ECONNRESET' }));
  await expect(listHubConversationFeed({ agencyId: 2, userId: 1, channel: 'email', mode: 'unread' })).rejects.toMatchObject({ status: 503 });
});

it('queries both calls and voicemails before pagination and retains them in the Calls tab', async () => {
  mocks.list.mockResolvedValue([
    { id: 5, channel: 'call', is_unread: true, subject: 'Missed call' },
    { id: 6, channel: 'voicemail', is_unread: true, subject: 'Voicemail' }
  ]);
  const feed = await listHubConversationFeed({ agencyId: 2, userId: 1, channel: 'calls', mode: 'unread' });
  expect(mocks.list).toHaveBeenCalledWith(expect.objectContaining({ channel: 'call', filter: 'unread', scopeToUserId: 1 }));
  expect(feed.items.map(item => item.channel)).toEqual(['call', 'voicemail']);
  expect(feed.counts.unread).toBe(2);
});

it.each(['sms', 'calls'])('reports %s loading failures instead of saying no saved conversations', async channel => {
  mocks.list.mockRejectedValueOnce(new Error('Database unavailable'));
  await expect(listHubConversationFeed({ agencyId: 2, userId: 1, channel })).rejects.toMatchObject({ status: 503 });
});
