import { activeOfficeProviderSql } from '../utils/officeProviderEligibility.js';

// Read-only: a request is not a reservation or a public opening. Select no client data.
export async function listPendingOfficeBookingRequests(db, { agencyIds, providerId = null, officeLocationId = null }) {
  const ids = [...new Set((agencyIds || []).map(Number).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return [];
  const [rows] = await db.execute(`SELECT r.id, r.requested_provider_id AS providerId,
    r.office_location_id AS officeLocationId, r.room_id AS roomId,
    r.start_at AS startAt, r.end_at AS endAt, r.recurrence AS frequency,
    r.booked_occurrence_count AS occurrenceCount, r.created_at AS submittedAt,
    CONCAT_WS(' ', u.first_name, u.last_name) AS providerName,
    l.name AS officeName, l.timezone AS timeZone, rm.room_number AS roomNumber,
    COALESCE(rm.label, rm.name) AS roomLabel
    FROM office_booking_requests r JOIN users u ON u.id=r.requested_provider_id
    JOIN office_locations l ON l.id=r.office_location_id
    LEFT JOIN office_rooms rm ON rm.id=r.room_id
    WHERE r.status='PENDING' AND r.request_type='PROVIDER_REQUEST'
      AND ${activeOfficeProviderSql('u')}
      AND EXISTS (SELECT 1 FROM office_location_agencies ola
        WHERE ola.office_location_id=r.office_location_id AND ola.agency_id IN (${ids.map(() => '?').join(',')}))
      AND (? IS NULL OR r.requested_provider_id=?)
      AND (? IS NULL OR r.office_location_id=?)
    ORDER BY r.start_at, r.id`, [...ids, providerId, providerId, officeLocationId, officeLocationId]);
  const iso = value => value instanceof Date ? value.toISOString() : `${String(value).replace(' ', 'T').replace(/Z$/, '')}Z`;
  return rows.map(r => ({ ...r, startAt: iso(r.startAt), endAt: iso(r.endAt), status: 'PENDING' }));
}
