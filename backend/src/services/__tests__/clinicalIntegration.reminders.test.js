import { expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: {} }));
import { preferenceReminderRows, reconcilePreferenceReminderRows, refreshClientSessionNotifications } from '../sessionPreferenceSchedule.service.js';
import { withSessionSchedulingLock } from '../sessionSchedulingLock.service.js';
const now = Date.parse('2026-11-02T12:00:00Z');
const delivery = { kind: 'standard_reminder', channel: 'email', ruleKey: 'tenant:1', recipientClientId: 21, recipientGuardianUserId: 10, offsetMinutes: 1440 };
const plan = { appointment: { id: 8, agencyId: 377, startAt: '2026-11-29 18:00:00' }, deliveries: [delivery] };
const options = { clientId: 21, guardianUserId: 10, now };
it('updates only future, consent-filtered deliveries for this recipient; excludes confirmations and provider notices', () => {
  const deliveries = [delivery, { ...delivery, recipientGuardianUserId: 11 }, { ...delivery, recipientClientId: 22 },
    { ...delivery, recipientAffiliationId: 5 }, { ...delivery, recipientRole: 'provider' },
    { ...delivery, kind: 'confirmation' }, { ...delivery, sendImmediately: true }, { ...delivery, offsetMinutes: 1000000 }];
  expect(preferenceReminderRows({ ...plan, deliveries }, options)).toEqual([expect.objectContaining({ channel: 'email', scheduled_for: '2026-11-28 18:00:00' })]);
  expect(preferenceReminderRows({ ...plan, deliveries: [] }, options)).toEqual([]);
});
it('keeps one pending row on repeated saves and never replays a sent or failed reminder', () => {
  const desired = preferenceReminderRows(plan, options);
  const current = [{ ...desired[0], id: 1, status: 'pending' }, { ...desired[0], id: 2, status: 'pending' }];
  expect(reconcilePreferenceReminderRows(current, desired)).toMatchObject({ updates: [{ id: 1 }], inserts: [], cancelIds: [2] });
  for (const status of ['sent', 'failed', 'skipped']) expect(reconcilePreferenceReminderRows([{ ...current[0], status }], desired)).toEqual({ updates: [], inserts: [], cancelIds: [] });
  expect(reconcilePreferenceReminderRows(current, [])).toMatchObject({ inserts: [], updates: [], cancelIds: [1, 2] });
});
function database(existing = []) {
  const connection = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('GET_LOCK')) return [[{ acquired: 1 }]];
    if (sql.includes('recipient_guardian_user_id IS NULL')) return [[]];
    if (sql.startsWith('SELECT * FROM appointment_reminders')) return [existing];
    return [{ affectedRows: 1 }];
  }) };
  const db = { execute: vi.fn().mockResolvedValue([[{ id: 8 }]]), getConnection: vi.fn().mockResolvedValue(connection) };
  return { db, connection };
}
it('materializes a missing schedule using the exact tenant, client, guardian and UTC due time', async () => {
  const { db, connection } = database();
  await refreshClientSessionNotifications(377, 21, 10, { db, getPlan: async () => plan, now: () => now });
  expect(db.execute.mock.calls[0][1]).toEqual([377, 21]);
  const [sql, args] = connection.execute.mock.calls.find(([sql]) => sql.includes('INSERT INTO appointment_reminders'));
  expect(sql).toContain('recipient_guardian_user_id,recipient_client_id');
  expect(args.slice(0, 5)).toEqual([8, 377, 'email', 'standard_reminder', 'tenant:1']);
  expect(args.slice(-3)).toEqual(['2026-11-28 18:00:00', 10, 21]);
  expect(connection.commit).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledOnce();
});
it('does not mutate an appointment returned with a different tenant', async () => {
  const { db, connection } = database();
  await refreshClientSessionNotifications(377, 21, 10, { db, getPlan: async () => ({ ...plan, appointment: { ...plan.appointment, agencyId: 378 } }) });
  expect(connection.beginTransaction).not.toHaveBeenCalled();
  expect(connection.execute.mock.calls.filter(([sql]) => /^(UPDATE|INSERT)/.test(sql))).toEqual([]);
  expect(connection.release).toHaveBeenCalledOnce();
});
it('rolls back a queue failure and reports that saved choices need a retry', async () => {
  const { db, connection } = database();
  const original = connection.execute.getMockImplementation();
  connection.execute.mockImplementation(async (sql, args) => {
    if (sql.includes('INSERT INTO')) throw new Error('write failure');
    return original(sql, args);
  });
  await expect(refreshClientSessionNotifications(377, 21, 10, { db, getPlan: async () => plan, now: () => now })).rejects.toMatchObject({ code: 'REMINDER_PREFERENCES_SYNC_FAILED', status: 503 });
  expect(connection.rollback).toHaveBeenCalledOnce();
  expect(connection.release).toHaveBeenCalledOnce();
});
it('booking uses the same lock as preferences and releases it after a failure', async () => {
  const { db, connection } = database();
  await expect(withSessionSchedulingLock(8, async () => { throw new Error('failed'); }, { db })).rejects.toThrow('failed');
  expect(connection.execute).toHaveBeenCalledWith('SELECT GET_LOCK(?, 5) AS acquired', ['session_schedule:8']);
  expect(connection.execute).toHaveBeenCalledWith('SELECT RELEASE_LOCK(?)', ['session_schedule:8']);
  expect(connection.release).toHaveBeenCalledOnce();
});
