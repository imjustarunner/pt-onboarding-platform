/**
 * Fallback when MySQL CONVERT_TZ tables are missing.
 * Converts appointments / discovery / planned_outs / reminders wall → UTC.
 *
 * Usage: node backend/src/scripts/migrate-remaining-schedule-instants-to-utc.mjs
 */
import pool from '../config/database.js';
import {
  wallMysqlToUtcMysql,
  isValidTimeZone,
  DEFAULT_SCHEDULE_TZ
} from '../utils/zonedWallTime.util.js';

const FLAG = 'remaining_schedule_instants_stored_utc';

async function ensureFlags() {
  await pool.execute(
    `CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
      flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
      flag_value TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`
  );
  await pool.execute(
    `INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
     VALUES (?, 0) ON DUPLICATE KEY UPDATE flag_key = flag_key`,
    [FLAG]
  );
}

async function agencyTz(agencyId, cache) {
  const aid = Number(agencyId || 0);
  if (cache.has(aid)) return cache.get(aid);
  let tz = DEFAULT_SCHEDULE_TZ;
  if (aid > 0) {
    const [rows] = await pool.execute(`SELECT timezone FROM agencies WHERE id = ? LIMIT 1`, [aid]);
    const raw = String(rows?.[0]?.timezone || '').trim();
    if (isValidTimeZone(raw)) tz = raw;
  }
  cache.set(aid, tz);
  return tz;
}

async function convertTable({ table, startCol, endCol, agencyCol = 'agency_id', cache }) {
  let updated = 0;
  try {
    const [rows] = await pool.execute(
      `SELECT id, ${agencyCol} AS agency_id,
              DATE_FORMAT(${startCol}, '%Y-%m-%d %H:%i:%s') AS start_at,
              ${endCol ? `DATE_FORMAT(${endCol}, '%Y-%m-%d %H:%i:%s') AS end_at` : 'NULL AS end_at'}
       FROM ${table}
       WHERE ${startCol} IS NOT NULL`
    );
    for (const row of rows || []) {
      const tz = await agencyTz(row.agency_id, cache);
      const startAt = wallMysqlToUtcMysql(row.start_at, tz);
      if (!startAt) continue;
      const endAt = endCol && row.end_at ? wallMysqlToUtcMysql(row.end_at, tz) : null;
      if (endCol) {
        // eslint-disable-next-line no-await-in-loop
        await pool.execute(
          `UPDATE ${table} SET ${startCol} = ?, ${endCol} = ? WHERE id = ?`,
          [startAt, endAt, row.id]
        );
      } else {
        // eslint-disable-next-line no-await-in-loop
        await pool.execute(
          `UPDATE ${table} SET ${startCol} = ? WHERE id = ?`,
          [startAt, row.id]
        );
      }
      updated += 1;
    }
  } catch (e) {
    if (!/doesn't exist|ER_NO_SUCH_TABLE|Unknown column/i.test(String(e?.message || ''))) throw e;
  }
  return updated;
}

async function main() {
  await ensureFlags();
  const [flagRows] = await pool.execute(
    `SELECT flag_value FROM app_timezone_migration_flags WHERE flag_key = ? LIMIT 1`,
    [FLAG]
  );
  if (Number(flagRows?.[0]?.flag_value || 0) === 1) {
    console.log(JSON.stringify({ skipped: true, reason: 'already_migrated' }));
    await pool.end();
    return;
  }

  const cache = new Map();
  const appointments = await convertTable({
    table: 'appointments',
    startCol: 'start_at',
    endCol: 'end_at',
    cache
  });
  const discovery = await convertTable({
    table: 'discovery_sessions',
    startCol: 'booked_start_at',
    endCol: 'booked_end_at',
    cache
  });
  const plannedOuts = await convertTable({
    table: 'planned_outs',
    startCol: 'start_at',
    endCol: 'end_at',
    cache
  });
  const reminders = await convertTable({
    table: 'appointment_reminders',
    startCol: 'scheduled_for',
    endCol: null,
    cache
  });

  await pool.execute(
    `UPDATE app_timezone_migration_flags SET flag_value = 1 WHERE flag_key = ?`,
    [FLAG]
  );

  console.log(JSON.stringify({
    appointments,
    discovery_sessions: discovery,
    planned_outs: plannedOuts,
    appointment_reminders: reminders,
    marked: true
  }, null, 2));
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
