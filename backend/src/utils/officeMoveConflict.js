const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const hourLabel = hour => `${hour % 12 || 12}:00 ${hour < 12 || hour === 24 ? 'AM' : 'PM'}`;
export function standingOfficeConflict(row, { weekday, startHour, endHour }) {
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Another provider';
  const overlapStart = Math.max(Number(row.hour), startHour);
  const overlapEnd = Math.min(Number(row.hour) + 1, endHour);
  const conflict = { providerId: Number(row.provider_id), providerName: name, weekday,
    startHour: overlapStart, endHour: overlapEnd, requestedStartHour: startHour, requestedEndHour: endHour, kind: 'assignment' };
  return Object.assign(new Error(`${name} has an office assignment on ${days[weekday]} from ${hourLabel(overlapStart)}–${hourLabel(overlapEnd)}. That portion overlaps your ${hourLabel(startHour)}–${hourLabel(endHour)} request. No times were moved.`),
    { status: 409, code: 'OFFICE_MOVE_CONFLICT', conflict });
}
export function isExpiredTemporaryAssignment(row, today) {
  const raw = row?.temporary_until_date;
  const until = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw || '').slice(0, 10);
  return String(row?.availability_mode).toUpperCase() === 'TEMPORARY' && /^\d{4}-\d{2}-\d{2}$/.test(until) && until < today;
}

export function eventOfficeConflict(row, { startAt, endAt, timeZone }) {
  const utc = value => value instanceof Date ? value : new Date(`${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`);
  const start = new Date(Math.max(+utc(row.start_at), +utc(startAt)));
  const end = new Date(Math.min(+utc(row.end_at), +utc(endAt)));
  const label = date => new Intl.DateTimeFormat('en-US', { timeZone, hour: 'numeric', minute: '2-digit' }).format(date);
  const date = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'long', month: 'short', day: 'numeric' }).format(start);
  const name = [row.first_name, row.last_name].filter(Boolean).join(' ') || 'Another reservation';
  const conflict = { kind: 'event', eventId: Number(row.id), providerId: Number(row.provider_id) || null,
    providerName: name, startAt: start.toISOString(), endAt: end.toISOString(), timeZone };
  return Object.assign(new Error(`${name} has a conflicting event on ${date}, ${label(start)}–${label(end)} (${timeZone}). No times were moved.`),
    { status: 409, code: 'OFFICE_MOVE_CONFLICT', conflict });
}
