import { toUtcIso, utcDateToZonedYmd } from './zonedWallTime.util.js';

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

export function eventCheckinMessage(event, url) {
  const when = new Date(toUtcIso(event.occurrence_start || event.starts_at)).toLocaleString('en-US', { timeZone: event.timezone || 'America/Denver', timeZoneName: 'short' });
  const text = `You are assigned to ${event.title} (${when}). Check in when your event work begins and check out when it ends. Open your event page to record actual travel to and from the event under Support Activity → Approved Travel, paid at your Support Activity rate. ${url}`;
  const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  return { subject: `Check in: ${event.title}`, text,
    html: `<p>${escape(text.replace(url, ''))}</p><p><a href="${escape(url)}">Check in</a></p><p>Use the same page to check out and submit each travel direction separately.</p>` };
}
