function signedInstant(value) {
  const raw = typeof value === 'string' && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d(?:\.\d+)?$/.test(value)
    ? `${value.replace(' ', 'T')}Z` : value;
  const date = raw instanceof Date ? new Date(raw) : new Date(raw);
  if (!Number.isFinite(date.getTime())) throw new Error('signedAt is invalid');
  return date;
}

export function schoolRoiCalendarDates(value, timeZone = 'America/Denver') {
  const date = signedInstant(value);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: timeZone || 'America/Denver', year: 'numeric', month: '2-digit', day: '2-digit'
  }).formatToParts(date).map(part => [part.type, part.value]));
  const effectiveDate = `${parts.year}-${parts.month}-${parts.day}`;
  const expiry = new Date(`${effectiveDate}T12:00:00Z`);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 3);
  return { effectiveDate, roiExpiresAt: expiry.toISOString().slice(0, 10) };
}

export function schoolRoiSignedTimestamp(value, timeZone = 'America/Denver', locale = 'en') {
  if (!value) return '—';
  return signedInstant(value).toLocaleString(locale === 'es' ? 'es-US' : 'en-US', {
    timeZone: timeZone || 'America/Denver', year: 'numeric', month: 'long', day: 'numeric',
    hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short'
  });
}
