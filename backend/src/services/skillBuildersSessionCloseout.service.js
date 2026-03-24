import pool from '../config/database.js';
import { isValidTimeZone, utcDateToZonedYmd } from '../utils/zonedWallTime.util.js';

/**
 * Nightly job: for past sessions (session_date < today in session timezone) where the session
 * "started" (any client check-in on attendance OR a kiosk clock_in tied to the session),
 * mark roster clients without check-in as missed, and auto check-out clients who checked in
 * but never checked out (checkout time = session ends_at).
 */
export async function runSkillBuildersSessionCloseout() {
  const stats = {
    timezones: 0,
    sessionsScanned: 0,
    sessionsStarted: 0,
    missedMarked: 0,
    autoCheckouts: 0,
    skippedNotStarted: 0
  };

  let tzRows = [];
  try {
    const [r] = await pool.execute(
      `SELECT DISTINCT timezone FROM skill_builders_event_sessions WHERE timezone IS NOT NULL AND TRIM(timezone) <> ''`
    );
    tzRows = r || [];
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') {
      return { ok: false, reason: 'tables_missing', ...stats };
    }
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return { ok: false, reason: 'run_migration_606', ...stats };
    }
    throw e;
  }

  try {
  for (const tr of tzRows) {
    const tzRaw = String(tr?.timezone || '').trim();
    const tz = isValidTimeZone(tzRaw) ? tzRaw : 'America/New_York';
    if (!isValidTimeZone(tzRaw) && tzRaw) {
      // eslint-disable-next-line no-continue
      continue;
    }
    stats.timezones += 1;
    const todayYmd = utcDateToZonedYmd(new Date(), tz);
    if (!todayYmd) continue;

    const lowerYmdBound = addDaysYmd(todayYmd, -180);
    let sessions = [];
    try {
      const [sr] = await pool.execute(
        `SELECT id, company_event_id, skills_group_id, session_date, starts_at, ends_at, timezone
         FROM skill_builders_event_sessions
         WHERE timezone = ?
           AND session_date < ?
           AND session_date >= ?`,
        [tz, todayYmd, lowerYmdBound]
      );
      sessions = sr || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return { ok: false, reason: 'tables_missing', ...stats };
      throw e;
    }

    for (const s of sessions) {
      const sessionId = Number(s.id);
      if (!sessionId) continue;
      stats.sessionsScanned += 1;

      const started = await sessionHasStarted(sessionId);
      if (!started) {
        stats.skippedNotStarted += 1;
        continue;
      }
      stats.sessionsStarted += 1;

      const endsAt = s.ends_at;
      const roster = await loadRosterClientIds(Number(s.skills_group_id));
      if (!roster.length) continue;

      for (const clientId of roster) {
        // eslint-disable-next-line no-await-in-loop
        const row = await loadAttendanceRow(sessionId, clientId);
        const hasIn = row?.check_in_at != null;
        const hasOut = row?.check_out_at != null;
        const autoOut = Number(row?.check_out_auto || 0) === 1;

        if (hasIn && !hasOut && !autoOut) {
          // eslint-disable-next-line no-await-in-loop
          const n = await applyAutoCheckout({ sessionId, clientId, endsAt });
          if (n) stats.autoCheckouts += 1;
        } else if (!hasIn) {
          const missedAlready = row?.missed_at != null;
          if (!missedAlready) {
            // eslint-disable-next-line no-await-in-loop
            const n = await applyMissed({ sessionId, clientId });
            if (n) stats.missedMarked += 1;
          }
        }
      }
    }
  }
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      return { ok: false, reason: 'run_migration_606', ...stats };
    }
    throw e;
  }

  return { ok: true, ...stats };
}

function addDaysYmd(ymd, deltaDays) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return '1970-01-01';
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(deltaDays || 0));
  return d.toISOString().slice(0, 10);
}

