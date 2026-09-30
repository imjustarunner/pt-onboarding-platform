import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ execute: vi.fn(), begin: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), create: vi.fn(), notify: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: async () => ({ execute: mocks.execute, beginTransaction: mocks.begin, commit: mocks.commit, rollback: mocks.rollback, release: mocks.release }) } }));
vi.mock('../../models/Client.model.js', () => ({ default: { create: mocks.create } }));
vi.mock('../../utils/clientCode.js', () => ({ generateUniqueSixDigitClientCode: async () => '123456' }));
vi.mock('../taskNotifications.service.js', () => ({ notifyTaskAddedToList: mocks.notify }));
import { createExchangeReferral, validateExchangeReferral } from '../clientExchangeReferral.service.js';
const args = { agencyId: 2, actor: { id: 7, role: 'provider' }, input: { initials: 'AB', age: 9, diagnoses: 'F41.1', presentingProblem: 'Worry', providerGender: 'female', requestId: '11111111-1111-4111-8111-111111111111' } };
let existing, members;
beforeEach(() => {
  vi.clearAllMocks(); existing = []; members = [{ id: 8 }, { id: 9 }]; mocks.create.mockResolvedValue({ id: 15 }); mocks.notify.mockResolvedValue(undefined);
  mocks.execute.mockImplementation(async sql => {
    if (sql.startsWith('SELECT id FROM agencies')) return [[{ id: 2 }]];
    if (sql.startsWith('SELECT id FROM clients')) return [existing];
    if (sql.startsWith('SELECT DISTINCT u.id')) return [members];
    if (sql.startsWith('SELECT id FROM task_lists')) return [[{ id: 20 }]];
    return [{ insertId: 30, affectedRows: 1 }];
  });
});
it('creates a provider-owned minimum chart and an unassigned support task in one transaction', async () => {
  expect(await createExchangeReferral(args)).toMatchObject({ clientId: 15, taskId: 30 });
  expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({ provider_id: 7, agency_id: 2, initials: 'AB', status: 'PENDING_REVIEW' }), expect.objectContaining({ hydrate: false }));
  const taskInsert = mocks.execute.mock.calls.find(([sql]) => sql.startsWith('INSERT INTO tasks'));
  expect(taskInsert[0]).not.toContain('assigned_to_user_id'); expect(taskInsert[0]).not.toContain('assigned_to_agency_id');
  expect(taskInsert[1]).toEqual([7, 20, '15', expect.stringContaining('client_exchange_setup')]);
  expect(mocks.commit).toHaveBeenCalledOnce();
  expect(mocks.notify).toHaveBeenCalledWith(expect.objectContaining({ task: expect.objectContaining({ id: 30 }), listId: 20 }));
});
it('reuses the chart on retry without creating another chart, task, or notification', async () => {
  existing = [{ id: 15 }]; expect(await createExchangeReferral(args)).toEqual({ clientId: 15, reused: true });
  expect(mocks.create).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
});
it('rolls back both records if task creation fails and never drops the support follow-up', async () => {
  const normal = mocks.execute.getMockImplementation(); mocks.execute.mockImplementation(async (sql, params) => { if (sql.startsWith('INSERT INTO tasks')) throw new Error('Task insert failed'); return normal(sql, params); });
  await expect(createExchangeReferral(args)).rejects.toThrow('Task insert failed'); expect(mocks.rollback).toHaveBeenCalledOnce(); expect(mocks.commit).not.toHaveBeenCalled(); expect(mocks.notify).not.toHaveBeenCalled();
});
it('validates minimal input and refuses to create an orphan referral without a support team', async () => {
  expect(() => validateExchangeReferral({ ...args.input, age: 150 })).toThrow('valid age');
  expect(() => validateExchangeReferral({ ...args.input, initials: '' })).toThrow('initials');
  members = []; await expect(createExchangeReferral(args)).rejects.toThrow('No support'); expect(mocks.create).not.toHaveBeenCalled();
});
