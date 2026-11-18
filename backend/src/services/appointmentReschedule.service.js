import Appointment from '../models/Appointment.model.js';
import pool from '../config/database.js';
import { assertAppointmentWindowAvailable } from './appointmentConflict.service.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import OfficeEvent from '../models/OfficeEvent.model.js';
import ProviderAvailabilityService from './providerAvailability.service.js';
import { assertAppointmentCanMove } from './appointmentScheduleSync.service.js';
import { coveringReplacementRooms } from './cancellationFollowUp.service.js';
import { oneTimeReplacementRoomOptions } from './replacementOfficeRequest.service.js';
import { clientScheduleInstantToUtcMysql, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';

const fail = message => Object.assign(new Error(message), { status: 409 });

// Rescheduling is independent of cancellation offers: an undocumented past
// occurrence may move to a future time without creating a second appointment.
export function createAppointmentRescheduleService({ appointments = Appointment, events = ProviderScheduleEvent,
  offices = OfficeEvent, availability = ProviderAvailabilityService, assertMovable = assertAppointmentCanMove,
  roomOptions = oneTimeReplacementRoomOptions,
  assertAvailable = (appointment, window) => assertAppointmentWindowAvailable(pool, { ...appointment, ...window }, appointment.id),
  now = () => new Date() } = {}) {
  async function context(appointment) {
    await assertMovable(appointment);
    const event = appointment.providerScheduleEventId ? await events.findById(appointment.providerScheduleEventId) : null;
    const office = appointment.officeEventId ? await offices.findById(appointment.officeEventId) : null;
    return { appointmentId: appointment.id, timeZone: appointment.sourceTimezone || 'America/Denver',
      startAt: parseUtcDate(appointment.startAt).toISOString(), endAt: parseUtcDate(appointment.endAt).toISOString(),
      inPerson: String(appointment.modality).toUpperCase() === 'IN_PERSON',
      hasSeries: !!(event?.recurrence_series_id || office?.standing_assignment_id || office?.booking_plan_id),
      canMoveSeries: !!(event?.recurrence_series_id || office?.standing_assignment_id) };
  }

  async function options(appointment, input) {
    const info = await context(appointment);
    const localStart = String(input.startAt || '');
    const localEnd = String(input.endAt || '');
    const timeZone = info.timeZone;
    const startAt = clientScheduleInstantToUtcMysql(localStart, timeZone);
    const endAt = clientScheduleInstantToUtcMysql(localEnd, timeZone);
    const start = parseUtcDate(startAt), end = parseUtcDate(endAt);
    if (!start || !end || !Number.isFinite(+start) || !Number.isFinite(+end) || !(+start > +now()) || !(end > start)) {
      throw fail('Choose a valid future start and end time.');
    }
    await assertAvailable(appointment, { startAt, endAt });
    if (!info.inPerson) return { ...info, startAt, endAt, rooms: [], selectedRoomId: null };
    const week = await availability.computeWeekAvailability({ agencyId: appointment.agencyId, providerId: appointment.providerUserId,
      weekStartYmd: utcDateToZonedYmd(start, timeZone), intakeOnly: false, includePrivateCalendar: true,
      includePrivateOffers: true, materializeOfficeEvents: true });
    const owned = coveringReplacementRooms(week.officeReservations, start, end).map(r => ({
      id: r.roomId, buildingId: r.buildingId, needsRequest: false,
      label: `${r.buildingName || 'Office'} · ${r.roomLabel || r.roomId}` }));
    const available = await roomOptions(appointment, start, end);
    const rooms = [...owned, ...available.filter(r => !owned.some(o => o.id === r.id))]
      .filter(r => !appointment.officeLocationId || Number(r.buildingId) === Number(appointment.officeLocationId));
    rooms.sort((a, b) => Number(a.needsRequest) - Number(b.needsRequest)
      || Number(b.id === appointment.roomId) - Number(a.id === appointment.roomId));
    return { ...info, startAt, endAt, rooms, selectedRoomId: rooms[0]?.id || null };
  }
  return { context, options };
}

export const appointmentReschedule = createAppointmentRescheduleService();
