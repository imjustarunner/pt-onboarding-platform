import { parseScheduleUtcInstant } from './scheduleEventInstants.js';

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
    if (rows.some(row => (event.appointmentId && Number(row.appointmentId) === event.appointmentId)
      || (event.id && Number(row.id) === event.id && row.kind === event.kind))) continue;
    rows.push(event);
  }
  return raw || rows.length ? { ...raw, scheduleEvents: rows } : null;
}
