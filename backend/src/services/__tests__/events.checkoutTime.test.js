import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { getConnection: vi.fn(), execute: vi.fn() } }));
vi.mock('../skillBuildersEventKioskPunch.service.js', () => ({ recordEventEmployeeClockIn: vi.fn(), recordEventEmployeeClockOut: vi.fn() }));
vi.mock('../companyEventOperations.service.js', () => ({ isEventCoordinator: vi.fn().mockResolvedValue(false) }));
import pool from '../../config/database.js';
import { recordEventEmployeeClockOut } from '../skillBuildersEventKioskPunch.service.js';
import { eventCheckoutInstant, recordEmployeeEventParticipation } from '../companyEventParticipation.service.js';
import { checkOutOfMyEvent } from '../../controllers/companyEventParticipation.controller.js';

const now = new Date('2026-10-24T20:35:00Z');
const event = { id: 4, agency_id: 2, user_role: 'admin', timezone: 'America/Denver', is_active: 1, starts_at: '2026-10-24T16:00Z', ends_at: '2026-10-24T20:00Z' };
let db, last;
beforeEach(() => {
  vi.clearAllMocks();
  last = { id: 10, punch_type: 'clock_in', punched_at: new Date('2026-10-24T16:00:00Z') };
  db = { beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(), execute: vi.fn(async sql => {
    if (sql.includes('FOR UPDATE')) return [[{ id: 7 }]];
    if (sql.includes('FROM company_events e')) return [[event]];
    if (sql.includes('SELECT id, punch_type, punched_at')) return [last ? [last] : []];
    if (sql.startsWith('UPDATE event_day_kiosk_checkins')) return [{ affectedRows: 1 }];
    throw new Error(sql);
  }) };
  pool.getConnection.mockResolvedValue(db);
  recordEventEmployeeClockOut.mockResolvedValue({ ok: true });
  pool.execute.mockImplementation(async sql => {
    if (sql.includes('FROM company_events e')) return [[event]];
    if (sql.includes('FROM company_event_provider_assignments')) return [[{ assigned: 1 }]];
    if (sql.includes('SELECT id, punch_type')) return [[{ ...last, punch_type: 'clock_out' }]];
    if (sql.includes('SELECT session_date')) return [[{ session_date: '2026-10-24' }]];
    throw new Error(sql);
  });
});
const record = (checkoutAt, more = {}) => recordEmployeeEventParticipation({ eventId: 4, userId: 7, action: 'check-out', checkoutAt, now, ...more });

it('accepts an explicit past instant and rejects missing timezone, invalid and future times', () => {
  expect(eventCheckoutInstant(undefined, now)).toBe(now);
  expect(eventCheckoutInstant('2026-10-24T14:00:00-06:00', now).toISOString()).toBe('2026-10-24T20:00:00.000Z');
  for (const value of ['', 'bad', '2026-10-24T14:00', '2026-10-24T25:00:00Z', 0, '2026-10-24T21:00:00Z']) {
    expect(() => eventCheckoutInstant(value, now)).toThrow();
  }
});

it('uses the chosen time for both payroll punches and kiosk attendance under the employee lock', async () => {
  const checkoutAt = '2026-10-24T20:00:00Z';
  await record(checkoutAt);
  expect(db.execute.mock.calls[0]).toEqual(['SELECT id FROM users WHERE id = ? FOR UPDATE', [7]]);
  expect(recordEventEmployeeClockOut).toHaveBeenCalledWith(db, expect.objectContaining({ userId: 7, clockOutAt: new Date(checkoutAt), source: 'employee_event_link_manual_time' }));
  const [sql, params] = db.execute.mock.calls.find(([sql]) => sql.startsWith('UPDATE event_day_kiosk_checkins'));
  expect(sql).toContain('voided_at IS NULL');
  expect(params).toEqual([new Date(checkoutAt), 4, 2, 7]);
  expect(db.commit).toHaveBeenCalledTimes(1);
});

it('keeps clock out now on server time', async () => {
  await record(undefined);
  expect(recordEventEmployeeClockOut).toHaveBeenCalledWith(db, expect.objectContaining({ clockOutAt: now, source: 'employee_event_link' }));
});

it('rejects a chosen time before or at the open clock-in and rolls back', async () => {
  for (const time of ['2026-10-24T15:59:00Z', '2026-10-24T16:00:00Z']) await expect(record(time)).rejects.toThrow('after your clock-in');
  expect(recordEventEmployeeClockOut).not.toHaveBeenCalled();
  expect(db.rollback).toHaveBeenCalledTimes(2);
  expect(db.commit).not.toHaveBeenCalled();
});

it('rejects already-closed and absent punches, including a second submission', async () => {
  last = { ...last, punch_type: 'clock_out' };
  await expect(record('2026-10-24T20:00:00Z')).rejects.toThrow('not currently clocked in');
  last = null;
  await expect(record('2026-10-24T20:00:00Z')).rejects.toThrow('not currently clocked in');
  expect(recordEventEmployeeClockOut).not.toHaveBeenCalled();
});

it('rejects future time before opening a transaction and disallows custom time for check-in', async () => {
  await expect(record('2026-10-25T00:00:00Z')).rejects.toThrow('future');
  await expect(record('2026-10-24T20:00:00Z', { action: 'check-in' })).rejects.toThrow('only be supplied');
  expect(pool.getConnection).not.toHaveBeenCalled();
});

it('takes the employee identity from authentication, not the checkout request body', async () => {
  const req = { params: { eventId: 4 }, user: { id: 7 }, body: { userId: 99, checkoutAt: '2026-10-24T20:00:00Z' } };
  const res = { json: vi.fn() }, next = vi.fn();
  await checkOutOfMyEvent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(recordEventEmployeeClockOut).toHaveBeenCalledWith(db, expect.objectContaining({ userId: 7, clockOutAt: new Date(req.body.checkoutAt) }));
});
