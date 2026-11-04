import { utcMysqlToIso, utcDateToZonedParts, zonedWallTimeToUtc } from './zonedWallTime.util.js';

// School notices are sent once at 7 AM in the appointment's local zone. For an
// earlier visit, allow thirty minutes' notice without crossing into yesterday.
export function schoolAppointmentReminderWindow(appointment) {
  const start = new Date(utcMysqlToIso(appointment.startAt) || NaN);
  if (!Number.isFinite(+start)) return null;
  const timeZone = appointment.sourceTimezone || appointment.timeZone || appointment.timezone || 'America/Denver';
  const parts = utcDateToZonedParts(start, timeZone);
  if (!parts) return null;
  const atHour = hour => zonedWallTimeToUtc({ ...parts, hour, minute: 0, second: 0, timeZone });
  const scheduledAt = new Date(Math.max(+atHour(0), Math.min(+atHour(7), +start - 30 * 60000)));
  return { scheduledAt, dayStart: atHour(0), deadline: new Date(Math.min(+start, +atHour(12))),
    offsetMinutes: Math.max(0, Math.round((+start - +scheduledAt) / 60000)) };
}

export function nativeSchoolAppointment(appointment) {
  return appointment?.data?.serviceSetting === 'school' || String(appointment?.data?.placeOfService || '').padStart(2, '0') === '03';
}

export const schoolAppointmentReminderText = 'Your dependent will be seen today at school. No confirmation is needed. If the provider’s schedule changes, we will notify you.';
