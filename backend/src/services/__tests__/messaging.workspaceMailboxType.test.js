import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../googleWorkspaceDirectory.service.js', () => ({ default: { isConfigured: vi.fn(() => true), getUser: vi.fn(), getGroup: vi.fn() } }));
import Directory from '../googleWorkspaceDirectory.service.js';
import { workspaceMailboxType } from '../workspaceMailboxType.service.js';
beforeEach(() => vi.clearAllMocks());
it('recognizes Tatainya’s active Workspace mailbox independently of password login', async () => {
  Directory.getUser.mockResolvedValue({ primaryEmail: 'thughes@itsco.health', suspended: false });
  expect(await workspaceMailboxType('thughes@itsco.health')).toBe('user');
  expect(Directory.getGroup).not.toHaveBeenCalled();
});
it('recognizes a legacy Group even without the app group-login flag', async () => {
  Directory.getUser.mockResolvedValue(null);
  Directory.getGroup.mockResolvedValue({ email: 'group@itsco.health' });
  expect(await workspaceMailboxType('group@itsco.health')).toBe('group');
});
it('handles Google’s userKey error for group addresses', async () => {
  Directory.getUser.mockRejectedValue(Object.assign(new Error('Type not supported: userKey'), { code: 400 }));
  Directory.getGroup.mockResolvedValue({ email: 'newgroup@itsco.health' });
  expect(await workspaceMailboxType('newgroup@itsco.health')).toBe('group');
});
it('rejects suspended users and retries lookup failures instead of guessing group routing', async () => {
  Directory.getUser.mockRejectedValueOnce(Object.assign(new Error('Unavailable'), { code: 503 }));
  await expect(workspaceMailboxType('unavailable@itsco.health')).rejects.toThrow('Unavailable');
  Directory.getUser.mockResolvedValueOnce({ suspended: true });
  await expect(workspaceMailboxType('unavailable@itsco.health')).rejects.toThrow('work mailbox is unavailable');
  expect(Directory.getUser).toHaveBeenCalledTimes(2);
});
it('coalesces concurrent lookups and refreshes after a mailbox becomes a group', async () => {
  vi.useFakeTimers();
  try {
    Directory.getUser.mockResolvedValue({ suspended: false });
    expect(await Promise.all([workspaceMailboxType('transition@itsco.health'), workspaceMailboxType('transition@itsco.health')])).toEqual(['user', 'user']);
    expect(Directory.getUser).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(61_000);
    Directory.getUser.mockResolvedValue(null);
    Directory.getGroup.mockResolvedValue({ email: 'transition@itsco.health' });
    expect(await workspaceMailboxType('transition@itsco.health')).toBe('group');
  } finally { vi.useRealTimers(); }
});
