/**
 * Resolve a provider's office location from canonical scheduling data
 * (standing assignments / materialized events), with legacy read fallback.
 */

import pool from '../config/database.js';

function mapOfficeRow(r) {
  if (!r) return null;
  return {
    source: 'office_location',
    locationId: Number(r.locationId || 0) || null,
    name: r.locationName || null,
    streetAddress: r.streetAddress || null,
    city: r.city || null,
    state: r.state || null,
    postalCode: r.postalCode || null
  };
}

/**
 * Primary office address for payroll / HR contexts.
 * Prefers active standing assignments; falls back to legacy assignments for pre-migration rows.
 */
async function resolvePrimaryOfficeForUser({ userId, agencyId }) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return null;

  try {
    const [standingRows] = await pool.execute(
      `SELECT
          ol.id AS locationId,
          ol.name AS locationName,
          ol.street_address AS streetAddress,
          ol.city AS city,
          ol.state AS state,
          ol.postal_code AS postalCode
       FROM office_standing_assignments osa
       JOIN office_locations ol ON ol.id = osa.office_location_id
       WHERE osa.provider_id = ?
         AND osa.is_active = TRUE
         AND ol.agency_id = ?
       ORDER BY
         CASE osa.availability_mode
           WHEN 'AVAILABLE' THEN 0
           WHEN 'TEMPORARY' THEN 1
           ELSE 2
         END ASC,
         osa.available_since_date DESC,
         osa.id DESC
       LIMIT 1`,
      [uid, aid]
    );
    const standingOffice = mapOfficeRow(standingRows?.[0]);
    if (standingOffice) return standingOffice;
  } catch {
    // fall through to legacy
  }

  try {
    const [legacyRows] = await pool.execute(
      `SELECT
          ol.id AS locationId,
          ol.name AS locationName,
          ol.street_address AS streetAddress,
          ol.city AS city,
          ol.state AS state,
          ol.postal_code AS postalCode
       FROM office_room_assignments ora
       JOIN office_rooms orr ON orr.id = ora.room_id
       JOIN office_locations ol ON ol.id = orr.location_id
       WHERE ora.assigned_user_id = ?
         AND ol.agency_id = ?
         AND (
           ora.assignment_type = 'PERMANENT'
           OR (ora.start_at <= NOW() AND (ora.end_at IS NULL OR ora.end_at >= NOW()))
         )
       ORDER BY (ora.assignment_type = 'PERMANENT') DESC, ora.start_at DESC, ora.id DESC
       LIMIT 1`,
      [uid, aid]
    );
    return mapOfficeRow(legacyRows?.[0]);
  } catch {
    return null;
  }
}

/**
 * Providers with active office events at a location on a calendar date (kiosk).
 */
async function listProvidersAtLocationOnDate({ locationId, dateYmd }) {
  const locId = Number(locationId || 0);
  const day = String(dateYmd || '').slice(0, 10);
  if (!locId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];

  const windowStart = `${day} 00:00:00`;
  const windowEnd = `${day} 23:59:59`;

  const [rows] = await pool.execute(
    `SELECT DISTINCT
        COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) AS provider_id,
        u.first_name,
        u.last_name
     FROM office_events e
     LEFT JOIN office_standing_assignments sa ON sa.id = e.standing_assignment_id
     JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id)
     WHERE e.office_location_id = ?
       AND e.start_at >= ?
       AND e.start_at <= ?
       AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       AND COALESCE(e.booked_provider_id, e.assigned_provider_id, sa.provider_id) IS NOT NULL
     ORDER BY u.last_name ASC, u.first_name ASC`,
    [locId, windowStart, windowEnd]
  );

  return (rows || []).map((r) => ({
    id: Number(r.provider_id),
    displayName: `${r.first_name || ''} ${(r.last_name || '').slice(0, 1)}.`.trim()
  }));
}

export {
  resolvePrimaryOfficeForUser,
  listProvidersAtLocationOnDate
};
