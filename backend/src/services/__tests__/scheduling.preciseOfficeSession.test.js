import { expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ query: vi.fn(), tx: vi.fn(), create: vi.fn(), find: vi.fn(), ensure: vi.fn(), notice: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { execute: m.query } }));
vi.mock('../../models/OfficeEvent.model.js', () => ({
  default: { withRoomSlotLock: (_, work) => work({ execute: m.tx }), create: m.create }
}));
vi.mock('../../models/Appointment.model.js', () => ({ default: { findByOfficeEventId: m.find } }));
vi.mock('../officeScheduleMaterializer.service.js', () => ({ default: { materializeWeek: vi.fn(), invalidateOffice: vi.fn() } }));
vi.mock('../clientSchedulingGuard.service.js', () => ({ withClientSchedulingLock: (_, work) => work() }));
vi.mock('../appointmentConflict.service.js', () => ({ assertAppointmentWindowAvailable: vi.fn() }));
vi.mock('../appointmentContext.service.js', () => ({ ensureAppointmentContext: m.ensure }));
vi.mock('../providerAssignmentGoogleSync.service.js', () => ({ queueOfficeEventGoogleSync: vi.fn(async () => {}) }));
vi.mock('../appointmentScheduleNotice.service.js', () => ({ appointmentScheduleNotices: { queue: m.notice } }));

import { approvePreciseOfficeSessions } from '../preciseOfficeSession.service.js';

it('reserves whole hours and binds one precise appointment per week', async () => {
  const roomHours = [];
  const sessionWindowByOffice = new Map();
  m.query.mockResolvedValue([[]]);
  m.create.mockImplementation(async row => {
    roomHours.push([row.startAt, row.endAt, row.executor != null]);
    return { id: roomHours.length };
  });
  m.tx.mockImplementation(async (sql, args) => {
    if (sql.startsWith('SELECT')) return [[]];
    const context = JSON.parse(args[4]);
    if (context.sessionStartAt) sessionWindowByOffice.set(args.at(-1), context);
    return [{ affectedRows: 1 }];
  });
  m.find.mockImplementation(async officeEventId => {
    const context = sessionWindowByOffice.get(officeEventId);
    return { id: officeEventId + 10, startAt: context.sessionStartAt, endAt: context.sessionEndAt };
  });
  const linkedIds = await approvePreciseOfficeSessions({
    request: { id: 1, requested_provider_id: 7, client_id: 8, start_at: '2027-03-05 01:00:00',
      end_at: '2027-03-05 03:00:00', booked_occurrence_count: 3 },
    office: { id: 1, timezone: 'America/Denver' }, room: { id: 5 },
    context: { agencyId: 2, sessionOffsets: [45, 67], officeSessionSeriesId: 'series-1' },
    selection: { serviceCode: '90832', modality: 'IN_PERSON' }, recurrence: 'WEEKLY', actorUserId: 9
  });
  expect(linkedIds).toEqual([1, 3, 5]);
  expect(roomHours).toEqual([
    ['2027-03-05 01:00:00', '2027-03-05 02:00:00', true], ['2027-03-05 02:00:00', '2027-03-05 03:00:00', true],
    ['2027-03-12 01:00:00', '2027-03-12 02:00:00', true], ['2027-03-12 02:00:00', '2027-03-12 03:00:00', true],
    ['2027-03-19 00:00:00', '2027-03-19 01:00:00', true], ['2027-03-19 01:00:00', '2027-03-19 02:00:00', true]
  ]);
  expect([...sessionWindowByOffice.values()].map(row => [row.sessionStartAt, row.sessionEndAt])).toEqual([
    ['2027-03-05 01:45:00', '2027-03-05 02:07:00'], ['2027-03-12 01:45:00', '2027-03-12 02:07:00'],
    ['2027-03-19 00:45:00', '2027-03-19 01:07:00']
  ]);
  expect(m.ensure).toHaveBeenCalledTimes(3);
});
