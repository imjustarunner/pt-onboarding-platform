export function normalizeCalendarDisplayTimeZone(value) {
  const zone = String(value || '').trim();
  if (!zone) return '';
  try { new Intl.DateTimeFormat('en-US', { timeZone: zone });return zone; } catch { return ''; }
}
export function calendarDisplayTimeZone({ preferred = '', office = '', fixed = '', officeLayout = false } = {}) {
  const source = normalizeCalendarDisplayTimeZone(office) || 'America/Denver';
  return normalizeCalendarDisplayTimeZone(fixed) || (officeLayout ? source : normalizeCalendarDisplayTimeZone(preferred) || source);
}
