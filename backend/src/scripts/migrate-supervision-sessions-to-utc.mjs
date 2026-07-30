/**
 * Fallback when MySQL CONVERT_TZ tables are missing.
 * Converts supervision_sessions start_at/end_at/signup_closes_at wall → UTC,
 * then sets agencies.supervision_times_stored_utc = 1.
 *
 * Usage: node backend/src/scripts/migrate-supervision-sessions-to-utc.mjs
 */
import pool from '../config/database.js';
import {
  wallMysqlToUtcMysql,
  isValidTimeZone,
  DEFAULT_SCHEDULE_TZ
} from '../utils/zonedWallTime.util.js';

async function ensureMarkerColumn() {
  try {
    await pool.execute(
      `ALTER TABLE agencies
       ADD COLUMN supervision_times_stored_utc TINYINT(1) NOT NULL DEFAULT 0
       COMMENT '1 after supervision_sessions datetimes were converted from wall local to true UTC'`
    );
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }
}

async function main() {
  await ensureMarkerColumn();

  const [agencies] = await pool.execute(
    `SELECT id, timezone FROM agencies WHERE COALESCE(supervision_times_stored_utc, 0) = 0`
  );

  let updated = 0;
  for (const agency of agencies || []) {
    const tz = isValidTimeZone(agency.timezone)
      ? String(agency.timezone).trim()
      : DEFAULT_SCHEDULE_TZ;
    const [rows] = await pool.execute(
      `SELECT id,
              DATE_FORMAT(start_at, '%Y-%m-%d %H:%i:%s') AS start_at,
              DATE_FORMAT(end_at, '%Y-%m-%d %H:%i:%s') AS end_at,
              DATE_FORMAT(signup_closes_at, '%Y-%m-%d %H:%i:%s') AS signup_closes_at
       FROM supervision_sessions
       WHERE agency_id = ?`,
      [agency.id]
    );
    for (const row of rows || []) {
      const startAt = wallMysqlToUtcMysql(row.start_at, tz);
      const endAt = wallMysqlToUtcMysql(row.end_at, tz);
      if (!startAt || !endAt) continue;
      const closesAt = row.signup_closes_at
        ? wallMysqlToUtcMysql(row.signup_closes_at, tz)
        : null;
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE supervision_sessions
         SET start_at = ?, end_at = ?, signup_closes_at = ?
         WHERE id = ?`,
        [startAt, endAt, closesAt, row.id]
      );
      updated += 1;
    }
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(
      `UPDATE agencies SET supervision_times_stored_utc = 1 WHERE id = ?`,
      [agency.id]
    );
  }

  console.log(JSON.stringify({ supervision_sessions_updated: updated, agencies: (agencies || []).length }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
