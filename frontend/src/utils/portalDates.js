// A saved account/organization timezone takes priority over the device timezone.
// Calendar fields (DOB, submitted date) are not instants and must never shift days.
export function portalTimeZone(preferred) {
  let user = {}, agency = {};
  try { user = JSON.parse(localStorage.getItem('user') || '{}') || {}; agency = JSON.parse(localStorage.getItem('currentAgency') || '{}') || {}; } catch { /* optional browser storage */ }
  for (const zone of [preferred, user.timezone, agency.timezone, Intl.DateTimeFormat().resolvedOptions().timeZone, 'UTC']) {
    if (!zone) continue;
    try { new Intl.DateTimeFormat('en', {timeZone: zone}).format(); return zone; } catch { /* try next configured timezone */ }
  }
  return 'UTC';
}
export function portalDateTime(value, {locale, timeZone} = {}) {
  if (!value) return '—';
  const raw = String(value);
  const normalized = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(raw) ? raw.replace(' ', 'T') + 'Z' : value;
  const date = new Date(normalized);
  if (!Number.isFinite(+date)) return '—';
  return new Intl.DateTimeFormat(locale, {year:'numeric',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short',timeZone:portalTimeZone(timeZone)}).format(date);
}
export function portalCalendarDate(value, locale) {
  if (!value) return '—';
  const day = String(value).slice(0,10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return '—';
  const date = new Date(day + 'T12:00:00Z');
  return Number.isFinite(+date) ? new Intl.DateTimeFormat(locale,{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}).format(date) : '—';
}
