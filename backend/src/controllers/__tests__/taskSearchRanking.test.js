import { it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
import Task from '../../models/Task.model.js';
import { searchTasksHub } from '../task.controller.js';

it('retains a scoped SQL task-name hit when its privacy-preserving title has no matching letters', async () => {
  vi.spyOn(Task, 'searchHub').mockResolvedValue([{ entity_type: 'task', entity_id: 2488, title: 'Review', subtitle: 'Task #2488', status: 'completed' }]);
  const res = { json: vi.fn() }, next = vi.fn();
  await searchTasksHub({ user: { id: 1434, role: 'support' }, query: { q: 'Zzz', agencyId: '450' } }, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(Task.searchHub).toHaveBeenCalledWith(1434, 'Zzz', { agencyId: 450, canViewAll: true });
  expect(res.json.mock.calls[0][0]).toEqual([expect.objectContaining({ entity_id: 2488, status: 'completed' })]);
});
it('does not fabricate hits for unmatched non-task entities or expand an ordinary actor scope', async () => {
  vi.spyOn(Task, 'searchHub').mockResolvedValue([{ entity_type: 'project', entity_id: 17, title: 'Review', subtitle: '' }]);
  const res = { json: vi.fn() }, next = vi.fn();
  await searchTasksHub({ user: { id: 1465, role: 'school_staff', agency_id: 450 }, query: { q: 'Zzz' } }, res, next);
  expect(Task.searchHub).toHaveBeenCalledWith(1465, 'Zzz', { agencyId: 450, canViewAll: false });
  expect(res.json).toHaveBeenCalledWith([]);
  expect(next).not.toHaveBeenCalled();
});
