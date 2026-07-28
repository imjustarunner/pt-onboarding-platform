/**
 * Post-migration sanity check for office_events UTC storage.
 *
 * Usage: node backend/src/scripts/verify-office-events-utc.mjs
 *
 * Exits 0 when all locations are marked migrated and sample wall hours look sane.
 */
import pool from '../config/database.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';

async function main() {
  const issues = [];

  let hasColumn = true;
  try {
    await pool.execute(`SELECT events_stored_utc FROM office_locations LIMIT 1`);
  } catch (err) {
    if (err?.code === 'ER_BAD_FIELD_ERROR') {
      hasColumn = false;
      issues.push('Column office_locations.events_stored_utc missing — run migration 1065.');
    } else {
      throw err;
    }
  }

  if (hasColumn) {
    const [locs] = await pool.execute(
      `SELECT id, name, timezone, events_stored_utc FROM office_locations ORDER BY id`
    );
    const pending = (locs || []).filter((r) => Number(r.events_stored_utc) !== 1);
    if (pending.length) {
      issues.push(
        `${pending.length} location(s) not marked migrated (events_stored_utc != 1): ` +
          pending.map((r) => `${r.name || r.id}`).join(', ')
      );
    } else {
      console.log(`OK: ${locs.length} office location(s) have events_stored_utc = 1`);
    }

    for (const loc of locs || []) {
      const tz = String(loc.timezone || '').trim() || 'America/Denver';
      const [conv] = await pool.execute(
        `SELECT CONVERT_TZ('2026-01-15 12:00:00', ?, 'UTC') AS utc`,
        [tz]
      );
      if (!conv?.[0]?.utc) {
        issues.push(`CONVERT_TZ unavailable for ${loc.name || loc.id} (${tz}) — use migrate-office-events-to-utc.mjs`);
      }
    }
  }

  const [samples] = await pool.execute(
    `SELECT e.id, e.start_at, e.end_at, ol.name AS office_name, ol.timezone
     FROM office_events e
     INNER JOIN office_locations ol ON ol.id = e.office_location_id
     WHERE e.start_at IS NOT NULL
       AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
     ORDER BY e.start_at DESC
     LIMIT 500`
  );

  const hourBuckets = new Map();
  let badWall = 0;
  for (const row of samples || []) {
    const tz = String(row.timezone || '').trim() || 'America/Denver';
    const wall = utcToZonedMysqlWall(row.start_at, tz);
    if (!wall) {
      badWall += 1;
      continue;
    }
    const hour = Number(wall.slice(11, 13));
    const key = `${row.office_name || 'office'}:${hour}`;
    hourBuckets.set(key, (hourBuckets.get(key) || 0) + 1);
    // Obvious double-migration: slots land at midnight–3 AM local (not normal office grid hours).
    if (hour >= 0 && hour <= 3) badWall += 1;
  }

  if (samples?.length >= 20 && badWall > (samples.length * 0.25)) {
    issues.push(
      `Many recent events convert to midnight–3 AM local (${badWall}/${samples.length}) — possible double migration`
    );
  }

  const topHours = [...hourBuckets.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([k, n]) => `${k}=${n}`);
  if (topHours.length) {
    console.log('Sample local start hours (recent events):', topHours.join(', '));
  }

  if (issues.length) {
    console.error('\nVERIFY FAILED:');
    for (const msg of issues) console.error(' -', msg);
    process.exit(1);
  }

  console.log('\nVERIFY PASSED: office events UTC migration looks consistent.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
