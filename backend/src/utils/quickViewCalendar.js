import { isValidTimeZone, zonedWallTimeToUtc } from './zonedWallTime.util.js';

export function quickDayWindow(day, timeZone = 'America/Denver') {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !isValidTimeZone(timeZone)) throw Object.assign(new Error('Valid calendar date and timezone required'), { status: 400 });
  const [year, month, date] = day.split('-').map(Number);
  const check = new Date(Date.UTC(year, month - 1, date));
  if (check.toISOString().slice(0, 10) !== day) throw Object.assign(new Error('Invalid calendar date'), { status: 400 });
  const start = zonedWallTimeToUtc({ year, month, day: date, hour: 0, minute: 0, timeZone });
  check.setUTCDate(check.getUTCDate() + 1);
  const end = zonedWallTimeToUtc({ year: check.getUTCFullYear(), month: check.getUTCMonth() + 1, day: check.getUTCDate(), hour: 0, minute: 0, timeZone });
  return { windowStart: start, windowEnd: end };
}

export function quickMeetingLink(event, { source = 'schedule', viewerId, portalBase } = {}) {
  if (['CANCELLED', 'CANCELED', 'DELETED'].includes(String(event.status || '').toUpperCase())) return null;
  const kind = String(event.kind || '').toUpperCase();
  const meeting = source === 'supervision' || ['TEAM_MEETING', 'HUDDLE'].includes(kind);
  // Calendar blocks and clinical appointments are not automatically video rooms.
  if (!meeting && !event.google_meet_link) return null;
  const platform = Number(event.platform_video_link) === 1 || (source === 'supervision' && !event.google_meet_link && String(event.modality || '').toUpperCase() === 'VIRTUAL');
  if (!platform && event.google_meet_link) {
    try { const url = new URL(event.google_meet_link); if (url.protocol === 'https:') return url.href; } catch { /* invalid configured URL */ }
    return null;
  }
  if (!meeting || !platform || !portalBase) return null;
  const host = Number(source === 'supervision' ? event.supervisor_user_id : event.provider_id) === Number(viewerId);
  const key = (host && event.host_join_token) || event.participant_join_token || event.join_token;
  if (!key) return null;
  return `${portalBase.replace(/\/$/, '')}/join/${source === 'supervision' ? 'supervision' : 'team-meeting'}/${encodeURIComponent(key)}`;
}
