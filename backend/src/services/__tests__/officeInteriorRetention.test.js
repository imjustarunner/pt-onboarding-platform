import { afterEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../notificationDispatcher.service.js', () => ({ createNotificationAndDispatch: vi.fn() }));
vi.mock('../officeReservationRelease.service.js', () => ({ releaseOfficeReservation: vi.fn() }));
import pool from '../../config/database.js';
import { createNotificationAndDispatch } from '../notificationDispatcher.service.js';
import { releaseOfficeReservation } from '../officeReservationRelease.service.js';
import { runOfficeUsageReviews } from '../officeAssignmentUsage.service.js';
import { recurringOfficeBlock, isProtectedInteriorHour } from '../../utils/officeSchedulingPolicy.js';
const today = '2026-10-02';
const slot = hour => ({ id: hour, hour, provider_id: 1, booking_agency_id: 2, room_id: 3, office_location_id: 4, weekday: 1, assigned_frequency: 'WEEKLY', available_since_date: '2026-08-01', transition_date: '2026-09-01', timezone: 'America/Denver', is_active: 1 });
const slots = Array.from({ length: 11 }, (_, index) => slot(index + 8));
const protectedAt = (hour, rows, uses) => isProtectedInteriorHour(slot(hour), recurringOfficeBlock(slot(hour), rows, today), new Map(uses), today);
afterEach(() => { vi.clearAllMocks(); vi.useRealTimers(); });
it('retains a 3–4 PM gap in an 8 AM–7 PM block used on both sides', () => {
 expect(protectedAt(15, slots, [[14, '2026-09-28'], [16, '2026-09-28']])).toBe(true);
});
it('retains consecutive interior gaps, but not unused leading or trailing hours', () => {
 const use = [[10, '2026-09-28'], [17, '2026-09-28']];
 for (const hour of [11,12,13,14,15,16]) expect(protectedAt(hour, slots, use)).toBe(true);
 for (const hour of [8,9,18]) expect(protectedAt(hour, slots, use)).toBe(false);
 expect(protectedAt(15, slots, [])).toBe(false);
 expect(protectedAt(15, slots, [[14, '2026-09-28']])).toBe(false);
});
it('does not bridge unassigned hours, different rooms, providers, days, or agencies', () => {
 const use = [[14, '2026-09-28'], [17, '2026-09-28']];
 expect(protectedAt(15, slots.filter(s => s.hour !== 16), use)).toBe(false);
 for (const key of ['room_id','office_location_id','provider_id','weekday','booking_agency_id']) {
  expect(protectedAt(15, slots.map(s => s.hour === 16 ? {...s, [key]: 99} : s), use)).toBe(false);
 }
});
it('does not rely on inactive, expired, future, stale, or differently recurring neighbors', () => {
 for (const change of [{is_active:0},{availability_mode:'TEMPORARY',temporary_until_date:'2026-10-01'},{available_since_date:'2026-11-01'},{assigned_frequency:'BIWEEKLY'}]) {
  expect(protectedAt(15, slots.map(s => s.hour === 16 ? {...s,...change} : s), [[14,'2026-09-28'],[17,'2026-09-28']])).toBe(false);
 }
 expect(protectedAt(15, slots, [[14,'2026-09-01'],[16,'2026-09-28']])).toBe(false);
});
it('requires biweekly neighbors to occur on matching weeks', () => {
 const rows = [14,15,16].map(hour => ({...slot(hour),assigned_frequency:'BIWEEKLY',available_since_date:'2026-08-03'}));
 const target = rows[1];
 expect(recurringOfficeBlock(target, rows, today)).toHaveLength(3);
 expect(recurringOfficeBlock(target, rows.map(r => r.hour === 16 ? {...r,available_since_date:'2026-08-10'} : r), today)).toHaveLength(2);
});
it('withdraws an expired release deadline for a newly protected interior hour', async () => {
 vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-02T18:00:00Z'));
 const rows = [14,15,16].map(slot);
 pool.execute.mockResolvedValue([rows]);
 const execute = vi.fn(async (sql, args) => {
  if (sql.startsWith('SELECT * FROM office_assignment_usage_reviews')) return [[{cycle_start_date:'2026-09-01',status:'action_required',deadline_date:'2026-10-01',action_required_at:'2026-09-29'}]];
  if (sql.startsWith('SELECT start_at, end_at FROM appointments')) return [[
   {start_at:'2026-09-28 20:00:00',end_at:'2026-09-28 21:00:00'},
   {start_at:'2026-09-28 22:00:00',end_at:'2026-09-28 23:00:00'}
  ]];
  return [[]];
 });
 pool.getConnection.mockImplementation(async () => ({execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()}));
 const result = await runOfficeUsageReviews();
 expect(result.errors).toEqual([]);
 expect(releaseOfficeReservation).not.toHaveBeenCalled();
 expect(createNotificationAndDispatch).not.toHaveBeenCalled();
 expect(execute.mock.calls.some(([sql,args]) => sql.includes("status = 'protected_interior'") && args[1] === 15)).toBe(true);
});
it('restarts the review period when a previously protected gap becomes an unused end', async () => {
 vi.useFakeTimers({toFake:['Date']}); vi.setSystemTime(new Date('2026-10-02T18:00:00Z'));
 pool.execute.mockResolvedValue([[slot(15)]]);
 const execute = vi.fn(async sql => sql.startsWith('SELECT * FROM office_assignment_usage_reviews')
  ? [[{cycle_start_date:'2026-09-01',status:'protected_interior',deadline_date:'2026-09-30'}]] : [[]]);
 pool.getConnection.mockResolvedValue({execute,beginTransaction:vi.fn(),commit:vi.fn(),rollback:vi.fn(),release:vi.fn()});
 expect(await runOfficeUsageReviews()).toMatchObject({warned:0,actionRequired:0,released:0,errors:[]});
 expect(execute.mock.calls.some(([sql,args]) => sql.includes("status = 'monitoring'") && args[0] === today)).toBe(true);
 expect(releaseOfficeReservation).not.toHaveBeenCalled();
});
