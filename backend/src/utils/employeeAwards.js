export const AWARD_YEARS = [1, 2, 3, 4, 5, 10];
export const DEFAULT_GIFTS = { 1: 'Cup', 2: 'Dinner', 3: 'Pullover' };
export const COMPLETED_AWARD_STATUSES = ['gift_sent', 'acknowledged'];
export function awardError(message, status = 400) { return Object.assign(new Error(message), { status }); }
export function dateOnly(value) {
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
}
export function anniversary(start, years) {
  const s = dateOnly(start);
  if (!s) return null;
  const [year, month, day] = s.split('-').map(Number);
  const last = new Date(Date.UTC(year + years, month, 0)).getUTCDate();
  return `${year + years}-${String(month).padStart(2, '0')}-${String(Math.min(day, last)).padStart(2, '0')}`;
}
export function awardStatus(row, today) {
  if (COMPLETED_AWARD_STATUSES.includes(row.status)) return row.status;
  const date = dateOnly(row.milestone_date);
  return date && date <= today ? 'owed' : 'upcoming';
}
export function serviceDates(row) {
  const start = dateOnly(row.lifecycle_start_date) || dateOnly(row.provider_start_date);
  const client = dateOnly(row.first_client_date);
  const dates = [start, client].filter(Boolean).sort();
  return { start_date: start, first_client_date: client, award_start_date: dates[0] || null };
}
export function agencyToday(timezone = 'America/Denver', now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: timezone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function dinnerInput(body) {
  if (!Array.isArray(body?.milestoneIds)) throw awardError('Select two-year awards.');
  const ids = [...new Set(body?.milestoneIds || [])].map(Number);
  if (!ids.length || ids.length > 200 || ids.some(id => !Number.isSafeInteger(id) || id <= 0)) throw awardError('Select 1–200 two-year awards.');
  const scheduledOn = dateOnly(body.scheduledOn);
  if (!scheduledOn) throw awardError('A valid dinner date is required.');
  const time = String(body.scheduledTime || '').trim();
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw awardError('Use a valid dinner time.');
  const title = String(body.title || 'Two-year dinner').trim();
  if (!title || title.length > 160) throw awardError('Dinner title must be 1–160 characters.');
  if (String(body.location || '').length > 255 || String(body.notes || '').length > 10000) throw awardError('Dinner details are too long.');
  return { ids, scheduledOn, time: time || null, title, location: body.location || null, notes: body.notes || null };
}
