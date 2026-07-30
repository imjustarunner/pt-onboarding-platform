/**
 * Repair office_events / office_booking_requests still stored as building wall
 * after locations were marked events_stored_utc=1.
 *
 * - Rows with no UTC twin at the converted slot: CONVERT wall → UTC
 * - Rows that collide with an existing UTC twin: merge booking onto the twin (if needed), then DELETE leftover
 *
 * Usage: node backend/src/scripts/repair-office-events-wall-leftovers.mjs
 */
import pool from '../config/database.js';
import { utcToZonedMysqlWall } from '../utils/officeEventDateTime.util.js';
import {
  zonedWallTimeToUtc,
  dateToMysqlUtcDateTime,
  isValidTimeZone
} from '../utils/zonedWallTime.util.js';

function parseWallMysql(raw) {
  if (raw instanceof Date) return {
    year: raw.getUTCFullYear(),
    month: raw.getUTCMonth() + 1,
    day: raw.getUTCDate(),
    hour: raw.getUTCHours(),
    minute: raw.getUTCMinutes(),
    second: raw.getUTCSeconds()
  };
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

function toMysql(raw) {
  if (raw instanceof Date) return dateToMysqlUtcDateTime(raw);
  return String(raw || '').slice(0, 19);
}

function wallToUtcMysql(raw, timeZone) {
  const parts = parseWallMysql(raw);
  if (!parts) return null;
  const tz = isValidTimeZone(timeZone) ? String(timeZone).trim() : 'America/Denver';
  return dateToMysqlUtcDateTime(zonedWallTimeToUtc({ ...parts, timeZone: tz }));
}

function needsRepair(startAtMysql, timeZone) {
  const parts = parseWallMysql(startAtMysql);
  if (!parts) return false;
  if (parts.hour < 7 || parts.hour > 19) return false;
  const wallIfUtc = utcToZonedMysqlWall(toMysql(startAtMysql), timeZone);
  if (!wallIfUtc) return false;
  const localH = Number(String(wallIfUtc).slice(11, 13));
  return localH >= 0 && localH <= 5;
}

function isBooked(row) {
  const st = String(row?.status || '').trim().toUpperCase();
  const ss = String(row?.slot_state || '').trim().toUpperCase();
  return st === 'BOOKED' || ss === 'ASSIGNED_BOOKED';
}

async function repairOfficeEvents() {
  const [rows] = await pool.execute(
    `SELECT e.id, e.room_id, e.start_at, e.end_at, e.status, e.slot_state,
            e.assigned_provider_id, e.booked_provider_id, e.client_id,
            e.appointment_type_code, e.appointment_subtype_code, e.service_code,
            e.modality, e.status_outcome, e.cancellation_reason,
            e.clinical_session_id, e.note_context_id, e.billing_context_id,
            ol.timezone
     FROM office_events e
     INNER JOIN office_locations ol ON ol.id = e.office_location_id
     WHERE e.start_at IS NOT NULL AND e.end_at IS NOT NULL`
  );

  let updated = 0;
  let deleted = 0;
  let merged = 0;
  let skipped = 0;
  const conflicts = [];

  for (const row of rows || []) {
    const tz = row.timezone || 'America/Denver';
    const startRaw = toMysql(row.start_at);
    if (!needsRepair(startRaw, tz)) continue;

    const startAt = wallToUtcMysql(row.start_at, tz);
    const endAt = wallToUtcMysql(row.end_at, tz);
    if (!startAt || !endAt) {
      skipped += 1;
      continue;
    }

    // eslint-disable-next-line no-await-in-loop
    const [twins] = await pool.execute(
      `SELECT id, status, slot_state, assigned_provider_id, booked_provider_id, client_id
       FROM office_events
       WHERE room_id = ? AND start_at = ? AND end_at = ? AND id <> ?
       LIMIT 3`,
      [row.room_id, startAt, endAt, row.id]
    );

    if (!twins.length) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await pool.execute(`UPDATE office_events SET start_at = ?, end_at = ? WHERE id = ?`, [
          startAt,
          endAt,
          row.id
        ]);
        updated += 1;
      } catch (err) {
        if (err?.code === 'ER_DUP_ENTRY') {
          skipped += 1;
        } else {
          throw err;
        }
      }
      continue;
    }

    const twin = twins[0];
    const leftoverBooked = isBooked(row);
    const twinBooked = isBooked(twin);

    if (leftoverBooked && !twinBooked) {
      // eslint-disable-next-line no-await-in-loop
      await pool.execute(
        `UPDATE office_events
         SET status = ?,
             slot_state = ?,
             booked_provider_id = COALESCE(?, booked_provider_id),
             assigned_provider_id = COALESCE(assigned_provider_id, ?),
             client_id = COALESCE(client_id, ?),
             appointment_type_code = COALESCE(appointment_type_code, ?),
             appointment_subtype_code = COALESCE(appointment_subtype_code, ?),
             service_code = COALESCE(service_code, ?),
             modality = COALESCE(modality, ?),
             status_outcome = COALESCE(status_outcome, ?),
             clinical_session_id = COALESCE(clinical_session_id, ?),
             note_context_id = COALESCE(note_context_id, ?),
             billing_context_id = COALESCE(billing_context_id, ?)
         WHERE id = ?`,
        [
          row.status || 'BOOKED',
          row.slot_state || 'ASSIGNED_BOOKED',
          row.booked_provider_id,
          row.assigned_provider_id,
          row.client_id,
          row.appointment_type_code,
          row.appointment_subtype_code,
          row.service_code,
          row.modality,
          row.status_outcome,
          row.clinical_session_id,
          row.note_context_id,
          row.billing_context_id,
          twin.id
        ]
      );
      merged += 1;
    } else if (leftoverBooked && twinBooked) {
      const sameBooked =
        Number(row.booked_provider_id || 0) === Number(twin.booked_provider_id || 0)
        || Number(row.booked_provider_id || 0) === 0
        || Number(twin.booked_provider_id || 0) === 0;
      if (!sameBooked) {
        conflicts.push({
          leftoverId: row.id,
          twinId: twin.id,
          leftoverBooked: row.booked_provider_id,
          twinBooked: twin.booked_provider_id,
          startAt
        });
      }
    }

    // eslint-disable-next-line no-await-in-loop
    await pool.execute(`DELETE FROM office_events WHERE id = ?`, [row.id]);
    deleted += 1;
  }

  return { updated, deleted, merged, skipped, conflicts };
}

