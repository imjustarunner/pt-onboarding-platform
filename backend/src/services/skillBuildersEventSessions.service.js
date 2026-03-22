import { zonedWallTimeToUtc } from '../utils/zonedWallTime.util.js';
import { ProviderAvailabilityService } from './providerAvailability.service.js';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function toYmd(value) {
  if (value == null) return null;
  if (typeof value === 'string') {
    const s = value.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const y = value.getUTCFullYear();
    const m = String(value.getUTCMonth() + 1).padStart(2, '0');
    const d = String(value.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  return null;
}

function* eachYmdInclusive(fromYmd, toYmd) {
  const [fy, fm, fd] = fromYmd.split('-').map(Number);
  const [ty, tm, td] = toYmd.split('-').map(Number);
  const cur = new Date(Date.UTC(fy, fm - 1, fd));
  const end = new Date(Date.UTC(ty, tm - 1, td));
  while (cur <= end) {
    yield cur.toISOString().slice(0, 10);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
}

function ymdToWeekdayLong(ymd) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return WEEKDAYS[dt.getUTCDay()];
}

function parseMysqlTimeParts(t) {
  if (t == null) return null;
  if (t instanceof Date && !Number.isNaN(t.getTime())) {
    const h = t.getUTCHours();
    const mi = t.getUTCMinutes();
    const s = t.getUTCSeconds();
    return { hour: h, minute: mi, second: s };
  }
  const s = String(t).trim();
  const m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!m) return null;
  return { hour: Number(m[1]), minute: Number(m[2]), second: Number(m[3] || 0) };
}

/**
 * Rebuild skill_builders_event_sessions for a skills group linked to a company event.
 * Call after meetings or program dates change (same transaction as meeting writes when possible).
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ skillsGroupId: number }} opts
 */
export async function materializeSkillBuildersEventSessions(conn, { skillsGroupId }) {
  const gid = Number(skillsGroupId);
  if (!Number.isFinite(gid) || gid <= 0) return { created: 0 };

  const [gRows] = await conn.execute(
    `SELECT id, agency_id, company_event_id, start_date, end_date FROM skills_groups WHERE id = ? LIMIT 1`,
    [gid]
  );
  const g = gRows?.[0];
  const eventId = g?.company_event_id != null ? Number(g.company_event_id) : null;
  if (!g || !eventId) {
    return { created: 0 };
  }

  const startYmd = toYmd(g.start_date);
  const endYmd = toYmd(g.end_date);
  if (!startYmd || !endYmd || startYmd > endYmd) {
    await conn.execute(`DELETE FROM skill_builders_event_sessions WHERE company_event_id = ?`, [eventId]);
    return { created: 0 };
  }

  const agencyId = Number(g.agency_id);
  const tz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });

  const [mRows] = await conn.execute(
    `SELECT id, weekday, start_time, end_time FROM skills_group_meetings WHERE skills_group_id = ? ORDER BY id ASC`,
    [gid]
  );
  const meetings = mRows || [];

  await conn.execute(`DELETE FROM skill_builders_event_sessions WHERE company_event_id = ?`, [eventId]);

  if (!meetings.length) return { created: 0 };

  let created = 0;
  for (const ymd of eachYmdInclusive(startYmd, endYmd)) {
    const dow = ymdToWeekdayLong(ymd);
    for (const row of meetings) {
      if (String(row.weekday) !== dow) continue;
      const sp = parseMysqlTimeParts(row.start_time);
      const ep = parseMysqlTimeParts(row.end_time);
      if (!sp || !ep) continue;
      const [Y, M, D] = ymd.split('-').map(Number);
      const startsAt = zonedWallTimeToUtc({
        year: Y,
        month: M,
        day: D,
        hour: sp.hour,
        minute: sp.minute,
        second: sp.second || 0,
        timeZone: tz
      });
      const endsAt = zonedWallTimeToUtc({
        year: Y,
        month: M,
        day: D,
        hour: ep.hour,
        minute: ep.minute,
        second: ep.second || 0,
        timeZone: tz
      });
      if (!Number.isFinite(startsAt.getTime()) || !Number.isFinite(endsAt.getTime())) continue;
      if (endsAt.getTime() <= startsAt.getTime()) continue;

      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO skill_builders_event_sessions
          (company_event_id, skills_group_id, skills_group_meeting_id, session_date, starts_at, ends_at, timezone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [eventId, gid, Number(row.id), ymd, startsAt, endsAt, tz]
      );
      created += 1;
    }
  }

  return { created };
}
