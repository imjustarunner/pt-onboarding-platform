import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
import { claimSharedTask } from '../taskClaim.service.js';
let task, members;
beforeEach(() => { vi.clearAllMocks(); task = { id: 4, task_type: 'custom', task_list_id: 2, assigned_to_user_id: null, status: 'pending' }; members = [{ role: 'editor' }]; mocks.execute.mockImplementation(async sql => [sql.startsWith('SELECT * FROM tasks') ? [task] : sql.startsWith('SELECT m.role') ? members : { affectedRows: 1 }]); });
it('locks the task, assigns exactly one owner, and audits the claim together', async () => {
  await claimSharedTask({ taskId: 4, userId: 8 });
  expect(mocks.execute.mock.calls[0][0]).toContain('FOR UPDATE');
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE tasks SET assigned_to_user_id'), [8, 4]);
  expect(mocks.execute).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO task_audit_log'), [4, 8, 8, expect.any(String)]);
  expect(mocks.commit).toHaveBeenCalledOnce();
});
it('does not let a later claimant replace the owner and makes same-user retries harmless', async () => {
  task.assigned_to_user_id = 8;
  await expect(claimSharedTask({ taskId: 4, userId: 9 })).rejects.toMatchObject({ status: 409 });
  await claimSharedTask({ taskId: 4, userId: 8 });
  expect(mocks.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('rejects nonmembers, closed tasks, and private tasks', async () => {
  members = []; await expect(claimSharedTask({ taskId: 4, userId: 8 })).rejects.toMatchObject({ status: 403 });
  members = [{ role: 'editor' }]; task.status = 'completed'; await expect(claimSharedTask({ taskId: 4, userId: 8 })).rejects.toMatchObject({ status: 409 });
  task.status = 'pending'; task.is_private = 1; task.assigned_by_user_id = 9; await expect(claimSharedTask({ taskId: 4, userId: 8 })).rejects.toMatchObject({ status: 403 });
});
it('rolls back assignment if the claim audit cannot be written', async () => {
  const normal = mocks.execute.getMockImplementation(); mocks.execute.mockImplementation(async (sql, params) => { if (sql.startsWith('INSERT INTO task_audit_log')) throw new Error('Audit failed'); return normal(sql, params); });
  await expect(claimSharedTask({ taskId: 4, userId: 8 })).rejects.toThrow('Audit failed'); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.commit).not.toHaveBeenCalled();
});
