import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { getMessagePulse, recordMessageViews } from '../chatPulse.controller.js';

const request = (extra = {}) => ({ user: { id: 7, role: 'provider' }, params: { threadId: '10', messageId: '20' }, body: { messageIds: [20, 21] }, ...extra });
async function invoke(handler, req = request()) {
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn(), set: vi.fn() }, next = vi.fn();
  await handler(req, res, next);
  return { res, next };
}
beforeEach(() => { vi.resetAllMocks(); });

describe('shared Conversa Pulse', () => {
  it.each([getMessagePulse, recordMessageViews])('denies outsiders before reading activity or writing views', async handler => {
    pool.execute.mockResolvedValueOnce([[]]);
    const { next } = await invoke(handler);
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
    expect(pool.execute).toHaveBeenCalledTimes(1);
    const [sql, params] = pool.execute.mock.calls[0];
    expect(sql).toContain('p.user_id = ?');
    expect(sql).toContain("t.message_channel = 'internal'");
    expect(sql).toContain("'direct', 'group', 'channel', 'team', 'club'");
    expect(params).toEqual([7, 10]);
  });
  it('allows ordinary recipients to see a bounded payload without contacts, content, or private bookmarks', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 10 }]])
      .mockResolvedValueOnce([[{ id: 20, sender_user_id: 8, created_at: '2026-11-04T12:00:00Z' }]])
      .mockResolvedValueOnce([[
        { user_id: 7, first_name: 'Alex', last_name: 'Rivera', first_seen_at: '2026-11-04T12:01:00Z', email: 'private@example.com' },
        { user_id: 9, first_name: 'Sam', last_name: 'Lee', first_seen_at: null }
      ]]).mockResolvedValueOnce([[{ count: '2' }]])
      .mockResolvedValueOnce([[{ code: '👍', count: '3' }, { code: '❤️', count: '1' }]]);
    const { res, next } = await invoke(getMessagePulse);
    expect(next).not.toHaveBeenCalled();
    expect(res.set).toHaveBeenCalledWith('Cache-Control', 'no-store');
    expect(res.json).toHaveBeenCalledWith({
      messageId: 20, sentAt: '2026-11-04T12:00:00Z', recipientCount: 2, seenCount: 1,
      noViewRecordedCount: 1, replyCount: 2, reactionCount: 4,
      reactions: [{ code: '👍', count: 3 }, { code: '❤️', count: 1 }],
      recipients: [{ userId: 7, name: 'Alex Rivera', firstSeenAt: '2026-11-04T12:01:00Z' }, { userId: 9, name: 'Sam Lee', firstSeenAt: null }]
    });
    // Current members only, excluding the original sender, regardless of viewer.
    expect(pool.execute.mock.calls[2][1]).toEqual([20, 10, 8]);
    expect(pool.execute.mock.calls.some(([sql]) => sql.includes('chat_thread_reads'))).toBe(false);
  });
  it('does not expose a hidden message or one belonging to another conversation', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 10 }]]).mockResolvedValueOnce([[]]);
    const { res } = await invoke(getMessagePulse);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(pool.execute).toHaveBeenCalledTimes(2);
    expect(pool.execute.mock.calls[1][0]).toContain('m.thread_id = ? AND d.message_id IS NULL');
    expect(pool.execute.mock.calls[1][1]).toEqual([7, 20, 10]);
  });
  it('records only the authenticated viewer, preserves first view, and constrains message ownership and visibility', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 10 }]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
    const { res, next } = await invoke(recordMessageViews, request({ body: { messageIds: [20, '20', 21], userId: 99, firstSeenAt: '2000-01-01' } }));
    expect(next).not.toHaveBeenCalled(); expect(res.json).toHaveBeenCalledWith({ ok: true });
    const [sql, params] = pool.execute.mock.calls[1];
    expect(sql).toContain('INSERT IGNORE');
    expect(sql).toContain('p.user_id = ?');
    expect(sql).toContain('m.thread_id = ?');
    expect(sql).toContain('m.sender_user_id <> ? AND d.message_id IS NULL');
    expect(params).toEqual([7, 7, 7, 10, 20, 21, 7]);
    expect(sql).not.toContain('chat_thread_reads');
  });
  it.each([[], [0], [-1], ['1 OR 1=1'], [1.5], [true], [[1]], Array(201).fill(1)].map(messageIds => ({ messageIds })))('rejects invalid batches before database access: $messageIds', async ({ messageIds }) => {
    const { res } = await invoke(recordMessageViews, request({ body: { messageIds } }));
    expect(res.status).toHaveBeenCalledWith(400); expect(pool.execute).not.toHaveBeenCalled();
  });
  it.each(['0', '-1', '20garbage', '1.5'])('rejects invalid message IDs: %s', async messageId => {
    const { res } = await invoke(getMessagePulse, request({ params: { threadId: '10', messageId } }));
    expect(res.status).toHaveBeenCalledWith(400); expect(pool.execute).not.toHaveBeenCalled();
  });
});
