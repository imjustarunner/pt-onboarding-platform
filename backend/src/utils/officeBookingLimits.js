const invalid = message => Object.assign(new Error(message), { status: 400 });
export function officeBookingUntil(start, raw) {
  if (raw == null || raw === '') return null;
  const date = raw instanceof Date ? raw.toISOString().slice(0, 10) : String(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(`${date}T00:00:00Z`))
      || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date < String(start).slice(0, 10)) {
    throw invalid('Choose an end date on or after the booking start, or leave it blank for ongoing.');
  }
  return date;
}
export function officeBookingCount(raw) {
  if (raw == null || raw === '') return null;
  const count = Number(raw);
  if (!Number.isInteger(count) || count < 1 || count > 104) throw invalid('Choose 1–104 occurrences, or leave the count blank for ongoing.');
  return count;
}
