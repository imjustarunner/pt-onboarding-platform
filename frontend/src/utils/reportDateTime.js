import { parseUtcInstant } from './timezones';

// SQL DATE values sometimes arrive as midnight ISO strings. These are calendar
// dates, so retain their recorded day instead of shifting them across time zones.
export function reportCalendarDate(value) {
  const raw = value instanceof Date ? value.toISOString() : String(value || '');
  const ymd = raw.match(/^(\d{4}-\d{2}-\d{2})(?:$|[T ])/);
  if (!ymd) return '—';
  const date = new Date(`${ymd[1]}T12:00:00Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== ymd[1]) return '—';
  return date.toLocaleDateString('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric', year: 'numeric' });
}

export function reportViewerDateTime(value) {
  const date = parseUtcInstant(value);
  return date ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' }) : '—';
}

export function payrollPersonName(id, row, people = []) {
  const known = people.find(person => Number(person.id) === Number(id));
  const names = [row?.provider_first_name || row?.first_name || row?.user_first_name || row?.target_user_first_name, row?.provider_last_name || row?.last_name || row?.user_last_name || row?.target_user_last_name];
  return names.filter(Boolean).join(' ').trim() || row?.provider_name || (known && [known.first_name, known.last_name].filter(Boolean).join(' ').trim()) || `User #${Number(id || 0)}`;
}
