import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('../../config/database.js', () => ({ default: { execute: vi.fn() }, onTableWrite: vi.fn() }));
vi.mock('../../config/clinicalDatabase.js', () => ({ default: { execute: vi.fn() } }));
vi.mock('../../models/Appointment.model.js', () => ({ default: {} }));
vi.mock('../../models/ProviderScheduleEvent.model.js', () => ({ default: {} }));
vi.mock('../../models/OfficeEvent.model.js', () => ({ default: {} }));
vi.mock('../cancellationFollowUp.service.js', async importOriginal => {
  // The real coverage algorithm is shared with cancellation offers.
  const actual = await importOriginal(); return { coveringReplacementRooms: actual.coveringReplacementRooms };
});
vi.mock('../providerAvailability.service.js', () => ({ default: {} }));
vi.mock('../appointmentScheduleSync.service.js', () => ({ assertAppointmentCanMove: vi.fn() }));
vi.mock('../replacementOfficeRequest.service.js', () => ({ oneTimeReplacementRoomOptions: vi.fn() }));
import { createAppointmentRescheduleService } from '../appointmentReschedule.service.js';
import { isOwnEmptyReservation, ownReservationsCover } from '../../utils/officeMoveReservation.js';
import { shiftedAppointmentWindow } from '../../utils/appointmentSeriesMove.js';

const appointment = { id: 18141, providerUserId: 501, agencyId: 2, status: 'scheduled', modality: 'IN_PERSON',
  sourceTimezone: 'America/Denver', startAt: '2026-11-18 00:00:00', endAt: '2026-11-18 01:00:00', roomId: 7, officeEventId: 18 };
const input = { startAt: '2026-11-19T17:00:00', endAt: '2026-11-19T18:00:00' };
const own = (roomId, overrides = {}) => ({ id: roomId + 100, roomId, buildingId: 3, roomAvailable: true, hasAppointment: false,
  buildingName: 'Main office', roomLabel: `Room ${roomId}`, startAt: '2026-11-20T00:00:00Z', endAt: '2026-11-20T01:00:00Z', ...overrides });
let h;
beforeEach(() => {
  h = { assertMovable: vi.fn(), assertAvailable: vi.fn(), events: { findById: vi.fn() }, offices: { findById: vi.fn().mockResolvedValue({ standing_assignment_id: 9, booking_plan_id: 8 }) },
    availability: { computeWeekAvailability: vi.fn().mockResolvedValue({ officeReservations: [] }) }, roomOptions: vi.fn().mockResolvedValue([]),
    now: () => new Date('2026-11-18T15:00:00Z') };
});

describe('canonical appointment moves', () => {
  it('allows yesterday’s undocumented occurrence to move to Thursday in its source timezone', async () => {
    h.availability.computeWeekAvailability.mockResolvedValue({ officeReservations: [own(10)] });
    const result = await createAppointmentRescheduleService(h).options(appointment, input);
    expect(h.assertMovable).toHaveBeenCalledWith(appointment);
    expect(result).toMatchObject({ startAt: '2026-11-20 00:00:00', endAt: '2026-11-20 01:00:00', selectedRoomId: 10, hasSeries: true });
    expect(result.rooms[0]).toMatchObject({ id: 10, needsRequest: false });
  });
  it('prefers any owned destination reservation before requesting the original room', async () => {
    h.availability.computeWeekAvailability.mockResolvedValue({ officeReservations: [own(10)] });
    h.roomOptions.mockResolvedValue([{ id: 7, buildingId: 3, needsRequest: true }, { id: 11, buildingId: 3, needsRequest: true }]);
    const result = await createAppointmentRescheduleService(h).options(appointment, input);
    expect(result.rooms.map(r => r.id)).toEqual([10, 7, 11]);
    expect(result.selectedRoomId).toBe(10);
  });
  it('requests the same unassigned room first, with other available rooms as alternatives', async () => {
    h.roomOptions.mockResolvedValue([{ id: 11, buildingId: 3, needsRequest: true }, { id: 7, buildingId: 3, needsRequest: true }]);
    expect(await createAppointmentRescheduleService(h).options(appointment, input)).toMatchObject({ selectedRoomId: 7, rooms: [{ id: 7, needsRequest: true }, { id: 11 }] });
  });
  it('moves virtual sessions without checking or reserving offices', async () => {
    const result = await createAppointmentRescheduleService(h).options({ ...appointment, modality: 'TELEHEALTH', roomId: null, officeEventId: null }, input);
    expect(result.rooms).toEqual([]); expect(h.availability.computeWeekAvailability).not.toHaveBeenCalled(); expect(h.roomOptions).not.toHaveBeenCalled();
  });
  it('does not consume a destination room that already has another session', async () => {
    h.availability.computeWeekAvailability.mockResolvedValue({ officeReservations: [own(7, { hasAppointment: true })] });
    expect((await createAppointmentRescheduleService(h).options(appointment, input)).rooms).toEqual([]);
  });
  it('rejects signed or completed records before looking for rooms', async () => {
    h.assertMovable.mockRejectedValue(new Error('A signed note is attached.'));
    await expect(createAppointmentRescheduleService(h).options(appointment, input)).rejects.toThrow('signed note');
    expect(h.availability.computeWeekAvailability).not.toHaveBeenCalled();
  });
  it.each([{ startAt: '2026-11-17T17:00:00', endAt: '2026-11-17T18:00:00' }, { startAt: input.startAt, endAt: '2026-11-19T16:00:00' }])('rejects invalid destinations', async times => {
    await expect(createAppointmentRescheduleService(h).options(appointment, times)).rejects.toThrow('future');
  });
});

describe('using the destination office reservation', () => {
  const booked = { id: 19, status: 'BOOKED', assigned_provider_id: 501, booked_provider_id: 501,
    start_at: '2026-11-20 00:00:00', end_at: '2026-11-20 01:00:00' };
  it('accepts an empty booked reservation belonging to the provider', () => {
    expect(ownReservationsCover([booked], 501, booked.start_at, booked.end_at)).toBe(true);
  });
  it.each([{ client_id: 8 }, { clinical_session_id: 4 }, { has_appointment: 1 }, { billing_context_id: 3 }, { booked_provider_id: 99 }, { status: 'CANCELLED' }])('rejects occupied or unrelated reservations', overrides => {
    expect(isOwnEmptyReservation({ ...booked, ...overrides }, 501)).toBe(false);
  });
  it('requires coverage of the entire session, with no gaps', () => {
    expect(ownReservationsCover([{ ...booked, end_at: '2026-11-20 00:30:00' }], 501, booked.start_at, booked.end_at)).toBe(false);
  });
});

it('moves recurring Tuesdays to Thursdays across DST while retaining the local 5 PM start', () => {
  expect(shiftedAppointmentWindow('2026-11-04 00:00:00', { originalStartAt: '2026-10-28 23:00:00', startAt: '2026-10-30 23:00:00', endAt: '2026-10-31 00:00:00', timeZone: 'America/Denver' }))
    .toEqual({ startAt: '2026-11-06 00:00:00', endAt: '2026-11-06 01:00:00' });
});
