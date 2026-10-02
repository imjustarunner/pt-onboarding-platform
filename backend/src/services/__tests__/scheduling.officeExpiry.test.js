import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
import { retireExpiredOfficeAssignment } from '../officeAssignmentExpiry.service.js';
import OfficeStandingAssignment from '../../models/OfficeStandingAssignment.model.js';
import pool from '../../config/database.js';
const now = new Date('2026-10-02T04:00:00Z'); // Thursday evening in Denver
let conn;
beforeEach(() => { conn = { execute: vi.fn().mockResolvedValue([[]]) }; });
it.each(['admin', 'super_admin', 'staff', 'provider'])('preserves an active %s reservation with no generated events', async role => {
  pool.execute.mockResolvedValueOnce([[]]); // no expiry candidates
  const active = { id: 7, provider_id: 8, provider_role: role, availability_mode: 'AVAILABLE' };
  vi.spyOn(OfficeStandingAssignment, 'findActiveConflictsBySlot').mockResolvedValueOnce([active]);
  expect(await OfficeStandingAssignment.clearDisplaceableSlotBlockers({ officeLocationId: 1, roomId: 2, weekday: 4, hour: 17 })).toBe(active);
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('keeps a temporary hold through the end of its local office date', async () => {
  expect(await retireExpiredOfficeAssignment(conn, { id: 7, availability_mode: 'TEMPORARY', temporary_until_date: '2026-10-01' }, 'America/Denver', now)).toMatchObject({ retired: false });
  expect(conn.execute).not.toHaveBeenCalled();
});
it('protects ongoing as well as future events from automatic cancellation', async () => {
  conn.execute.mockResolvedValueOnce([[{ id: 9 }]]);
  expect(await retireExpiredOfficeAssignment(conn, { id: 7, availability_mode: 'TEMPORARY', temporary_until_date: '2026-09-30' }, 'America/Denver', now)).toEqual({ retired: false, reason: 'live_events' });
  expect(conn.execute).toHaveBeenCalledOnce();
  expect(conn.execute.mock.calls[0][0]).toContain('end_at > UTC_TIMESTAMP()');
  expect(conn.execute.mock.calls[0][0]).toContain('status IS NULL');
});
it('retires only the expired hold and plan, preserving event history', async () => {
  conn.execute.mockResolvedValueOnce([[]]).mockResolvedValueOnce([{ affectedRows: 1 }]);
  expect(await retireExpiredOfficeAssignment(conn, { id: 7, availability_mode: 'TEMPORARY', temporary_until_date: '2026-09-30' }, 'America/Denver', now)).toEqual({ retired: true, plansDeactivated: 1 });
  expect(conn.execute.mock.calls.some(([sql]) => /(?:UPDATE|DELETE FROM) office_events/.test(sql))).toBe(false);
});
