import { utcMysqlToIso } from './zonedWallTime.util.js';
import { shiftedAppointmentWindow } from './appointmentSeriesMove.js';

/** Read projection only. The canonical booking owns the session time; retain
 * the original calendar copy as evidence instead of changing either record. */
export function canonicalAppointmentWindow(event, appointment, { reservation = false } = {}) {
  const startAt = utcMysqlToIso(appointment?.startAt), endAt = utcMysqlToIso(appointment?.endAt);
  if (!startAt || !endAt || Date.parse(endAt) <= Date.parse(startAt)) return event;
  const calendarStartAt = utcMysqlToIso(event.calendarStartAt || event.startAt);
  const calendarEndAt = utcMysqlToIso(event.calendarEndAt || event.endAt);
  const mismatch = !!(calendarStartAt && calendarEndAt && (reservation
    ? Date.parse(calendarStartAt) > Date.parse(startAt) || Date.parse(calendarEndAt) < Date.parse(endAt)
    : calendarStartAt !== startAt || calendarEndAt !== endAt));
  return { ...event, startAt, endAt, timeZone: appointment.sourceTimezone || event.timeZone,
    calendarTimingMismatch: mismatch,
    ...(mismatch ? { calendarStartAt, calendarEndAt, calendarMirrorKind: reservation ? 'office_reservation' : 'provider_schedule_event' } : {}) };
}

export function appointmentEventOverlapsWindow(event, windowStart, windowEnd) {
  if (event.allDay) return true;
  const start = utcMysqlToIso(event.startAt), end = utcMysqlToIso(event.endAt);
  const from = utcMysqlToIso(windowStart), until = utcMysqlToIso(windowEnd);
  return !start || !end || !from || !until || Date.parse(start) < Date.parse(until) && Date.parse(end) > Date.parse(from);
}

/** Preflight every linked booking before the controller changes any occurrence.
 * Return the same windows to use for persistence, avoiding a stale mirror base. */
export async function canonicalCalendarMoveWindows(occurrences, plan, {findAppointment,assertMovable,assertAvailable}) {
  const windows=new Map();
  for(const occurrence of occurrences){
    const appointment=await findAppointment(occurrence.id);
    if(!appointment)continue;
    await assertMovable(appointment);
    const window=shiftedAppointmentWindow(appointment.startAt,plan);
    if(!window)throw Object.assign(new Error('The saved appointment time needs review before moving this series.'),{status:409});
    await assertAvailable(appointment,window);
    windows.set(Number(occurrence.id),window);
  }
  return windows;
}
