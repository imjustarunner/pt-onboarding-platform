import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(), getConnection: vi.fn() } }));
vi.mock('../notificationDispatcher.service.js', () => ({ createNotificationAndDispatch: vi.fn() }));
vi.mock('../officeReservationRelease.service.js', () => ({ releaseOfficeReservation: vi.fn() }));
import pool from '../../config/database.js';
import { appointmentMode, twoBusinessDayDeadline, reviewStage } from '../../utils/officeSchedulingPolicy.js';
import { latestOfficeAppointmentDate, runOfficeUsageReviews } from '../officeAssignmentUsage.service.js';
import { requestKeepOffice, savePolicy, listPolicies } from '../../controllers/officeSchedulingPolicy.controller.js';
import { releaseOfficeReservation } from '../officeReservationRelease.service.js';
import { createNotificationAndDispatch } from '../notificationDispatcher.service.js';

beforeEach(() => vi.clearAllMocks());
it('changes behavior only from the configured date, with automatic booking as the default', () => {
  expect(appointmentMode({}, '2026-10-03')).toBe(false);
  expect(appointmentMode({ transition_date: '2026-11-02' }, '2026-11-01')).toBe(false);
  expect(appointmentMode({ transition_date: '2026-11-02' }, '2026-11-02')).toBe(true);
});
it('gives two full business days, skipping weekends and agency holidays', () => {
  expect(twoBusinessDayDeadline('2026-10-02')).toBe('2026-10-06');
  expect(twoBusinessDayDeadline('2026-10-02', ['2026-10-05'])).toBe('2026-10-07');
});
it('warns at 14 days, requires action at 28 days, and releases only AFTER the deadline', () => {
  const start = '2026-09-01';
  expect(reviewStage({ start, today: '2026-09-14' })).toBe('monitoring');
  expect(reviewStage({ start, today: '2026-09-15' })).toBe('warning');
  expect(reviewStage({ start, today: '2026-09-29' })).toBe('action_required');
  expect(reviewStage({ start, today: '2026-10-01', deadline: '2026-10-01' })).toBe('action_required');
  expect(reviewStage({ start, today: '2026-10-02', deadline: '2026-10-01' })).toBe('release');
  expect(reviewStage({ start, today: '2026-10-10', deadline: '2026-10-01', pending: true })).toBe('pending');
});
it('a 2:30–3:30 appointment protects both hourly assignments, but not 4–5', async () => {
  const db = { execute: vi.fn().mockResolvedValue([[{ start_at: '2026-10-05 20:30:00', end_at: '2026-10-05 21:30:00' }]]) };
  const assignment = { provider_id: 1, room_id: 3, office_location_id: 2, weekday: 1, timezone: 'America/Denver', transition_date: '2026-10-01' };
  for (const hour of [14, 15]) expect(await latestOfficeAppointmentDate(db, { ...assignment, hour })).toBe('2026-10-05');
  expect(await latestOfficeAppointmentDate(db, { ...assignment, hour: 16 })).toBe('');
  expect(db.execute.mock.calls[0][0]).not.toMatch(/status\s*(=|IN|<>)/i); // cancellation/no-show outcomes still count
  expect(db.execute.mock.calls[0][1].slice(0, 3)).toEqual([1, 3, 2]);
});
it('does not permit non-superadmins to read transition controls', async () => {
  const next = vi.fn();
  await listPolicies({ user: { id: 1, role: 'provider' } }, {}, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 403 }));
  expect(pool.execute).not.toHaveBeenCalled();
});
it('requires an explicit preview confirmation before saving', async () => {
  const next = vi.fn();
  await savePolicy({ user: { id: 1, role: 'super_admin' }, params: { agencyId: '2' }, body: { transitionDate: '2027-01-01' } }, {}, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ message: 'Preview and confirm the transition first.' }));
  expect(pool.getConnection).not.toHaveBeenCalled();
});
it('rejects another provider’s re-request and rolls back', async () => {
  const conn = { beginTransaction: vi.fn(), execute: vi.fn().mockResolvedValue([[{ provider_id: 2 }]]), rollback: vi.fn(), release: vi.fn() };
  pool.getConnection.mockResolvedValue(conn);
  const next = vi.fn();
  await requestKeepOffice({ user: { id: 1 }, params: { assignmentId: 3 } }, {}, next);
  expect(next).toHaveBeenCalledWith(expect.objectContaining({ status: 404 }));
  expect(conn.rollback).toHaveBeenCalled();
});
it('leaves pre-transition assignments completely outside enforcement', async () => {
  pool.execute.mockResolvedValue([[{ transition_date: '2099-01-01', timezone: 'America/Denver' }]]);
  expect(await runOfficeUsageReviews()).toMatchObject({ warned: 0, released: 0 });
  expect(pool.getConnection).not.toHaveBeenCalled();
  expect(releaseOfficeReservation).not.toHaveBeenCalled();
  expect(createNotificationAndDispatch).not.toHaveBeenCalled();
});

it.each([
  ['2026-09-15T18:00:00Z', 'monitoring', null, 'warned', 1],
  ['2026-09-29T18:00:00Z', 'warning', null, 'actionRequired', 1],
  ['2026-10-02T18:00:00Z', 'action_required', '2026-10-01', 'released', 1],
  ['2026-10-02T18:00:00Z', 'pending', '2026-10-01', 'released', 0]
])('enforces lifecycle at %s (%s)', async (now, status, deadline, counter, expected) => {
  vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date(now));
  try {
    const assignment = { id: 3, provider_id: 7, booking_agency_id: 2, transition_date: '2026-09-01', created_at: '2026-01-01', available_since_date: '2026-01-01', timezone: 'America/Denver', hour: 14, weekday: 1, office_location_id: 1, room_id: 4 };
    pool.execute.mockResolvedValue([[assignment]]);
    const execute = vi.fn(async sql => {
      if (sql.startsWith('SELECT * FROM office_assignment_usage_reviews')) return [[{ cycle_start_date: '2026-09-01', status, deadline_date: deadline, action_required_at: deadline ? '2026-09-29' : null }]];
      return [[]];
    });
    const conn = { execute, beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn() };
    pool.getConnection.mockResolvedValue(conn);
    const result = await runOfficeUsageReviews();
    expect(result.errors).toEqual([]);
    expect(result[counter]).toBe(expected);
    if (counter === 'released' && expected) expect(releaseOfficeReservation).toHaveBeenCalledWith(expect.objectContaining({ assignmentId: 3, date: '2026-10-02', scope: 'future', actorUserId: 7 }));
    else expect(releaseOfficeReservation).not.toHaveBeenCalled();
    if (status === 'pending') expect(createNotificationAndDispatch).not.toHaveBeenCalled();
    expect(conn.commit).toHaveBeenCalled();
  } finally { vi.useRealTimers(); }
});
