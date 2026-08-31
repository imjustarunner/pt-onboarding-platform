/**
 * Office availability / roster queries for Email App Assistant.
 */
import pool from '../../../config/database.js';
import { formatClock } from '../helpers.js';

export async function listAgencyOffices(agencyId) {
  const [rows] = await pool.execute(
    `SELECT DISTINCT ol.id, ol.name, ol.timezone
     FROM office_locations ol
     JOIN office_location_agencies ola ON ola.office_location_id = ol.id
     WHERE ola.agency_id = ? AND ol.is_active = TRUE
     ORDER BY ol.name ASC
     LIMIT 50`,
    [agencyId]
  );
  return rows || [];
}

export async function getOfficeRoster({ agencyId, dateYmd, locationQuery = null }) {
  const dayStart = `${dateYmd} 00:00:00`;
  const dayEnd = `${dateYmd} 23:59:59`;
  const where = [
    'ola.agency_id = ?',
    'ol.is_active = TRUE',
    'e.start_at >= ?',
    'e.start_at <= ?',
    "(e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')",
    'COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) IS NOT NULL'
  ];
  const params = [agencyId, dayStart, dayEnd];
  if (locationQuery) {
    where.push('ol.name LIKE ?');
    params.push(`%${locationQuery}%`);
  }

  const [rows] = await pool.execute(
    `SELECT
       ol.id AS office_location_id,
       ol.name AS office_name,
       e.start_at,
       e.end_at,
       e.status,
       r.name AS room_name,
       r.room_number,
       COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) AS provider_id,
       COALESCE(
         NULLIF(TRIM(CONCAT(COALESCE(bu.first_name, ''), ' ', COALESCE(bu.last_name, ''))), ''),
         NULLIF(TRIM(CONCAT(COALESCE(au.first_name, ''), ' ', COALESCE(au.last_name, ''))), ''),
         NULLIF(TRIM(CONCAT(COALESCE(su.first_name, ''), ' ', COALESCE(su.last_name, ''))), '')
       ) AS provider_name
     FROM office_events e
     JOIN office_locations ol ON ol.id = e.office_location_id
     JOIN office_location_agencies ola ON ola.office_location_id = ol.id
     JOIN office_rooms r ON r.id = e.room_id
     LEFT JOIN users bu ON e.booked_provider_id = bu.id
     LEFT JOIN users au ON e.assigned_provider_id = au.id
     LEFT JOIN office_standing_assignments sa ON e.standing_assignment_id = sa.id
     LEFT JOIN users su ON sa.provider_id = su.id
     WHERE ${where.join(' AND ')}
     ORDER BY ol.name ASC, e.start_at ASC
     LIMIT 300`,
    params
  );
  return rows || [];
}

export async function getAvailableOfficeSlots({ agencyId, dateYmd, atTime = null, locationQuery = null }) {
  const dayStart = `${dateYmd} 00:00:00`;
  const dayEnd = `${dateYmd} 23:59:59`;
  const where = [
    'ola.agency_id = ?',
    'ol.is_active = TRUE',
    'e.start_at >= ?',
    'e.start_at <= ?',
    "UPPER(COALESCE(e.status, '')) = 'RELEASED'",
    'COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NULL'
  ];
  const params = [agencyId, dayStart, dayEnd];
  if (locationQuery) {
    where.push('ol.name LIKE ?');
    params.push(`%${locationQuery}%`);
  }

  const [rows] = await pool.execute(
    `SELECT
       ol.id AS office_location_id,
       ol.name AS office_name,
       ol.timezone,
       e.start_at,
       e.end_at,
       r.name AS room_name,
       r.room_number
     FROM office_events e
     JOIN office_locations ol ON ol.id = e.office_location_id
     JOIN office_location_agencies ola ON ola.office_location_id = ol.id
     JOIN office_rooms r ON r.id = e.room_id
     WHERE ${where.join(' AND ')}
     ORDER BY ol.name ASC, e.start_at ASC
     LIMIT 300`,
    params
  );

  let slots = rows || [];
  if (atTime && Number.isFinite(atTime.hour)) {
    const targetMin = atTime.hour * 60 + (atTime.min || 0);
    slots = slots.filter((row) => {
      const start = new Date(row.start_at);
      const end = new Date(row.end_at);
      if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime())) return false;
      // Compare using local wall components from the stored datetime string when possible
      const startStr = String(row.start_at);
      const endStr = String(row.end_at);
      const sm = startStr.match(/(\d{2}):(\d{2})/);
      const em = endStr.match(/(\d{2}):(\d{2})/);
      if (sm && em) {
        const sMin = Number(sm[1]) * 60 + Number(sm[2]);
        const eMin = Number(em[1]) * 60 + Number(em[2]);
        return targetMin >= sMin && targetMin < eMin;
      }
      const sMin = start.getHours() * 60 + start.getMinutes();
      const eMin = end.getHours() * 60 + end.getMinutes();
      return targetMin >= sMin && targetMin < eMin;
    });
  }
  return slots;
}

function fmtSlotTime(value, timeZone) {
  try {
    const d = new Date(value);
    if (!Number.isFinite(d.getTime())) return String(value || '').slice(11, 16);
    return d.toLocaleTimeString('en-US', { timeZone: timeZone || 'America/Denver', hour: 'numeric', minute: '2-digit' });
  } catch {
    return String(value || '').slice(11, 16);
  }
}

export function formatOfficeRosterReply({ dateYmd, weekday, rosterRows, availableRows, atTime, timeZone }) {
  const lines = [];
  lines.push(`Office update for ${weekday || dateYmd} (${dateYmd})`);
  if (atTime) lines.push(`Looking at ${formatClock(atTime, timeZone)}.`);
  lines.push('');

  if (rosterRows?.length) {
    lines.push('BOOKED / ASSIGNED');
    let lastOffice = null;
    for (const row of rosterRows) {
      if (row.office_name !== lastOffice) {
        lines.push(`• ${row.office_name}`);
        lastOffice = row.office_name;
      }
      const room = String(row.room_number || row.room_name || '').trim();
      const who = String(row.provider_name || 'Unknown').trim();
      const status = String(row.status || '').toUpperCase() === 'BOOKED' ? 'booked' : 'assigned';
      lines.push(
        `  - ${who} · ${fmtSlotTime(row.start_at, timeZone)}–${fmtSlotTime(row.end_at, timeZone)}${room ? ` · ${room}` : ''} (${status})`
      );
    }
  } else {
    lines.push('BOOKED / ASSIGNED');
    lines.push('  (none)');
  }

  lines.push('');
  if (availableRows?.length) {
    lines.push('AVAILABLE / UNASSIGNED');
    let lastOffice = null;
    for (const row of availableRows.slice(0, 80)) {
      if (row.office_name !== lastOffice) {
        lines.push(`• ${row.office_name}`);
        lastOffice = row.office_name;
      }
      const room = String(row.room_number || row.room_name || '').trim();
      lines.push(
        `  - ${fmtSlotTime(row.start_at, timeZone)}–${fmtSlotTime(row.end_at, timeZone)}${room ? ` · ${room}` : ''}`
      );
    }
    if (availableRows.length > 80) lines.push(`  …and ${availableRows.length - 80} more`);
  } else {
    lines.push('AVAILABLE / UNASSIGNED');
    lines.push(atTime ? '  (none at that time)' : '  (none)');
  }

  return lines.join('\n');
}
