export const ymd = value => value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
export function appointmentMode(assignment, date) {
  const transition = ymd(assignment?.transition_date);
  return !!transition && date >= transition;
}
export function twoBusinessDayDeadline(date, holidays = []) {
  const excluded = new Set(holidays.map(ymd));
  const cursor = new Date(`${date}T12:00:00Z`);
  let remaining = 2;
  while (remaining) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    if (![0, 6].includes(cursor.getUTCDay()) && !excluded.has(ymd(cursor))) remaining -= 1;
  }
  return ymd(cursor);
}
export function reviewStage({ today, start, deadline, pending = false }) {
  if (pending) return 'pending';
  if (deadline && today > deadline) return 'release'; // full second business day, office-local
  const days = Math.floor((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${start}T12:00:00Z`)) / 86400000);
  return days >= 28 ? 'action_required' : days >= 14 ? 'warning' : 'monitoring';
}

// A continuous recurring block can span several hourly assignment rows. Only
// actual appointment use on BOTH sides protects a gap; unused padding is an edge.
export function recurringOfficeBlock(assignment, assignments, today) {
  const frequency = value => String(value || 'WEEKLY').toUpperCase().replace('MONTHLY', 'EVERY_4_WEEKS');
  const period = { WEEKLY: 7, BIWEEKLY: 14, EVERY_3_WEEKS: 21, EVERY_4_WEEKS: 28 }[frequency(assignment.assigned_frequency)];
  const rows = assignments.filter(row => {
    if (['provider_id', 'booking_agency_id', 'office_location_id', 'room_id', 'weekday'].some(key => Number(row[key]) !== Number(assignment[key]))) return false;
    if (row.is_active === false || row.is_active === 0 || ymd(row.available_since_date) > today) return false;
    if (String(row.availability_mode).toUpperCase() === 'TEMPORARY' && row.temporary_until_date && ymd(row.temporary_until_date) < today) return false;
    if (frequency(row.assigned_frequency) !== frequency(assignment.assigned_frequency)) return false;
    if (period !== 7) {
      const firstOccurrence = value => {
        const date = new Date(`${ymd(value.available_since_date)}T12:00:00Z`);
        date.setUTCDate(date.getUTCDate() + (Number(value.weekday) - date.getUTCDay() + 7) % 7);
        return date.getTime();
      };
      const delta = (firstOccurrence(row) - firstOccurrence(assignment)) / 86400000;
      if (!period || !Number.isFinite(delta) || delta % period !== 0) return false;
    }
    return appointmentMode(row, today);
  });
  const byHour = new Map(rows.map(row => [Number(row.hour), row]));
  const block = [assignment];
  for (const direction of [-1, 1]) {
    for (let hour = Number(assignment.hour) + direction; byHour.has(hour); hour += direction) block.push(byHour.get(hour));
  }
  return block;
}

export function isProtectedInteriorHour(assignment, block, lastUseById, today) {
  const activeHours = block.filter(row => {
    const lastUse = lastUseById.get(Number(row.id));
    return lastUse && (Date.parse(today) - Date.parse(lastUse)) / 86400000 < 28;
  }).map(row => Number(row.hour));
  if (activeHours.includes(Number(assignment.hour))) return false; // its own use already protects it
  return activeHours.some(hour => hour < Number(assignment.hour))
    && activeHours.some(hour => hour > Number(assignment.hour));
}