async function repairBookingRequests() {
  const [rows] = await pool.execute(
    `SELECT br.id, br.start_at, br.end_at, ol.timezone
     FROM office_booking_requests br
     INNER JOIN office_locations ol ON ol.id = br.office_location_id
     WHERE br.start_at IS NOT NULL AND br.end_at IS NOT NULL`
  );
  let updated = 0;
  for (const row of rows || []) {
    const tz = row.timezone || 'America/Denver';
    if (!needsRepair(toMysql(row.start_at), tz)) continue;
    const startAt = wallToUtcMysql(row.start_at, tz);
    const endAt = wallToUtcMysql(row.end_at, tz);
    if (!startAt || !endAt) continue;
    // eslint-disable-next-line no-await-in-loop
    await pool.execute(`UPDATE office_booking_requests SET start_at = ?, end_at = ? WHERE id = ?`, [
      startAt,
      endAt,
      row.id
    ]);
    updated += 1;
  }
  return updated;
}

async function main() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS app_timezone_migration_flags (
      flag_key VARCHAR(64) NOT NULL PRIMARY KEY,
      flag_value TINYINT(1) NOT NULL DEFAULT 0,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  const events = await repairOfficeEvents();
  const requests = await repairBookingRequests();

  await pool.execute(`
    INSERT INTO app_timezone_migration_flags (flag_key, flag_value)
    VALUES ('office_events_wall_leftovers_repaired', 1)
    ON DUPLICATE KEY UPDATE flag_value = 1
  `);

  console.log(
    JSON.stringify(
      {
        office_events: events,
        office_booking_requests_repaired: requests
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
