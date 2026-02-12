function parseMySqlDateTimeParts(v) {
  const s = String(v || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  return {
    year: Number(m[1]),
    month: Number(m[2]),
    day: Number(m[3]),
    hour: Number(m[4]),
    minute: Number(m[5]),
    second: Number(m[6] || 0)
  };
}

function getTimeZoneOffsetMs(dateUtc, timeZone) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  });
  const parts = dtf.formatToParts(dateUtc);
  const val = (t) => Number(parts.find((p) => p.type === t)?.value || 0);
  const asUtc = Date.UTC(val('year'), val('month') - 1, val('day'), val('hour'), val('minute'), val('second'));
  return asUtc - dateUtc.getTime();
}

function zonedWallToUtcMs(parts, timeZone) {
  const approxUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second || 0);
  let guess = approxUtc;
  for (let i = 0; i < 4; i += 1) {
    const off = getTimeZoneOffsetMs(new Date(guess), timeZone);
    const candidate = approxUtc - off;
    if (candidate === guess) break;
    guess = candidate;
  }
  return guess;
}

function toMysqlDateTimeUtc(ms) {
  const d = new Date(ms);
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  const ss = String(d.getUTCSeconds()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi}:${ss}`;
}

export function wallMySqlToUtcDateTime(wallDateTime, timeZone) {
  const parts = parseMySqlDateTimeParts(wallDateTime);
  if (!parts) return null;
  const tz = String(timeZone || 'UTC');
  const utcMs = zonedWallToUtcMs(parts, tz);
  return toMysqlDateTimeUtc(utcMs);
}

export function isBookedOfficeEventForLearningLink(officeEvent) {
  const slotState = String(officeEvent?.slot_state || '').toUpperCase();
  const status = String(officeEvent?.status || '').toUpperCase();
  return slotState === 'ASSIGNED_BOOKED' || status === 'BOOKED';
}
