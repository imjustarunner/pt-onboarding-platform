// An unbooked room assignment may be planned further ahead than a client booking.
export function assertOfficeAssignmentPlanningDate(date, timeZone = 'America/Denver', now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
    .formatToParts(now);
  const values = Object.fromEntries(parts.map(p => [p.type, p.value]));
  const year = Number(values.year) + 1;
  const month = Number(values.month);
  const day = Math.min(Number(values.day), new Date(Date.UTC(year, month, 0)).getUTCDate());
  const lastDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw Object.assign(new Error('Choose a valid assignment start date.'), { status: 400 });
  }
  if (date > lastDate) {
    throw Object.assign(new Error(`Assigned Available can start up to one year ahead (${lastDate}).`), { status: 400 });
  }
}
