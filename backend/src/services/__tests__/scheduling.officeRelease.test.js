import { beforeEach, it, expect, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn() } }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
import pool from '../../config/database.js';
import clinicalPool from '../../config/clinicalDatabase.js';
import { releaseOfficeReservation } from '../officeReservationRelease.service.js';
let conn, event, assignment, appointments;
const input = { officeLocationId: 1, eventId: 20, actorUserId: 9 };
beforeEach(() => {
 event = { id: 20, office_location_id: 1, room_id: 2, standing_assignment_id: 10, assigned_provider_id: 9, booked_provider_id: 9, start_at: '2099-07-03 23:00:00', end_at: '2099-07-04 00:00:00' };
 assignment = { id: 10, office_location_id: 1, room_id: 2, provider_id: 9, weekday: 5, hour: 17 };
 appointments = [];
 clinicalPool.execute.mockResolvedValue([[]]);
 conn = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
   if (sql.startsWith('SELECT * FROM office_events')) return [[event]];
   if (sql.startsWith('SELECT * FROM office_standing')) return [[assignment]];
   if (sql.startsWith('SELECT timezone')) return [[{ timezone: 'America/Denver' }]];
   if (sql.startsWith('SELECT id FROM appointments')) return [appointments];
   if (sql.startsWith('SELECT id, skipped_dates')) return [[{ id: 3, skipped_dates_json: '[]' }]];
   return [{ affectedRows: 1 }];
 }) };
 pool.getConnection.mockResolvedValue(conn);
});
it('releases one evening in local time without deleting or deactivating its assignment', async () => {
 await releaseOfficeReservation(input);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET skipped_dates_json'), ['["2099-07-03"]', 3]);
 expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('DELETE') || sql.startsWith('UPDATE office_standing'))).toBe(false);
 expect(conn.commit).toHaveBeenCalledOnce();
});
it('unbooks one occurrence and retains recurring booking and assignment', async () => {
 await releaseOfficeReservation({ ...input, keepAssigned: true });
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE office_events SET status'), ['RELEASED', 'ASSIGNED_AVAILABLE', 20]);
 expect(conn.execute.mock.calls.some(([sql]) => sql.includes('is_active = IF'))).toBe(false);
});
it('refuses attached appointments before any writes', async () => {
 appointments = [{ id: 55 }];
 await expect(releaseOfficeReservation(input)).rejects.toThrow('client appointment');
 expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE'))).toBe(false);
 expect(conn.rollback).toHaveBeenCalledOnce();
});
it('preserves clinical and billing links', async () => {
 event.billing_context_id = 2;
 await expect(releaseOfficeReservation(input)).rejects.toThrow('documentation');
 expect(conn.commit).not.toHaveBeenCalled();
});
it('refuses another provider and borrowed recurring series', async () => {
 await expect(releaseOfficeReservation({ ...input, actorUserId: 88 })).rejects.toMatchObject({ status: 403 });
 event.booked_provider_id = 88;
 await expect(releaseOfficeReservation({ ...input, actorUserId: 88, scope: 'future' })).rejects.toThrow('someone else');
});
it('ends only the selected hourly assignment from the selected date and retains earlier dates', async () => {
 await releaseOfficeReservation({ ...input, scope: 'future' });
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('UPDATE office_standing_assignments'), ['2099-07-02', '2099-07-03', expect.any(String), 10]);
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('standing_assignment_id = ? AND start_at >= ?'), [10, event.start_at]);
 expect(conn.commit).toHaveBeenCalledOnce();
});

it('makes a future unbooking cutoff explicit without reviving an ignored legacy occurrence count', async () => {
 await releaseOfficeReservation({ ...input, scope: 'future', keepAssigned: true });
 expect(conn.execute).toHaveBeenCalledWith(expect.stringContaining('SET active_until_date'), ['2099-07-02', null, '{"bookingLimitsExplicit":true}', '2099-07-03', expect.any(String), 3]);
 expect(conn.execute.mock.calls.some(([sql]) => sql.startsWith('UPDATE office_standing'))).toBe(false);
});
