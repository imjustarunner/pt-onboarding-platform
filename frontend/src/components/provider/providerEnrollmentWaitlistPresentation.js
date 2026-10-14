export function waitlistSettingLabel(value) {
  const key = String(value || '').toUpperCase();
  return key === 'IN_PERSON' ? 'In person' : key === 'VIRTUAL' ? 'Virtual' : key === 'SCHOOL' ? 'School-based' : 'Either virtual or in person';
}
export function waitlistPreferenceText(value) {
  if (Array.isArray(value)) return value.map(waitlistPreferenceText).filter(Boolean).join(' · ');
  if (value && typeof value === 'object') return String(value.label || value.name || value.value || '').trim();
  return String(value || '').trim();
}
export function waitlistWaitingLabel(joinedAt, now = Date.now()) {
  const joined = new Date(joinedAt).getTime();
  if (!Number.isFinite(joined)) return 'Join date not recorded';
  const days = Math.max(0, Math.floor((now - joined) / 86400000));
  if (!days) return 'Joined today';
  if (days < 7) return `${days} ${days === 1 ? 'day' : 'days'} waiting`;
  const weeks = Math.floor(days / 7);
  return `${weeks} ${weeks === 1 ? 'week' : 'weeks'} waiting`;
}
export function waitlistOpeningLabel(opening) {
  if (!opening?.startAt) return '';
  const start = new Date(opening.startAt);
  const end = new Date(opening.endAt);
  if (!Number.isFinite(start.getTime())) return '';
  let timeZone = opening.timeZone || 'America/Denver';
  try { new Intl.DateTimeFormat('en-US', { timeZone }).format(start); } catch { timeZone = 'America/Denver'; }
  const date = new Intl.DateTimeFormat('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone }).format(start);
  const time = value => new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit', timeZone }).format(value);
  const zone = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(start).find(part => part.type === 'timeZoneName')?.value || timeZone;
  const recurrence = { WEEKLY: 'Weekly', BIWEEKLY: 'Every 2 weeks', EVERY_OTHER_WEEK: 'Every 2 weeks', EVERY_4_WEEKS: 'Every 4 weeks', MONTHLY: 'Monthly', ONE_TIME: 'One time' }[String(opening.frequency || '').toUpperCase()];
  return `${date}, ${time(start)}${Number.isFinite(end.getTime()) ? `–${time(end)}` : ''} ${zone}${recurrence ? ` · ${recurrence}` : ''}`;
}
