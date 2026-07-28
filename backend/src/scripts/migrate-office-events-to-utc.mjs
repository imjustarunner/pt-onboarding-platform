/**
 * Fallback when MySQL CONVERT_TZ tables are missing.
 * Converts office_events (+ booking requests) wall → UTC using Node Intl,
 * then sets office_locations.events_stored_utc = 1.
 *
 * Usage: node backend/src/scripts/migrate-office-events-to-utc.mjs
 */
import pool from '../config/database.js';
import { zonedWallTimeToUtc, dateToMysqlUtcDateTime, isValidTimeZone } from '../utils/zonedWallTime.util.js';

function parseWallMysql(raw) {
  const s = String(raw || '').trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
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

function wallToUtcMysql(raw, timeZone) {
  const parts = parseWallMysql(raw);
  if (!parts) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/Denver';
  const utc = zonedWallTimeToUtc({ ...parts, timeZone: tz });
  return dateToMysqlUtcDateTime(utc);
}

async function convertTable(table) {
  const [locs] = await pool.execute(
    `SELECT id, timezone FROM office_locations WHERE COALESCE(events_stored_utc, 0) = 0`
  );
  let updated = 0;
  for (const loc of locs || []) {
    const tz = loc.timezone || 'America/Denver';
    const [rows] = await pool.execute(
      `SELECT id, start_at, end_at FROM ${table} WHERE office_location_id = ?`,
      [loc.id]
    );
    for (const row of rows || []) {
      const startAt = wallToUtcMysql(row.start_at, tz);
      const endAt = wallToUtcMysql(row.end_at, tz);
      if (!startAt || !endAt) continue;
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(`UPDATE ${table} SET start_at = ?, end_at = ? WHERE id = ?`, [
        startAt,
        endAt,
        row.id
      ]);
      updated += 1;
    }
  }
  return updated;
}

async function main() {
  // Ensure marker column exists
  try {
    await pool.execute(
      `ALTER TABLE office_locations
       ADD COLUMN events_stored_utc TINYINT(1) NOT NULL DEFAULT 0
       COMMENT '1 after office_events datetimes were converted from wall local to true UTC'`
    );
  } catch (err) {
    if (err?.code !== 'ER_DUP_FIELDNAME') throw err;
  }

  const events = await convertTable('office_events');
  const requests = await convertTable('office_booking_requests');
  const [mark] = await pool.execute(
    `UPDATE office_locations SET events_stored_utc = 1 WHERE COALESCE(events_stored_utc, 0) = 0`
  );
  console.log(
    JSON.stringify(
      {
        office_events_updated: events,
        office_booking_requests_updated: requests,
        locations_marked: mark?.affectedRows ?? 0
      },
      null,
      2
    )
  );
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
