// An anchor is required for dated and alternating-week availability.
const steps = { WEEKLY: 7, EITHER: 7, BIWEEKLY: 14, EVERY_3_WEEKS: 21, EVERY_4_WEEKS: 28 };
export function availabilityOccursOn(row, ymd) {
  const start = String(row.startDate || row.start_date || '').slice(0, 10);
  const end = String(row.endDate || row.end_date || '').slice(0, 10);
  const frequency = String(row.frequency || 'WEEKLY').toUpperCase();
  if (start && ymd < start || end && ymd > end) return false;
  if (frequency === 'ONCE') return !!start && ymd === start;
  if (!start) return frequency === 'WEEKLY' || frequency === 'EITHER';
  const days = Math.round((Date.parse(ymd + 'T12:00:00Z') - Date.parse(start + 'T12:00:00Z')) / 86400000);
  return days >= 0 && days % (steps[frequency] || 7) === 0;
}
export function availabilityPurpose(row) {
  return row.purpose || (row.frequency === 'ONCE' ? 'INTAKE' : 'ONGOING');
}
