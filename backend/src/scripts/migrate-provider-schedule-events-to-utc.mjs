/**
 * Fallback when MySQL CONVERT_TZ tables are missing.
 * Converts remaining wall provider_schedule_events + fall check-in DATETIMEs → UTC.
 *
 * Usage: node backend/src/scripts/migrate-provider-schedule-events-to-utc.mjs
 */
import pool from '../config/database.js';
import {
  wallMysqlToUtcMysql,
  isValidTimeZone,
  DEFAULT_SCHEDULE_TZ
} from '../utils/zonedWallTime.util.js';

const MEETING_KINDS = new Set(['TEAM_MEETING', 'HUDDLE']);
const FALL_KINDS = new Set(['FALL_CHECKIN_PRESLOT', 'FALL_CHECKIN_BOOKED']);

async function ensureFlagsTable() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
      flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
      flag_value TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await pool.execute(
    `INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
     VALUES ('schedule_events_stored_utc', 0)
     ON DUPLICATE KEY UPDATE flag_key = flag_key`
  );
}

async function agencyTz(agencyId, cache) {
  const aid = Number(agencyId || 0);
  if (cache.has(aid)) return cache.get(aid);
  let tz = DEFAULT_SCHEDULE_TZ;
  if (aid > 0) {
    const [rows] = await pool.execute(
      `SELECT timezone FROM agencies WHERE id = ? LIMIT 1`,
      [aid]
    );
    const raw = String(rows?.[0]?.timezone || '').trim();
    if (isValidTimeZone(raw)) tz = raw;
  }
  cache.set(aid, tz);
  return tz;
}

function shouldConvertPse(row) {
  if (Number(row.all_day || 0) === 1) return false;
  if (!row.start_at || !row.end_at) return false;
  const kind = String(row.kind || '').toUpperCase();
  if (MEETING_KINDS.has(kind)) return false;
  const gid = String(row.google_event_id || '').trim();
  if (gid && !FALL_KINDS.has(kind)) return false;
  return true;
}

async function main() {
  await ensureFlagsTable();
  const [flagRows] = await pool.execute(
    `SELECT flag_value FROM app_timezone_migration_flags
     WHERE flag_key = 'schedule_events_stored_utc' LIMIT 1`
  );
  if (Number(flagRows?.[0]?.flag_value || 0) === 1) {
    console.log(JSON.stringify({ skipped: true, reason: 'already_migrated' }));
    await pool.end();
    return;
  }

  const tzCache = new Map();
  let pseUpdated = 0;
  let slotsUpdated = 0;
  let bookingsUpdated = 0;

  const [pseRows] = await pool.execute(
    `SELECT id, agency_id, kind, all_day, google_event_id,
            DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
            DATE_FORMAT(end_at, '%Y-%m-%d %H:%i:%s') AS end_at
     FROM provider_schedule_events
     WHERE start_at IS NOT NULL AND end_at IS NOT NULL`
  );
  for (const row of pseRows || []) {
    if (!shouldConvertPse(row)) continue;
    const tz = await agencyTz(row.agency_id, tzCache);
    const startAt = wallMysqlToUtcMysql(row.start_at, tz);
    const endAt = wallMysqlToUtcMysql(row.end_at, tz);
    if (!startAt || !endAt) continue;
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(
      `UPDATE provider_schedule_events SET start_at = ?, end_at = ? WHERE id = ?`,
      [startAt, endAt, row.id]
    );
    pseUpdated += 1;
  }

  try {
    const [slotRows] = await pool.execute(
      `SELECT id, agency_id,
              DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
              DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at
       FROM school_reinit_checkin_slots
       WHERE starts_at IS NOT NULL`
    );
    for (const row of slotRows || []) {
      const tz = await agencyTz(row.agency_id, tzCache);
      const startsAt = wallMysqlToUtcMysql(row.starts_at, tz);
      const endsAt = row.ends_at ? wallMysqlToUtcMysql(row.ends_at, tz) : null;
      if (!startsAt) continue;
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE school_reinit_checkin_slots SET starts_at = ?, ends_at = ? WHERE id = ?`,
        [startsAt, endsAt, row.id]
      );
      slotsUpdated += 1;
    }
  } catch (e) {
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(e?.message || ''))) throw e;
  }

  try {
    const [bookingRows] = await pool.execute(
      `SELECT id, agency_id,
              DATE_FORMAT(starts_at, '%Y-%m-%d %H:%i:%s') AS starts_at,
              DATE_FORMAT(ends_at, '%Y-%m-%d %H:%i:%s') AS ends_at
       FROM school_reinit_checkin_bookings
       WHERE starts_at IS NOT NULL`
    );
    for (const row of bookingRows || []) {
      const tz = await agencyTz(row.agency_id, tzCache);
      const startsAt = wallMysqlToUtcMysql(row.starts_at, tz);
      const endsAt = row.ends_at ? wallMysqlToUtcMysql(row.ends_at, tz) : null;
      if (!startsAt) continue;
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE school_reinit_checkin_bookings SET starts_at = ?, ends_at = ? WHERE id = ?`,
        [startsAt, endsAt, row.id]
      );
      bookingsUpdated += 1;
    }
  } catch (e) {
    if (!/doesn't exist|ER_NO_SUCH_TABLE/i.test(String(e?.message || ''))) throw e;
  }

  await pool.execute(
    `UPDATE app_timezone_migration_flags
     SET flag_value = 1
     WHERE flag_key = 'schedule_events_stored_utc'`
  );

  console.log(JSON.stringify({
    provider_schedule_events_updated: pseUpdated,
    school_reinit_checkin_slots_updated: slotsUpdated,
    school_reinit_checkin_bookings_updated: bookingsUpdated,
    marked: true
  }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
