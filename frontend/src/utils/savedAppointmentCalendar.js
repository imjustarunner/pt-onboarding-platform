import { parseScheduleUtcInstant } from './scheduleEventInstants.js';

export function sameSavedAppointment(row, event) {
  return Boolean((Number(event.appointmentId) > 0 && Number(row.appointmentId) === Number(event.appointmentId))
    || (Number(event.id) && Number(row.id) === Number(event.id) && row.kind === event.kind));
}

export function savedAppointmentAcknowledged(row, event) {
  return sameSavedAppointment(row, event) && Number(row.appointmentId) === Number(event.appointmentId)
    && (!event.clientId || Number(row.clientId) === Number(event.clientId))
    && (!event.clientName || Boolean(row.clientName));
}

export function mergeSavedAppointmentCalendar(raw, saved, providerId, weekStart, timeZone = 'America/Denver') {
  const date = new Date(`${weekStart}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + 7);
  const weekEnd = Number.isFinite(+date) ? date.toISOString().slice(0, 10) : '';
  const rows = [...(raw?.scheduleEvents || [])];
  for (const event of Object.values(saved || {})) {
    if (Number(event.providerId) !== Number(providerId)) continue;
    const instant = parseScheduleUtcInstant(event.startAt); if (!instant) continue;
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(instant).map(p => [p.type, p.value]));
    const day = `${parts.year}-${parts.month}-${parts.day}`;
    if (day < weekStart || day >= weekEnd) continue;
    const index = rows.findIndex(row => sameSavedAppointment(row, event));
    if (index < 0) rows.push(event);
    else if (!savedAppointmentAcknowledged(rows[index], event)) rows[index] = { ...rows[index], ...event };
  }
  return raw || rows.length ? { ...raw, scheduleEvents: rows } : null;
}
