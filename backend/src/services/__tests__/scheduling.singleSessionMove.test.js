import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../officeMoveEmail.service.js', () => ({ queueOfficeMoveReceipt: vi.fn() }));
vi.mock('../officeRoomAllocation.service.js', () => ({ pendingOfficeWindows: vi.fn().mockResolvedValue([]), overlappingRequest: vi.fn() }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { moveOfficeSessionOccurrence } from '../officeSessionMove.service.js';
let conn, targets;
const input = { eventId: 18, newRoomId: 10, startAt: '2099-01-08 00:00:00', endAt: '2099-01-08 01:00:00', timeZone: 'America/Denver', actorUserId: 501, requireOwnReservation: true };
beforeEach(() => {
  vi.clearAllMocks();
  targets = [{ id: 90, room_id: 10, status: 'BOOKED', assigned_provider_id: 501, booked_provider_id: 501, start_at: input.startAt, end_at: input.endAt }];
  conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.startsWith('SELECT * FROM office_events WHERE id')) return [[{ id: 18, room_id: 7, office_location_id: 3, assigned_provider_id: 501, booked_provider_id: 501, status: 'BOOKED',
      standing_assignment_id: 9, booking_plan_id: 8, start_at: '2099-01-06 00:00:00', end_at: '2099-01-06 01:00:00' }]];
    if (sql.startsWith('SELECT id, status FROM appointments')) return [[{ id: 18141, status: 'scheduled' }]];
    if (sql.startsWith('SELECT e.*')) return [targets];
    if (sql.startsWith('SELECT skipped_dates_json')) return [[{ skipped_dates_json: '[]' }]];
    return [[]];
  }) };
  pool.getConnection.mockResolvedValue(conn); clinicalPool.execute.mockResolvedValue([[]]);
});
it('uses an empty booked room, detaches one occurrence and keeps the original appointment and session IDs', async () => {
  expect(await moveOfficeSessionOccurrence(input)).toEqual([18]);
  expect(conn.commit).toHaveBeenCalledOnce();
  const queries = conn.execute.mock.calls.map(([sql]) => sql);
  expect(queries.some(sql => /standing_assignment_id = NULL, booking_plan_id = NULL/.test(sql))).toBe(true);
  expect(queries.some(sql => /p.recurrence_series_id = NULL/.test(sql))).toBe(true);
  expect(queries.some(sql => /INSERT INTO appointments|DELETE FROM|INSERT INTO clinical_sessions/.test(sql))).toBe(false);
  expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('skipped_dates_json = ?'), [JSON.stringify(['2099-01-05']), 8]);
});
it('retains the unused parts of a longer destination reservation', async () => {
  targets[0].start_at = '2099-01-07 23:00:00'; targets[0].end_at = '2099-01-08 02:00:00';
  await moveOfficeSessionOccurrence(input);
  const inserts = conn.execute.mock.calls.filter(([sql]) => sql.includes('INSERT INTO office_events') && !sql.includes("'CANCELLED'"));
  expect(inserts).toHaveLength(2);
  expect(inserts[0][1].slice(2, 4)).toEqual(['2099-01-07 23:00:00', input.startAt]);
  expect(inserts[1][1].slice(2, 4)).toEqual([input.endAt, '2099-01-08 02:00:00']);
});
it('rolls back before any writes when another session occupies the destination', async () => {
  targets[0].has_appointment = 1;
  await expect(moveOfficeSessionOccurrence(input)).rejects.toThrow('occupied');
  expect(conn.rollback).toHaveBeenCalledOnce(); expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
});
it('rechecks ownership inside the transaction before moving without room approval', async () => {
  targets = [];
  await expect(moveOfficeSessionOccurrence(input)).rejects.toThrow('reservation changed');
  expect(conn.commit).not.toHaveBeenCalled();
});
