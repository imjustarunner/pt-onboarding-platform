import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import Conversation from '../../models/CommunicationConversation.model.js';
beforeEach(() => { vi.clearAllMocks(); });
describe('conversation persistence', () => {
  it('loads the newest messages and returns them in chronological order', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 202 }, { id: 201 }]]).mockResolvedValueOnce([[]]);
    expect((await Conversation.listMessages(1)).map((m) => m.id)).toEqual([201, 202]);
    expect(pool.execute.mock.calls[0][0]).toContain('ORDER BY m.id DESC');
  });
  it('does not erase an unsent draft when another email arrives', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 2 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await Conversation.addMessage({ conversationId: 1, direction: 'inbound', bodyText: 'A new reply' });
    expect(pool.execute.mock.calls[1][0]).not.toContain('draft_body = NULL');
  });
  it('clears the draft when its outbound message is queued', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 2 }]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    await Conversation.addMessage({ conversationId: 1, direction: 'outbound', bodyText: 'My reply', sendStatus: 'scheduled' });
    expect(pool.execute.mock.calls[1][0]).toContain('draft_body = NULL');
  });
  it('scopes a personal mailbox provider-thread lookup to that mailbox', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    await Conversation.findByExternalThreadId(2, 'gmail-thread', 7);
    expect(pool.execute.mock.calls[0][0]).toContain('AND inbox_id = ?');
    expect(pool.execute.mock.calls[0][1]).toEqual([2, 'gmail-thread', 7]);
  });
  it('does not add another participant row for each reply from the same person', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 8 }]]);
    expect(await Conversation.upsertParticipant(1, { email: 'ALICE@example.org' })).toBe(8);
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute.mock.calls[0][1]).toEqual([1, 'alice@example.org']);
  });
  it('paginates older messages with a stable exclusive ID cursor', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 199 }]]).mockResolvedValueOnce([[]]);
    await Conversation.listMessages(1, { beforeId: 200 });
    expect(pool.execute.mock.calls[0][0]).toContain('AND m.id < 200');
  });
  it('preserves a draft while attachments are still being prepared', async () => {
    pool.execute.mockResolvedValueOnce([{ insertId: 2 }]);
    await Conversation.addMessage({ conversationId: 1, direction: 'outbound', bodyText: 'Draft', sendStatus: 'preparing' });
    expect(pool.execute).toHaveBeenCalledTimes(1);
  });

});