async function sessionHasStarted(sessionId) {
  const sid = Number(sessionId);
  try {
    const [r] = await pool.execute(
      `SELECT
         (EXISTS (
            SELECT 1 FROM skill_builders_client_session_attendance a
            WHERE a.session_id = ? AND a.check_in_at IS NOT NULL
          )
          OR EXISTS (
            SELECT 1 FROM skill_builders_event_kiosk_punches k
            WHERE k.session_id = ? AND k.punch_type = 'clock_in'
          )) AS started`,
      [sid, sid]
    );
    return !!(r?.[0]?.started === 1 || r?.[0]?.started === true);
  } catch (e) {
    if (e?.code === 'ER_NO_SUCH_TABLE') return false;
    throw e;
  }
}

async function loadRosterClientIds(skillsGroupId) {
  const gid = Number(skillsGroupId);
  if (!gid) return [];
  const [r] = await pool.execute(
    `SELECT client_id FROM skills_group_clients WHERE skills_group_id = ?`,
    [gid]
  );
  return (r || []).map((x) => Number(x.client_id)).filter((n) => Number.isInteger(n) && n > 0);
}

async function loadAttendanceRow(sessionId, clientId) {
  try {
    const [r] = await pool.execute(
      `SELECT id, check_in_at, check_out_at, check_out_auto, missed_at
       FROM skill_builders_client_session_attendance
       WHERE session_id = ? AND client_id = ?
       LIMIT 1`,
      [sessionId, clientId]
    );
    return r?.[0] || null;
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      const [r2] = await pool.execute(
        `SELECT id, check_in_at, check_out_at
         FROM skill_builders_client_session_attendance
         WHERE session_id = ? AND client_id = ?
         LIMIT 1`,
        [sessionId, clientId]
      );
      return r2?.[0] || null;
    }
    throw e;
  }
}

async function applyAutoCheckout({ sessionId, clientId, endsAt }) {
  const sid = Number(sessionId);
  const cid = Number(clientId);
  if (!sid || !cid || endsAt == null) return 0;
  try {
    const [res] = await pool.execute(
      `UPDATE skill_builders_client_session_attendance
       SET check_out_at = ?,
           check_out_auto = 1,
           auto_checkout_at = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE session_id = ?
         AND client_id = ?
         AND check_in_at IS NOT NULL
         AND check_out_at IS NULL
         AND COALESCE(check_out_auto, 0) = 0`,
      [endsAt, endsAt, sid, cid]
    );
    return Number(res?.affectedRows || 0);
  } catch (e) {
    if (e?.code === 'ER_BAD_FIELD_ERROR') {
      const [res2] = await pool.execute(
        `UPDATE skill_builders_client_session_attendance
         SET check_out_at = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE session_id = ?
           AND client_id = ?
           AND check_in_at IS NOT NULL
           AND check_out_at IS NULL`,
        [endsAt, sid, cid]
      );
      return Number(res2?.affectedRows || 0);
    }
    throw e;
  }
}

async function applyMissed({ sessionId, clientId }) {
  const sid = Number(sessionId);
  const cid = Number(clientId);
  if (!sid || !cid) return 0;
  const [upd] = await pool.execute(
    `UPDATE skill_builders_client_session_attendance
     SET missed_at = COALESCE(missed_at, NOW()),
         updated_at = CURRENT_TIMESTAMP
     WHERE session_id = ?
       AND client_id = ?
       AND check_in_at IS NULL
       AND missed_at IS NULL`,
    [sid, cid]
  );
  if (Number(upd?.affectedRows || 0) > 0) return 1;

  const [ex] = await pool.execute(
    `SELECT id FROM skill_builders_client_session_attendance WHERE session_id = ? AND client_id = ? LIMIT 1`,
    [sid, cid]
  );
  if (ex?.[0]) return 0;

  await pool.execute(
    `INSERT INTO skill_builders_client_session_attendance
      (session_id, client_id, missed_at, manual_entry, created_by_user_id, updated_by_user_id)
     VALUES (?, ?, NOW(), 0, NULL, NULL)`,
    [sid, cid]
  );
  return 1;
}

export default { runSkillBuildersSessionCloseout };
