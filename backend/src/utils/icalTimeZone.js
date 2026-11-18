// Embed the actual IANA offset transitions for the finite event window. Calendar
// importers need VTIMEZONE as well as TZID; a fixed UTC RRULE drifts across DST.
const cache = new Map();
const pad = n => String(n).padStart(2, '0');
const stamp = ms => new Date(ms).toISOString().replace(/[-:]/g, '').slice(0, 15);
const offsetStamp = seconds => `${seconds < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(seconds) / 3600))}${pad(Math.floor(Math.abs(seconds) % 3600 / 60))}${seconds % 60 ? pad(Math.abs(seconds) % 60) : ''}`;

export function icalTimeZoneLines(timeZone, startsAt, endsAt) {
  const firstYear = startsAt.getUTCFullYear() - 1;
  const lastYear = endsAt.getUTCFullYear() + 1;
  const key = `${timeZone}|${firstYear}|${lastYear}`;
  if (cache.has(key)) return cache.get(key);
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  const offsetAt = seconds => {
    const p = Object.fromEntries(formatter.formatToParts(new Date(seconds * 1000)).map(part => [part.type, part.value]));
    return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second) / 1000 - seconds;
  };
  const first = Date.UTC(firstYear, 0, 1) / 1000, last = Date.UTC(lastYear + 1, 0, 1) / 1000;
  const lines = ['BEGIN:VTIMEZONE', `TZID:${timeZone}`];
  const observance = (at, from, to) => lines.push('BEGIN:STANDARD', `DTSTART:${stamp((at + from) * 1000)}`, `TZOFFSETFROM:${offsetStamp(from)}`, `TZOFFSETTO:${offsetStamp(to)}`, 'END:STANDARD');
  let previousAt = first, previousOffset = offsetAt(first);
  observance(first, previousOffset, previousOffset);
  for (let at = first + 86400; at <= last; at += 86400) {
    const offset = offsetAt(at);
    if (offset !== previousOffset) {
      let low = previousAt, high = at;
      while (high - low > 1) {
        const middle = Math.floor((low + high) / 2);
        if (offsetAt(middle) === previousOffset) low = middle;
        else high = middle;
      }
      observance(high, previousOffset, offset);
      previousOffset = offset;
    }
    previousAt = at;
  }
  lines.push('END:VTIMEZONE');
  if (cache.size >= 32) cache.delete(cache.keys().next().value);
  cache.set(key, lines);
  return lines;
}
