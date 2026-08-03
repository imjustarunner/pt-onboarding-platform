export const DEFAULT_AGENCY_TZ = 'America/Denver';

/**
 * Current wall-clock time as MySQL DATETIME in an IANA timezone.
 * Session times / signup_closes_at are stored as naive agency-local DATETIMEs.
 */
export function wallNowMysql(timeZone = DEFAULT_AGENCY_TZ, now = new Date()) {
  const tz = String(timeZone || DEFAULT_AGENCY_TZ).trim() || DEFAULT_AGENCY_TZ;
  const when = now instanceof Date ? now : new Date(now);
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).formatToParts(when);
    const get = (type) => parts.find((p) => p.type === type)?.value || '00';
    let hour = get('hour');
    if (hour === '24') hour = '00';
    return `${get('year')}-${get('month')}-${get('day')} ${hour}:${get('minute')}:${get('second')}`;
  } catch {
    const d = when;
    const pad2 = (n) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())}`;
  }
}

/** Normalize a stored or API wall-clock value to `YYYY-MM-DD HH:MM:SS`. */
export function normalizeMysqlWallDatetime(value) {
  if (!value) return '';
  const raw = String(value).trim().replace('T', ' ');
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})[ ](\d{2}:\d{2}:\d{2})/);
  if (m) return `${m[1]} ${m[2]}`;
  return raw.slice(0, 19);
}

/** True when `nowWall` is strictly before `targetWall` (both MySQL wall datetimes). */
export function isWallMysqlBefore(nowWall, targetWall) {
  const a = normalizeMysqlWallDatetime(nowWall);
  const b = normalizeMysqlWallDatetime(targetWall);
  if (!a || !b) return false;
  return a < b;
}

/** Subtract hours from a wall-clock MySQL datetime without timezone reinterpretation. */
export function subtractHoursFromWallMysql(wallMysql, hours = 1) {
  const wall = normalizeMysqlWallDatetime(wallMysql);
  const m = wall.match(/^(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const h = Number(m[4]);
  const mi = Number(m[5]);
  const s = Number(m[6]);
  const totalMin = ((h * 60) + mi) - (Number(hours || 0) * 60);
  const dayOffset = totalMin < 0 ? -1 : 0;
  const minsInDay = ((totalMin % 1440) + 1440) % 1440;
  const closesH = Math.floor(minsInDay / 60);
  const closesMi = minsInDay % 60;
  const dt = new Date(Date.UTC(y, mo - 1, d + dayOffset, 12, 0, 0));
  if (Number.isNaN(dt.getTime())) return null;
  const pad2 = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${pad2(dt.getUTCMonth() + 1)}-${pad2(dt.getUTCDate())} ${pad2(closesH)}:${pad2(closesMi)}:${pad2(s)}`;
}
