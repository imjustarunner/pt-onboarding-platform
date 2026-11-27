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

const timePattern = /\b(?:\d{1,2}(?::[0-5]\d)?\s*[ap]\.?m\.?|(?:[01]?\d|2[0-3]):[0-5]\d)\b/gi;
const weekdayPattern = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|mon|tue|wed|thu|fri|sat|sun)\b/i;
const minutes = time => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));

function readTimeRange(start, end) {
  const meridiem = value => value.replace(/\./g, '').match(/[ap]m$/i)?.[0];
  const clocks = (value, other) => !meridiem(value) && meridiem(other) && Number(value.split(':')[0].trim()) <= 12
    ? ['AM', 'PM'].map(suffix => agendaClock(`${value} ${suffix}`))
    : [agendaClock(value)];
  const pairs = clocks(start, end).flatMap(from => clocks(end, start).map(to => [from, to]))
    .filter(([from, to]) => from && to && minutes(to) - minutes(from) >= 5 && minutes(to) - minutes(from) <= 240);
  return pairs.length === 1 ? pairs[0] : [null, null];
}

function readAgendaDate(remaining, week, weekday) {
  const iso = remaining.match(/\b\d{4}-\d{2}-\d{2}\b/);
  if (iso) return { date: agendaDate(iso[0]), text: iso[0] };
  const us = remaining.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}|\d{2}))?\b/);
  if (us) {
    const year = Number(week.slice(0, 4));
    const years = us[3] ? [us[3].length === 2 ? 2000 + Number(us[3]) : Number(us[3])] : [year - 1, year, year + 1];
    const weekdayIndex = weekday ? weekdays.findIndex(day => day.startsWith(weekday[0].toLowerCase())) : -1;
    const options = years.map(value => agendaDate(`${value}-${pad(us[1])}-${pad(us[2])}`)).filter(Boolean)
      .filter(date => us[3] || Math.abs(Date.parse(date) - Date.parse(week)) <= 183 * 86400000)
      .filter(date => weekdayIndex < 0 || (new Date(`${date}T12:00:00Z`).getUTCDay() + 6) % 7 === weekdayIndex);
    return { date: options.length === 1 ? options[0] : null, text: us[0] };
  }
  if (weekday) return { date: addAgendaDays(week, weekdays.findIndex(day => day.startsWith(weekday[0].toLowerCase()))), text: '' };
  return null;
}

