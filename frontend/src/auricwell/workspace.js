// Navigation stays on this origin and carries the selected practice explicitly.
export function personalToolUrl(slug, tool = 'account') {
  const root = `/${encodeURIComponent(slug)}`;
  const paths = { schedule: '/my-schedule', tasks: '/tasks', notifications: '/notifications', support: '/support' };
  return paths[tool] ? root + paths[tool] : `${root}/dashboard?tab=my&my=${encodeURIComponent(tool)}`;
}
export function dayKey(value = new Date(), timezone = 'America/Denver') {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(date);
  return ['year','month','day'].map(key => parts.find(p => p.type === key).value).join('-');
}
export function shiftDay(day, amount) {
  const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0,10);
}
export function rowsOf(data, key) { return Array.isArray(data) ? data : data?.[key] || data?.items || []; }
export function clientName(client) { return client.full_name || client.client_full_name || [client.first_name,client.last_name].filter(Boolean).join(' ') || client.initials || `Client #${client.client_id || client.id}`; }
export function initials(name) { return String(name || '').split(/\s+/).filter(Boolean).slice(0,2).map(s=>s[0]).join('').toUpperCase(); }
export function pendingDrafts(data) { return (data?.drafts || []).filter(d => !['signed','completed','archived'].includes(String(d.status).toLowerCase()) && !d.provider_signed_at); }
export function appointmentState(row, now = Date.now()) {
  const status = String(row.status || '').toLowerCase();
  if (/cancel|void|rescheduled|no_show/.test(status)) return status.replaceAll('_',' ');
  if (status === 'completed') return 'Completed';
  const start = new Date(row.startAt || row.start_at).getTime(), end = new Date(row.endAt || row.end_at).getTime();
  if (start <= now && end > now) return 'In progress';
  if (end <= now) return 'Past appointment';
  return 'Upcoming';
}
