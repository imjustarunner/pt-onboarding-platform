import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ connect: vi.fn(), clinical: vi.fn(async () => [[]]), receipt: vi.fn() }));
vi.mock('../../config/database.js', () => ({ default: { getConnection: m.connect }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: m.clinical } }));
vi.mock('../officeMoveEmail.service.js', () => ({ queueOfficeMoveReceipt: m.receipt }));
vi.mock('../officeRoomAllocation.service.js', () => ({ pendingOfficeWindows: async () => [], overlappingRequest: vi.fn() }));

import { moveOfficeSessionOccurrence } from '../officeSessionMove.service.js';

const timeZone = 'America/Denver';
const mondays = ['07', '14', '21', '28', '04'];
let events, appointments, conn, skips;
beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-12-01T00:00:00Z'));
  skips = [];
  events = mondays.map((day, index) => {
    const date = index < 4 ? `2026-12-${day}` : `2027-01-${day}`;
    return { id: index + 1, booking_plan_id: 18, standing_assignment_id: 2, recurrence_group_id: null, office_location_id: 4,
      booked_provider_id: 7, room_id: 8, start_at: `${date} 22:00:00`, end_at: `${date} 23:00:00`, status: 'BOOKED' };
  });
  appointments = events.map(event => ({ id: event.id + 100, start_at: event.start_at, end_at: event.end_at, status: 'scheduled' }));
  conn = {
    beginTransaction: vi.fn(), commit: vi.fn(), rollback: vi.fn(), release: vi.fn(),
    execute: vi.fn(async (sql, args) => {
      const event = id => events.find(row => row.id === id);
      if (sql.includes('SELECT e.booking_plan_id')) {
        return [[{ ...event(args[0]), session_start_at: appointments[args[0] - 1].start_at, provider_user_id: 7, agency_id: 5 }]];
      }
      if (sql.includes('SELECT e.*, a.start_at AS session_start_at')) {
        expect(sql).toContain('a.start_at >= ?');
        return [events.filter(row => row.booking_plan_id === args[0] && appointments[row.id - 1].start_at >= args[4])
          .map(row => ({ ...row, session_start_at: appointments[row.id - 1].start_at }))];
      }
      if (sql.startsWith('SELECT * FROM office_events WHERE id')) return [[{ ...event(args[0]) }]];
      if (sql.includes('SELECT id, status FROM appointments')) return [[appointments[args[0] - 1]]];
      if (sql.includes('SELECT skipped_dates_json')) return [[{ skipped_dates_json: skips }]];
      if (sql.startsWith('UPDATE office_booking_plans')) skips = JSON.parse(args[0]);
      if (sql.startsWith('UPDATE office_events SET room_id')) {
        const [room_id, start_at, end_at, recurrence_group_id, , id] = args;
        Object.assign(event(id), { room_id, start_at, end_at, recurrence_group_id, booking_plan_id: null, standing_assignment_id: null });
      }
      if (sql.startsWith('UPDATE appointments SET room_id')) {
        const [room_id, start_at, end_at, , id] = args;
        Object.assign(appointments[id - 1], { room_id, start_at, end_at });
      }
      return [[]];
    })
  };
  m.connect.mockResolvedValue(conn);
});
afterEach(() => vi.useRealTimers());

it('moves week two independently, then moves only weeks three through five from Monday to Tuesday', async () => {
  const move = (eventId, startAt, endAt, futureAppointments = false) =>
    moveOfficeSessionOccurrence({ eventId, newRoomId: 9, startAt, endAt, timeZone, actorUserId: 7, futureAppointments });

  expect(await move(2, '2026-12-30 22:00:00', '2026-12-30 23:00:00')).toEqual([2]);
  expect(events[1].recurrence_group_id).toBeNull();
  expect(events.slice(2).map(event => event.start_at)).toEqual(['2026-12-21 22:00:00', '2026-12-28 22:00:00', '2027-01-04 22:00:00']);

  const moved = await move(3, '2026-12-22 22:00:00', '2026-12-22 23:00:00', true);
  expect(new Set(moved)).toEqual(new Set([3, 4, 5]));
  expect(appointments.map(row => row.start_at)).toEqual([
    '2026-12-07 22:00:00', '2026-12-30 22:00:00', '2026-12-22 22:00:00', '2026-12-29 22:00:00', '2027-01-05 22:00:00'
  ]);
  expect(events[0].booking_plan_id).toBe(18);
  expect(events[2].recurrence_group_id).toBeTruthy();
  expect(events.slice(2).every(event => event.recurrence_group_id === events[2].recurrence_group_id)).toBe(true);
  expect(new Set(skips)).toEqual(new Set(['2026-12-14', '2026-12-21', '2026-12-28', '2027-01-04']));
  expect(conn.commit).toHaveBeenCalledTimes(2);
});
