import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {}, onTableWrite: () => {} }));
import { createProviderUpdateTasks, assertProviderUpdateTaskStatus, providerUpdateTaskStatus } from '../providerUpdateTasks.service.js';

let recipients, tasks, connection, service;
beforeEach(() => {
  recipients = [{ id: 73, push_id: 5, provider_user_id: 524, agency_id: 2, agency_name: 'ITSCO',
    slug: 'itsco', push_title: 'October update', created_by_user_id: 501, token: 'personal-test-link',
    eligible: 1, status: 'in_progress' }];
  tasks = [];
  connection = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql, args) => {
      if (sql.includes('AS eligible')) return [recipients.filter(r => r.provider_user_id === args[0])];
      if (sql.startsWith('SELECT id,status FROM tasks')) return [tasks.filter(t => t.recipientId === Number(args[1]))];
      if (sql.startsWith('INSERT INTO tasks')) {
        const id = tasks.length + 100;
        tasks.push({ id, status: args[2], recipientId: Number(args[7]) });
        return [{ insertId: id }];
      }
      if (sql.startsWith('UPDATE tasks SET status=?')) { tasks.find(t => t.id === args[2]).status = args[0]; return [{ affectedRows: 1 }]; }
      if (sql.startsWith('SELECT * FROM provider_update_recipients')) return [recipients.filter(r => r.id === args[0] && r.agency_id === args[1] && r.push_id === args[2]).map(r => ({ ...r }))];
      if (sql.startsWith("UPDATE provider_update_recipients SET status='withdrawn'")) { recipients[0].status = 'withdrawn'; recipients[0].eligible = 0; }
      return [{ affectedRows: 1 }];
    })
  };
  service = createProviderUpdateTasks({ db: { getConnection: async () => connection } });
});

it('creates a private, required task with the recipient personal link once, including repeated login/task requests', async () => {
  const first = await service.syncUser(524);
  const again = await service.syncUser(524);
  expect(tasks).toHaveLength(1);
  expect(first[0]).toMatchObject({ recipientId: 73, taskId: 100, agencyName: 'ITSCO', link: 'https://app.itsco.health/provider-update/personal-test-link' });
  expect(again[0].taskId).toBe(100);
  expect(connection.execute.mock.calls.filter(([sql]) => sql.startsWith('INSERT INTO task_links'))).toHaveLength(1);
  expect(connection.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO tasks'))[0]).toContain("1,1,'high'");
  expect(connection.execute.mock.calls.find(([sql]) => sql.includes('AS eligible'))[0]).toContain('FOR UPDATE');
});
it('scopes reminders and task creation to the signed-in user', async () => {
  expect(await service.syncUser(999)).toEqual([]);
  expect(tasks).toHaveLength(0);
});
it.each(['withdrawn', 'finalized'])('does not assign a task or show a reminder for %s recipients', async status => {
  recipients[0] = { ...recipients[0], eligible: 0, status };
  expect(await service.syncUser(524)).toEqual([]);
  expect(tasks).toHaveLength(0);
});
it('stops reminders and closes the existing task when the real update is finalized', async () => {
  await service.syncUser(524);
  Object.assign(recipients[0], { eligible: 0, status: 'finalized', finalized_at: new Date(), locked_at: new Date() });
  expect(await service.syncUser(524)).toEqual([]);
  expect(tasks[0].status).toBe('completed');
});
it('keeps untouched assignments pending and never describes withdrawal as completion', () => {
  expect(providerUpdateTaskStatus({ status: 'not_started', eligible: 1 })).toBe('pending');
  expect(providerUpdateTaskStatus({ status: 'withdrawn', eligible: 0 })).toBe('overridden');
});
it('repairs a manually closed task while the update itself is still unfinished', async () => {
  await service.syncUser(524);
  tasks[0].status = 'completed';
  await service.syncUser(524);
  expect(tasks[0].status).toBe('in_progress');
});
it('records withdrawal without deleting answers, finalizing the update, or creating payroll claims', async () => {
  await service.withdraw({ recipientId: 73, agencyId: 2, pushId: 5, actorUserId: 501, reason: 'Leaving the organization; remove from this update.' });
  expect(recipients[0].status).toBe('withdrawn');
  expect(connection.execute).toHaveBeenCalledWith(expect.stringContaining("'admin_withdrawn'"), [73, expect.stringContaining('"priorStatus":"in_progress"')]);
  expect(connection.execute.mock.calls.some(([sql]) => /DELETE|payroll_time_claims|UPDATE provider_update_section_progress/.test(sql))).toBe(false);
  expect(connection.commit).toHaveBeenCalledOnce();
});
it('rejects another agency and refuses to withdraw an already completed update', async () => {
  await expect(service.withdraw({ recipientId: 73, agencyId: 3, pushId: 5, actorUserId: 501, reason: 'Leaving' })).rejects.toMatchObject({ status: 404 });
  recipients[0].status = 'finalized';
  await expect(service.withdraw({ recipientId: 73, agencyId: 2, pushId: 5, actorUserId: 501, reason: 'Leaving' })).rejects.toMatchObject({ status: 409 });
  expect(connection.commit).not.toHaveBeenCalled();
});
it('requires a real final submission before allowing the task to be checked off', async () => {
  const db = { execute: vi.fn(async () => [[{ status: 'in_progress' }]]) };
  await expect(assertProviderUpdateTaskStatus(100, 'completed', db)).rejects.toMatchObject({ status: 409 });
  db.execute.mockResolvedValue([[{ status: 'finalized', finalized_at: new Date(), locked_at: new Date() }]]);
  await expect(assertProviderUpdateTaskStatus(100, 'completed', db)).resolves.toBeUndefined();
  db.execute.mockResolvedValue([[]]);
  await expect(assertProviderUpdateTaskStatus(100, 'completed', db)).resolves.toBeUndefined();
});
