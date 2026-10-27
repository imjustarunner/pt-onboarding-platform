import { toUtcIso, utcDateToZonedYmd, utcMysqlToIso } from './zonedWallTime.util.js';

export function parseEventCheckinCommand(body) {
  const match = String(body || '').trim().toUpperCase().match(/^(CHECKIN|CHECKOUT)(?:\s+(\d{3,18}))?$/);
  return match ? { action: match[1] === 'CHECKIN' ? 'check-in' : 'check-out', code: match[2] || null } : null;
}

export function eventCheckinReminderDue(event, now = new Date()) {
  const start = new Date(toUtcIso(event.occurrence_start || event.starts_at));
  const end = new Date(toUtcIso(event.occurrence_end || event.ends_at));
  return Number.isFinite(start.getTime()) && Number.isFinite(end.getTime())
    && now >= new Date(start.getTime() - 60 * 60000) && now < end
    && utcDateToZonedYmd(now, event.timezone) === utcDateToZonedYmd(start, event.timezone);
}

export function eventAttendanceReminderType(event, now = new Date()) {
  const start = new Date(utcMysqlToIso(event.occurrence_start || event.starts_at));
  const end = new Date(utcMysqlToIso(event.occurrence_end || event.ends_at));
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  if (now >= new Date(end.getTime() + 30 * 60000) && now < new Date(end.getTime() + 24 * 3600000)) return 'missing_checkout';
  if (now >= start && now < end) return 'missing_checkin';
  if (now >= new Date(start.getTime() - 60 * 60000) && now < start
    && utcDateToZonedYmd(now, event.timezone) === utcDateToZonedYmd(start, event.timezone)) return 'checkin';
  return null;
}

export function eventCheckinMessage(event, url, reminderType = 'checkin') {
  const when = new Date(utcMysqlToIso(event.occurrence_start || event.starts_at)).toLocaleString('en-US', { timeZone: event.timezone || 'America/Denver', timeZoneName: 'short' });
  const checkout = reminderType === 'missing_checkout';
  const intro = checkout
    ? `You haven't clocked out of ${event.title} (${when}). The event ended at least 30 minutes ago. If you have finished working, clock out now or choose the actual time your work ended. If you are still working, clock out when you finish.`
    : reminderType === 'missing_checkin'
      ? `${event.title} (${when}) has started and you haven't clocked in. If you are working this event, clock in now. If you are not attending, contact your coordinator.`
      : `You are assigned to ${event.title} (${when}). Clock in when your event work begins and clock out when it ends.`;
  const actionUrl = action => {
    const target = new URL(url);
    target.searchParams.set('attendance', action);
    target.hash = 'event-check-in';
    return target.toString();
  };
  const actions = checkout
    ? [['Clock out now', 'check-out'], ['Choose checkout time', 'checkout-time']]
    : [['Clock in', 'check-in'], ['Clock out', 'check-out']];
  const text = `${intro}\n${actions.map(([label, action]) => `${label}: ${actionUrl(action)}`).join('\n')}`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { subject: `${checkout ? 'Clock-out reminder' : reminderType === 'missing_checkin' ? 'Clock-in reminder' : 'Check in'}: ${event.title}`, text,
    html: `<p>${escape(intro)}</p><p>${actions.map(([label, action]) => `<a href="${escape(actionUrl(action))}" style="display:inline-block;padding:12px 18px;margin:4px;background:#1e40af;color:#ffffff;text-decoration:none;border-radius:6px">${label}</a>`).join(' ')}</p><p>Sign in and confirm your time on the event page.</p>` };
}
