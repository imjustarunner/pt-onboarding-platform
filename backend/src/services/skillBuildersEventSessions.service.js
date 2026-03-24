import { zonedWallTimeToUtc, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';
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

function sessionDateToYmd(sessionDate) {
  if (sessionDate == null) return null;
  if (typeof sessionDate === 'string') {
    const s = sessionDate.trim().slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null;
  }
  return toYmd(sessionDate);
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

function makeSessionKey(meetingId, sessionDate) {
  const ymd = sessionDateToYmd(sessionDate);
  if (!ymd) return null;
  return `${Number(meetingId)}|${ymd}`;
}

/**
 * Rebuild skill_builders_event_sessions for a skills group linked to a company event.
 * Updates/deletes/inserts rows while preserving session ids for unchanged (meeting × day) keys
 * so curriculum and provider assignments stay attached when only the program end date extends.
 *
 * @param {import('mysql2/promise').PoolConnection} conn
 * @param {{ skillsGroupId: number }} opts
 */
export async function materializeSkillBuildersEventSessions(conn, { skillsGroupId }) {
  const gid = Number(skillsGroupId);
  if (!Number.isFinite(gid) || gid <= 0) return { created: 0, updated: 0, removed: 0 };

  const [gRows] = await conn.execute(
    `SELECT id, agency_id, company_event_id, start_date, end_date FROM skills_groups WHERE id = ? LIMIT 1`,
    [gid]
  );
  const g = gRows?.[0];
  const eventId = g?.company_event_id != null ? Number(g.company_event_id) : null;
  if (!g || !eventId) {
    return { created: 0, updated: 0, removed: 0 };
  }

  const startYmd = toYmd(g.start_date);
  const endYmd = toYmd(g.end_date);
  if (!startYmd || !endYmd || startYmd > endYmd) {
    const [del] = await conn.execute(`DELETE FROM skill_builders_event_sessions WHERE company_event_id = ?`, [eventId]);
    return { created: 0, updated: 0, removed: Number(del?.affectedRows || 0) };
  }

  const agencyId = Number(g.agency_id);
  const tz = await ProviderAvailabilityService.resolveAgencyTimeZone({ agencyId });

  const [mRows] = await conn.execute(
    `SELECT id, weekday, start_time, end_time FROM skills_group_meetings WHERE skills_group_id = ? ORDER BY id ASC`,
    [gid]
  );
  const meetings = mRows || [];

  /** @type {Array<{ key: string, meetingId: number, ymd: string, startsAt: Date, endsAt: Date, tz: string }>} */
  const desired = [];
  if (meetings.length) {
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
        const mid = Number(row.id);
        const key = `${mid}|${ymd}`;
        desired.push({ key, meetingId: mid, ymd, startsAt, endsAt, tz });
      }
    }
  }

  const desiredKeys = new Set(desired.map((d) => d.key));

  const [existingRows] = await conn.execute(
    `SELECT id, skills_group_meeting_id, session_date FROM skill_builders_event_sessions WHERE company_event_id = ?`,
    [eventId]
  );

  let removed = 0;
  for (const er of existingRows || []) {
    const k = makeSessionKey(er.skills_group_meeting_id, er.session_date);
    if (!k || !desiredKeys.has(k)) {
      // eslint-disable-next-line no-await-in-loop
      const [r] = await conn.execute(`DELETE FROM skill_builders_event_sessions WHERE id = ?`, [Number(er.id)]);
      removed += Number(r?.affectedRows || 0);
    }
  }

  const [existingAfterDel] = await conn.execute(
    `SELECT id, skills_group_meeting_id, session_date FROM skill_builders_event_sessions WHERE company_event_id = ?`,
    [eventId]
  );
  const existingByKey = new Map();
  for (const er of existingAfterDel || []) {
    const k = makeSessionKey(er.skills_group_meeting_id, er.session_date);
    if (k) existingByKey.set(k, er);
  }

  let created = 0;
  let updated = 0;
  for (const d of desired) {
    const ex = existingByKey.get(d.key);
    if (ex) {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `UPDATE skill_builders_event_sessions
         SET starts_at = ?, ends_at = ?, timezone = ?, skills_group_id = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [d.startsAt, d.endsAt, d.tz, gid, Number(ex.id)]
      );
      updated += 1;
    } else {
      // eslint-disable-next-line no-await-in-loop
      await conn.execute(
        `INSERT INTO skill_builders_event_sessions
          (company_event_id, skills_group_id, skills_group_meeting_id, session_date, starts_at, ends_at, timezone)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [eventId, gid, d.meetingId, d.ymd, d.startsAt, d.endsAt, d.tz]
      );
      created += 1;
    }
  }

  return { created, updated, removed };
}

/**
 * When a skills_group-integrated company event’s start/end is edited in the portal (or admin),
 * mirror calendar dates into skills_groups and rebuild materialized sessions (materials, kiosk, schedules).
 */
export async function syncIntegratedSkillsGroupAfterCompanyEventSave(poolRef, agencyId, eventId) {
  const aid = Number(agencyId);
  const eid = Number(eventId);
  if (!Number.isFinite(aid) || aid <= 0 || !Number.isFinite(eid) || eid <= 0) {
    return { synced: false };
  }

  const [typeRows] = await poolRef.execute(
    `SELECT event_type FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
    [eid, aid]
  );
  if (String(typeRows?.[0]?.event_type || '').toLowerCase() !== 'skills_group') {
    return { synced: false };
  }

  const conn = await poolRef.getConnection();
  try {
    await conn.beginTransaction();

    const [evRows] = await conn.execute(
      `SELECT event_type, starts_at, ends_at, timezone FROM company_events WHERE id = ? AND agency_id = ? LIMIT 1`,
      [eid, aid]
    );
    const ev = evRows?.[0];
    if (!ev || String(ev.event_type || '').toLowerCase() !== 'skills_group') {
      await conn.commit();
      return { synced: false };
    }

    const [sgRows] = await conn.execute(
      `SELECT id FROM skills_groups WHERE company_event_id = ? AND agency_id = ? LIMIT 1`,
      [eid, aid]
    );
    const sgId = sgRows?.[0]?.id != null ? Number(sgRows[0].id) : null;
    if (!sgId) {
      await conn.commit();
      return { synced: false };
    }

    const tz = String(ev.timezone || '').trim() || 'UTC';
    const startYmd = utcDateToZonedYmd(ev.starts_at, tz);
    const endYmd = utcDateToZonedYmd(ev.ends_at, tz);
    if (!startYmd || !endYmd || startYmd > endYmd) {
      await conn.rollback();
      const err = new Error('Invalid program date range after save (could not derive calendar dates).');
      err.statusCode = 400;
      throw err;
    }

    await conn.execute(`UPDATE skills_groups SET start_date = ?, end_date = ? WHERE id = ?`, [
      startYmd,
      endYmd,
      sgId
    ]);

    const mat = await materializeSkillBuildersEventSessions(conn, { skillsGroupId: sgId });

    await conn.commit();
    return { synced: true, skillsGroupId: sgId, ...mat };
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}
