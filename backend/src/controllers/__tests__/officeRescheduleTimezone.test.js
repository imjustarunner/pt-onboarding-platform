import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ move: vi.fn(), request: vi.fn(), event: vi.fn(), materialize: vi.fn(), series: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn(async () => [[]]) }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn(async () => [[]]) } }));
vi.mock('../../models/OfficeEvent.model.js', () => ({ default: { findById: m.event } }));
vi.mock('../../models/OfficeLocation.model.js', () => ({ default: { findById: async () => ({ id: 1, timezone: 'America/Denver' }) } }));
vi.mock('../../models/OfficeRoom.model.js', () => ({ default: { findById: async () => ({ id: 2, location_id: 1 }) } }));
vi.mock('../../models/User.model.js', () => ({ default: { getAgencies: async () => [{ id: 3 }] } }));
vi.mock('../../models/OfficeLocationAgency.model.js', () => ({ default: { userHasAccess: async () => true } }));
vi.mock('../../models/OfficeBookingRequest.model.js', () => ({ default: { create: m.request } }));
vi.mock('../../services/officeSessionMove.service.js', () => ({ moveOfficeSessionOccurrence: m.move, moveOfficeSessionSeries: vi.fn(), officeSeriesFromAppointment: m.series }));
vi.mock('../../services/officeScheduleMaterializer.service.js', () => ({ default: { materializeWeek: m.materialize, invalidateOffice: vi.fn(), startOfWeekMonday: date => date } }));
import { rescheduleOfficeEvent } from '../officeSlotActions.controller.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T18:00:00Z'));
  m.event.mockResolvedValue({ id: 10, office_location_id: 1, room_id: 2, booked_provider_id: 7, start_at: '2026-11-19 18:00:00', end_at: '2026-11-19 19:00:00' });
  m.move.mockResolvedValue([]);
  m.request.mockResolvedValue({ id: 11 });
});
afterEach(() => vi.useRealTimers());
const inputs = [
  ['wall clock', '2026-11-19T12:00:00', '2026-11-19T13:00:00'],
  ['UTC instant', '2026-11-19T19:00:00Z', '2026-11-19T20:00:00Z'],
  ['numeric offset', '2026-11-19T12:00:00-07:00', '2026-11-19T13:00:00-07:00']
];
it.each(inputs.flatMap(input => ['super_admin', 'provider'].map(role => [...input, role])))
('preserves Denver noon for an office move: %s (%s to %s, %s)', async (_label, startAt, endAt, role) => {
  const req = { user: { id: 7, role }, params: { officeId: '1', eventId: '10' }, body: { startAt, endAt, scope: 'single' } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();
  await rescheduleOfficeEvent(req, res, next);
  expect(next).not.toHaveBeenCalled();
  const write = role === 'provider' ? m.request : m.move;
  expect(write).toHaveBeenCalledWith(expect.objectContaining({ startAt: '2026-11-19 19:00:00', endAt: '2026-11-19 20:00:00' }));
  if (role === 'provider') {
    expect(JSON.parse(m.request.mock.calls[0][0].requesterNotes).summary).toContain('2026-11-19 12:00:00');
    expect(res.status).toHaveBeenCalledWith(202);
  } else expect(m.materialize).toHaveBeenCalledWith(expect.objectContaining({ weekStartRaw: '2026-11-19' }));
});

it('requests an office for the selected occurrence and its following sessions when they lack room coverage', async () => {
  m.series.mockResolvedValue({ anchor: { session_start_at: '2026-11-19 18:00:00' }, events: [
    { id: 10, session_start_at: '2026-11-19 18:00:00', start_at: '2026-11-19 18:00:00' },
    { id: 12, session_start_at: '2026-11-26 18:00:00', start_at: '2026-11-26 18:00:00' }
  ] });
  m.move.mockRejectedValueOnce(Object.assign(new Error('Room needed'), { code: 'OFFICE_MOVE_NEEDS_RESERVATION' }));
  const req = { user: { id: 7, role: 'provider' }, params: { officeId: '1', eventId: '10' }, body: {
    startAt: '2026-11-20T12:00:00', endAt: '2026-11-20T13:00:00', scope: 'future', moveClientSeries: true
  } };
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }, next = vi.fn();

  await rescheduleOfficeEvent(req, res, next);

  expect(next).not.toHaveBeenCalled();
  expect(m.move).toHaveBeenCalledWith(expect.objectContaining({ futureAppointments: true, requireOwnReservation: true, expectedEventIds: [10, 12] }));
  const request = m.request.mock.calls[0][0];
  expect(request.requestType).toBe('MOVE_OCCURRENCE');
  expect(JSON.parse(request.requesterNotes).body.expectedOfficeEventIds).toEqual([10, 12]);
  expect(res.status).toHaveBeenCalledWith(202);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ pendingApproval: true }));
});
