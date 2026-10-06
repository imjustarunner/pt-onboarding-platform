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
