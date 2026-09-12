import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import { reactToHubMessage } from '../hubMessageReactions.service.js';
const base = { agencyId: 2, userId: 5, conversationId: 40, messageId: 12, notifyEmail: false };
beforeEach(() => { vi.clearAllMocks(); });
describe('message reactions', () => {
  it('requires the clicked message rather than silently liking the latest', async () => {
    await expect(reactToHubMessage({ ...base, messageId: null })).rejects.toMatchObject({ status: 400 });
    expect(pool.execute).not.toHaveBeenCalled();
  });
  it('rejects an inaccessible or mismatched message before any write', async () => {
    pool.execute.mockResolvedValueOnce([[]]);
    await expect(reactToHubMessage(base)).rejects.toMatchObject({ status: 404 });
    expect(pool.execute).toHaveBeenCalledTimes(1);
    expect(pool.execute.mock.calls[0][1]).toEqual([12, 40, 2, 5, 5, 5]);
  });
  it('returns persistent counts and whether this user liked the message', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 12, agency_id: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }])
      .mockResolvedValueOnce([[{ message_id: 12, emoji: '❤️', count: 3, reacted_by_me: 1 }]]);
    expect(await reactToHubMessage(base)).toMatchObject({ reactions: [{ emoji: '❤️', count: 3, reactedByMe: true }] });
    expect(pool.execute.mock.calls[1][1]).toEqual([12, 40, 5, '❤️']);
  });
  it('removes only this user’s like on this message', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 12, agency_id: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 1 }]).mockResolvedValueOnce([[]]);
    expect(await reactToHubMessage({ ...base, active: false })).toMatchObject({ active: false, reactions: [] });
    expect(pool.execute.mock.calls[1][0]).toContain('DELETE');
    expect(pool.execute.mock.calls[1][1]).toEqual([12, 40, 5, '❤️']);
  });
  it('does not resend a notification on an idempotent like retry', async () => {
    pool.execute.mockResolvedValueOnce([[{ id: 12, agency_id: 2 }]])
      .mockResolvedValueOnce([{ affectedRows: 0 }]).mockResolvedValueOnce([[]]);
    await reactToHubMessage({ ...base, notifyEmail: true });
    expect(pool.execute).toHaveBeenCalledTimes(3);
  });
});
