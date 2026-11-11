const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
const fail = message => Object.assign(new Error(message), { status: 400 });
const pad = value => String(value).padStart(2, '0');

export function agendaDate(value) {
  const text = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return null;
  const parsed = new Date(`${text}T12:00:00Z`);
  return Number.isFinite(+parsed) && parsed.toISOString().slice(0, 10) === text ? text : null;
}

export function addAgendaDays(date, days) {
  const result = new Date(`${date}T12:00:00Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}

export function agendaClock(value) {
  const text = String(value || '').trim().replace(/\./g, '');
  const match = text.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)?$/i);
  if (!match) return null;
  let hour = Number(match[1]);
  const meridiem = String(match[3] || '').toLowerCase();
  if (meridiem) {
    if (hour < 1 || hour > 12) return null;
    hour = hour % 12 + (meridiem === 'pm' ? 12 : 0);
  } else if (!match[2] || hour > 23) return null;
  return `${pad(hour)}:${match[2] || '00'}`;
}

export function validateAgendaWeek(value) {
  const date = agendaDate(value);
  if (!date || new Date(`${date}T12:00:00Z`).getUTCDay() !== 1) throw fail('Choose the Monday that starts the imported week.');
  return date;
}

/** Deterministic suggestions only. Unknown lines remain visible for explicit correction. */
export function parseAuricwellAgendaPaste(text, weekStart) {
  const week = validateAgendaWeek(weekStart);
  if (typeof text !== 'string' || !text.trim()) throw fail('Paste the provider’s weekly agenda.');
  if (text.length > 100000) throw fail('Paste at most 100,000 characters at a time.');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 200) throw fail('Import at most 200 agenda lines at a time.');
  const result = [];
  let currentDate = '';
  for (const [index, raw] of lines.entries()) {
    if (/^(?:date|day)\s*[|\t]\s*(?:start|time)/i.test(raw)) continue;
    let remaining = raw.replace(/^[-•*]\s*/, '');
    let date = '';
    const iso = remaining.match(/\b\d{4}-\d{2}-\d{2}\b/);
    const us = !iso && remaining.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
    const weekday = remaining.match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i);
    if (iso) { date = iso[0]; remaining = remaining.replace(iso[0], ''); }
    if (us) { date = `${us[3]}-${pad(us[1])}-${pad(us[2])}`; remaining = remaining.replace(us[0], ''); }
    if (weekday) {
      if (!date) date = addAgendaDays(week, weekdays.findIndex(day => day.startsWith(weekday[0].toLowerCase())));
      remaining = remaining.replace(weekday[0], '');
    }
    if (date) currentDate = date;
    const timePattern = /\b(?:\d{1,2}(?::[0-5]\d)?\s*[ap]\.?m\.?|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
    const times = [...remaining.matchAll(timePattern)].map(match => match[0]);
    for (const time of times) remaining = remaining.replace(time, '');
    const duration = remaining.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i);
    if (duration) remaining = remaining.replace(duration[0], '');
    remaining = remaining.replace(/[|\t]+/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').replace(/\s+[–—-]\s+/g, ' ').replace(/^(?:client|patient)\s*:\s*/i, '').trim();
    if (date && !times.length && !remaining) continue;
    result.push({
      rowId: `line-${index + 1}`, sourceLine: raw.slice(0, 500), clientInput: remaining,
      clientId: Number(remaining.match(/^(?:client\s*)?#(\d+)$/i)?.[1]) || null,
      date: date || currentDate, startTime: agendaClock(times[0]), endTime: agendaClock(times[1]),
      durationMinutes: duration ? Number(duration[1]) : null,
      parseErrors: times.length > 2 ? ['More than two times were found. Enter one appointment per row.'] : []
    });
  }
  if (!result.length) throw fail('No appointment rows were found. Include a client and appointment time.');
  return result;
}
