const date = value => {
  if (value instanceof Date) return value;
  const raw = String(value || '').replace(' ', 'T');
  return new Date(/[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : `${raw}Z`);
};
const stamp = value => date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
const escape = value => String(value || '').replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
// RFC 5545 folds by octets, without splitting a UTF-8 character.
function fold(line) {
  const lines = []; let current = '';
  for (const char of line) {
    if (Buffer.byteLength(current + char, 'utf8') > 75) { lines.push(current); current = ' '; }
    current += char;
  }
  return [...lines, current].join('\r\n');
}
export function interviewCalendar({ startsAt, endsAt, timezone = 'America/Denver', title, publicJoinUrl, interviewId = 'preview', now = new Date() }) {
  const start = date(startsAt), end = date(endsAt);
  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) return null;
  const whenLabel = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' }).format(start);
  const dateLabel = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(start);
  const timeFormat = new Intl.DateTimeFormat('en-US', { timeZone: timezone, hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
  const endDateLabel = new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }).format(end);
  const timeLabel = `${timeFormat.format(start)} – ${endDateLabel !== dateLabel ? `${endDateLabel}, ` : ''}${timeFormat.format(end)}`;
  const description = `We look forward to meeting you. Join your interview: ${publicJoinUrl}`;
  const params = new URLSearchParams({ action: 'TEMPLATE', text: title, dates: `${stamp(start)}/${stamp(end)}`, ctz: timezone, details: description, location: publicJoinUrl });
  const outlook = new URLSearchParams({ path: '/calendar/action/compose', rru: 'addevent', subject: title, startdt: start.toISOString(), enddt: end.toISOString(), body: description, location: publicJoinUrl });
  let downloadUrl = '';
  try { const join = new URL(publicJoinUrl); const token = join.pathname.split('/').filter(Boolean).pop(); downloadUrl = `${join.origin}/api/team-meetings/${encodeURIComponent(token)}/calendar.ics`; } catch { /* preview placeholder */ }
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//People Operations//Interview//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    `UID:hiring-interview-${escape(interviewId)}@people-operations`, `DTSTAMP:${stamp(now)}`, `DTSTART:${stamp(start)}`, `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(title)}`, `DESCRIPTION:${escape(description)}`, `URL:${publicJoinUrl}`, 'END:VEVENT', 'END:VCALENDAR'].map(fold).join('\r\n') + '\r\n';
  return { whenLabel, dateLabel, timeLabel, googleUrl: `https://calendar.google.com/calendar/render?${params}`, outlookUrl: `https://outlook.live.com/calendar/0/deeplink/compose?${outlook}`, downloadUrl, ics };
}