function agendaRow(raw, index, date, times, remaining, parseErrors = []) {
  const duration = remaining.match(/\b(\d{1,3})\s*(?:minutes?|mins?)\b/i);
  if (duration) remaining = remaining.replace(duration[0], '');
  remaining = remaining.replace(/[|\t]+/g, ' ').replace(/^[\s:–—-]+|[\s:–—-]+$/g, '').replace(/^(?:client|patient)\s*:\s*/i, '').trim();
  const service = remaining.match(/^([^:]+):\s*.+?\(([a-z0-9]{4,7})\)\s*(?:[-–—]\s*(.+))?$/i);
  const clientInput = service ? service[1].trim() : remaining.replace(/\s+[–—-]\s+/g, ' ');
  const [startTime, endTime] = times.length === 2 ? readTimeRange(...times) : [agendaClock(times[0]), null];
  if (times.length > 2) parseErrors.push('More than two times were found. Enter one appointment per row.');
  if (times.length === 2 && !startTime) parseErrors.push('Check the time range and enter a start and end time.');
  return {
    rowId: `line-${index + 1}`, sourceLine: raw.slice(0, 500), clientInput,
    clientId: Number(clientInput.match(/^(?:client\s*)?#(\d+)$/i)?.[1]) || null,
    date, startTime, endTime, durationMinutes: duration ? Number(duration[1]) : null,
    serviceCodeInput: service?.[2].toUpperCase() || '',
    locationInput: service?.[3]?.replace(/\s*[-–—]\s*medicaid\s*$/i, '').trim() || '',
    parseErrors
  };
}

/** Reads one-line rows and day/time/client blocks, retaining unrecognized rows for review. */
export function parseAuricwellAgendaPaste(text, weekStart, { multipleWeeks = false } = {}) {
  const week = validateAgendaWeek(weekStart);
  if (typeof text !== 'string' || !text.trim()) throw fail('Paste the provider’s agenda.');
  if (text.length > 100000) throw fail('Paste at most 100,000 characters at a time.');
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length > 500) throw fail('Import at most 500 agenda lines at a time.');
  const result = [];
  let currentDate = '', pending = null;
  function flushPending() {
    if (pending) result.push(agendaRow(pending.raw, pending.index, pending.date, pending.times, '', ['Choose a client for this time range.']));
    pending = null;
  }
  for (const [index, raw] of lines.entries()) {
    if (/^(?:date|day)\s*[|\t]\s*(?:start|time)/i.test(raw) || (!index && /^\d+$/.test(raw))) continue;
    let remaining = raw.replace(/^[-•*]\s*/, '');
    const weekday = remaining.match(weekdayPattern);
    const heading = readAgendaDate(remaining, week, weekday);
    if (heading) {
      flushPending();
      let date = heading.date || '';
      if (date && multipleWeeks && weekday && !heading.text) {
        const reference = currentDate || week;
        while (date < reference) date = addAgendaDays(date, 7);
      }
      currentDate = date;
      if (heading.text) remaining = remaining.replace(heading.text, '');
      if (weekday) remaining = remaining.replace(weekday[0], '');
    }
    const range = remaining.trim().match(/^(\d{1,2}(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?)\s*[-–—]\s*(\d{1,2}(?::[0-5]\d)?\s*(?:[ap]\.?m\.?)?)\s*$/i);
    if (range) {
      flushPending();
      pending = { raw, index, date: currentDate, times: range.slice(1).map(value => value.trim()) };
      continue;
    }
    const times = [...remaining.matchAll(timePattern)].map(match => match[0]);
    for (const time of times) remaining = remaining.replace(time, '');
    if (heading && !times.length && !remaining.replace(/^[\s:–—|,-]+|[\s:–—|,-]+$/g, '')) continue;
    if (pending && !times.length) {
      result.push(agendaRow(`${pending.raw} · ${raw}`, pending.index, pending.date, pending.times, remaining));
      pending = null;
    } else {
      flushPending();
      result.push(agendaRow(raw, index, currentDate, times, remaining));
    }
  }
  flushPending();
  if (!result.length) throw fail('No appointment rows were found. Include a client and appointment time.');
  return result;
}

const words = value => String(value || '').normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().match(/[\p{L}\p{N}]+/gu) || [];
const compact = value => words(value).join('');

export function matchAgendaClients(clients, input) {
  const key = compact(input);
  if (!key) return [];
  return clients.filter(client => {
    if (compact(client.full_name) === key || compact(client.initials) === key) return true;
    const name = String(client.full_name || '');
    const [last, given] = name.split(',');
    const nameWords = words(name);
    const firstName = given ? words(given)[0] : nameWords[0];
    const lastName = given ? words(last).at(-1) : nameWords.at(-1);
    if (nameWords.length < 2 || !firstName || !lastName) return false;
    return [1, 2, 3].some(length =>
      firstName.length >= length && lastName.length >= length && firstName.slice(0, length) + lastName.slice(0, length) === key);
  });
}

export function agendaLocationKind(label) {
  if (/\b(?:telehealth|telemedicine|virtual|video)\b/i.test(label)) return 'remote';
  if (/^district\s*\d+\b|^d\d+$|^school$/i.test(label)) return 'school';
  if (/\boffice\b/i.test(label)) return 'office';
  return null;
}

export function suggestAgendaLocation(row, locations, schoolIds) {
  const label = row.locationInput;
  const kind = agendaLocationKind(label);
  const key = compact(label);
  const candidates = locations.filter(location => {
    const pos = String(location.place_of_service);
    if (kind === 'school') return pos === '03' && schoolIds.includes(Number(location.school_organization_id));
    if (kind === 'remote' && /^telehealth$|^telemedicine$|^virtual$|^video$/i.test(label)) return ['02', '10'].includes(pos);
    if (kind === 'office' && /^office$|^main office$/i.test(label)) return pos === '11';
    return [location.name, location.billing_office_name, location.street_address, location.billing_office_street].some(value => {
      const token = compact(value);
      return token && (token === key || (kind === 'office' && pos === '11' && token.length >= 8 && key.includes(token)));
    });
  });
  return candidates.length === 1 ? candidates[0] : null;
}

/** Repetition is inferred only for a resolved client and a consistent, observed cadence. */
export function inferAgendaRecurrence(rows) {
  const groups = new Map();
  const lastDate = rows.reduce((latest, row) => agendaDate(row.date) && row.date > latest ? row.date : latest, '');
  for (const row of rows) {
    if (!row.clientId || !row.date || !row.startTime || (!row.endTime && !row.durationMinutes) || row.parseErrors?.length) continue;
    const key = JSON.stringify([row.clientId, row.startTime, row.endTime, row.durationMinutes, row.serviceCodeInput, compact(row.locationInput),
      new Date(`${row.date}T12:00:00Z`).getUTCDay()]);
    const group = groups.get(key) || [];
    group.push(row);
    groups.set(key, group);
  }
  const duplicateRows = new Set();
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => a.date.localeCompare(b.date));
    const [first, second] = group;
    const interval = (Date.parse(second.date) - Date.parse(first.date)) / 86400000;
    if (![7, 14].includes(interval) || group.some((row, index) => row.date !== addAgendaDays(first.date, interval * index))) continue;
    if (addAgendaDays(group.at(-1).date, interval) <= lastDate) continue;
    first.recurrence = interval === 7 ? 'WEEKLY' : 'BIWEEKLY';
    first.pastedDates = group.map(row => row.date);
    for (const row of group.slice(1)) duplicateRows.add(row);
  }
  return rows.filter(row => !duplicateRows.has(row));
}
