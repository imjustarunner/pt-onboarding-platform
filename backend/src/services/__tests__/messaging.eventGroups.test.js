import { beforeEach, describe, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ execute: vi.fn(), list: vi.fn(), prune: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.execute } }));
vi.mock('../companyEventConversation.service.js', () => ({ pruneUserCompanyEventConversations: m.prune }));
vi.mock('../communicationDirectory.service.js', () => ({ searchCommunicationDirectory: vi.fn(async () => []), listCommunicationDirectoryByKind: vi.fn(async () => []) }));
vi.mock('../personalMailbox.service.js', () => ({ findPersonalInbox: vi.fn(async () => null) }));
vi.mock('../secureMessagingPolicy.service.js', () => ({ shouldDefaultToSecureMessage: () => false }));
vi.mock('../unifiedInbox.service.js', () => ({ composeNewEmail: vi.fn(), listConversations: m.list }));
vi.mock('../../controllers/chat.controller.js', () => ({ findOrCreateDirectThread: vi.fn(), findExistingDirectThreadBetweenUsers: vi.fn() }));
vi.mock('../chatEncryption.service.js', () => ({ decryptChatText: vi.fn(), isChatEncryptionConfigured: () => false }));
vi.mock('../hubMessageQueue.service.js', () => ({ listHubQueuedForPerson: vi.fn() }));
vi.mock('../familySecureMessageAccess.service.js', () => ({ familyMessageVisibilitySql: () => '1=1', currentSecureThreadFilterSql: async () => '1=1' }));
import { listHubConversationFeed, getStartConversationDirectory, countHubChatUnreadThreads } from '../messagesHub.service.js';

const group = { thread_id: 41, agency_id: 2, thread_type: 'group', message_channel: 'internal', company_event_id: 12,
  channel_name: 'Second anniversary · Event conversation', last_message_id: 100, last_message_body: 'Let’s plan the celebration.', last_message_at: '2026-11-11T20:00:00Z', unread_count: 1 };
const channel = { ...group, thread_id: 42, thread_type: 'channel', company_event_id: null, channel_name: 'Staff announcements' };
beforeEach(() => {
  vi.clearAllMocks(); m.list.mockResolvedValue([]); m.prune.mockResolvedValue();
  m.execute.mockImplementation(async sql => sql.includes('SELECT t.id AS thread_id') ? [[group, channel]] : [[]]);
});

describe('company event conversations in the desktop Messages Hub', () => {
  it('shows the named internal group under Direct while keeping announcement channels out', async () => {
    const feed = await listHubConversationFeed({ agencyId: 3, userId: 7, channel: 'internal' });
    expect(feed.items).toHaveLength(1);
    expect(feed.items[0]).toMatchObject({ threadId: 41, displayName: group.channel_name, isGroupDirect: true, channel: 'group', agencyId: 2, preview: group.last_message_body });
    expect(feed.counts).toMatchObject({ total: 1, chat: 1, unread: 1 });
    expect(m.prune).toHaveBeenCalledWith(7);
    expect(m.prune.mock.invocationCallOrder[0]).toBeLessThan(m.execute.mock.invocationCallOrder[0]);
  });
  it.each(['group', 'groups'])('keeps the same named conversation visible in %s', async filter => {
    const feed = await listHubConversationFeed({ agencyId: 3, userId: 7, channel: filter });
    expect(feed.items.map(item => item.threadId)).toEqual([41, 42]);
    expect(feed.items.find(item => item.threadId === 41).displayName).toBe(group.channel_name);
  });
  it('retains participant authorization while including an invited group hosted by another agency', async () => {
    await listHubConversationFeed({ agencyId: 3, userId: 7, channel: 'internal' });
    const [sql, args] = m.execute.mock.calls.find(([sql]) => sql.includes('SELECT t.id AS thread_id'));
    expect(sql).toContain('JOIN chat_thread_participants tp ON tp.thread_id = t.id AND tp.user_id = ?');
    expect(sql).toContain("AND (t.agency_id = ? OR (t.thread_type='group' AND t.company_event_id IS NOT NULL AND t.message_channel='internal'))");
    expect(args.at(-1)).toBe(3);
  });
  it('includes a cross-agency invited group in the start-conversation directory', async () => {
    m.execute.mockImplementation(async sql => sql.includes('COUNT(DISTINCT p.user_id) AS member_count') ? [[{ id: 41, name: group.channel_name, agency_id: 2, thread_type: 'group', member_count: 5 }]] : [[]]);
    const directory = await getStartConversationDirectory({ agencyId: 3, userId: 7, viewerRole: 'provider' });
    expect(directory.sections.groups).toEqual([expect.objectContaining({ groupId: 41, displayName: group.channel_name, agencyId: 2 })]);
    const [sql, args] = m.execute.mock.calls.find(([sql]) => sql.includes('COUNT(DISTINCT p.user_id) AS member_count'));
    expect(sql).toContain('me.thread_id = t.id AND me.user_id = ?');
    expect(sql).toContain("OR (t.thread_type='group' AND t.company_event_id IS NOT NULL AND t.message_channel='internal')");
    expect(args).toEqual([7, 3]);
    expect(m.prune).toHaveBeenCalledWith(7);
    expect(m.execute.mock.calls.some(([sql]) => /^\s*(INSERT|UPDATE|DELETE)\b/.test(sql))).toBe(false);
  });
  it('refreshes event invitation access before computing unread badges', async () => {
    m.execute.mockResolvedValue([[{ channel: 'group', n: 1 }]]);
    expect(await countHubChatUnreadThreads({ agencyId: 3, userId: 7, byChannel: true })).toEqual({ group: 1 });
    expect(m.prune).toHaveBeenCalledWith(7);
    expect(m.prune.mock.invocationCallOrder[0]).toBeLessThan(m.execute.mock.invocationCallOrder[0]);
  });
  it('does not expose names or previews when current event access cannot be verified', async () => {
    m.prune.mockRejectedValue(Object.assign(new Error('Access refresh unavailable'), { status: 503 }));
    await expect(listHubConversationFeed({ agencyId: 3, userId: 7, channel: 'internal' })).rejects.toMatchObject({ status: 503 });
    expect(m.list).not.toHaveBeenCalled(); expect(m.execute).not.toHaveBeenCalled();
  });
});
