/**
 * Office schedule integrity scanning and auto-resolution.
 * GET diagnostics must stay read-only; mutations run via autoResolveIntegrityIssues.
 */

import pool from '../config/database.js';

async function fetchDuplicateEventGroups(agencyIds) {
  const placeholders = agencyIds.map(() => '?').join(',');
  const [dupEventSlots] = await pool.execute(
    `SELECT e.room_id, e.start_at, e.end_at, COUNT(*) AS event_count
     FROM office_events e
     WHERE e.start_at >= NOW()
       AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       AND e.office_location_id IN (
         SELECT DISTINCT ola.office_location_id
         FROM office_location_agencies ola
         WHERE ola.agency_id IN (${placeholders})
       )
     GROUP BY e.room_id, e.start_at, e.end_at
     HAVING COUNT(*) > 1
     ORDER BY e.start_at ASC
     LIMIT 100`,
    agencyIds
  );

  if (!dupEventSlots.length) return [];

  const slotCond = dupEventSlots.map(() => '(e.room_id = ? AND e.start_at = ? AND e.end_at = ?)').join(' OR ');
  const slotParams = dupEventSlots.flatMap((s) => [s.room_id, s.start_at, s.end_at]);
  const [evRows] = await pool.execute(
    `SELECT e.id, e.office_location_id, ol.name AS office_name,
            e.room_id, r.name AS room_name, r.room_number, r.label AS room_label,
            e.start_at, e.end_at, e.status,
            COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name,
            CASE
              WHEN COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NULL THEN 0
              ELSE EXISTS (
                SELECT 1 FROM office_events e2
                WHERE COALESCE(e2.booked_provider_id, e2.assigned_provider_id)
                      = COALESCE(e.booked_provider_id, e.assigned_provider_id)
                  AND e2.start_at < e.end_at
                  AND e2.end_at > e.start_at
                  AND e2.id != e.id
                  AND (e2.status IS NULL OR UPPER(e2.status) <> 'CANCELLED')
              )
            END AS has_other_booking
     FROM office_events e
     JOIN office_locations ol ON ol.id = e.office_location_id
     JOIN office_rooms r ON r.id = e.room_id
     LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
     WHERE (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       AND (${slotCond})
     ORDER BY e.start_at ASC, e.room_id ASC, e.id ASC`,
    slotParams
  );

  const slotMap = new Map();
  for (const row of evRows) {
    const key = `${row.room_id}|${row.start_at}|${row.end_at}`;
    if (!slotMap.has(key)) {
      slotMap.set(key, {
        office_location_id: row.office_location_id,
        office_name: row.office_name,
        room_id: row.room_id,
        room_name: row.room_name,
        room_number: row.room_number,
        room_label: row.room_label,
        start_at: row.start_at,
        end_at: row.end_at,
        events: []
      });
    }
    slotMap.get(key).events.push({
      id: row.id,
      status: row.status || null,
      provider_id: row.provider_id || null,
      provider_name: row.provider_name || null,
      has_other_booking: !!row.has_other_booking
    });
  }
  return [...slotMap.values()];
}

async function fetchDuplicateStandingAssignmentGroups(agencyIds) {
  const placeholders = agencyIds.map(() => '?').join(',');
  const [dupAssignSlots] = await pool.execute(
    `SELECT a.office_location_id, a.room_id, a.weekday, a.hour, COUNT(*) AS assignment_count
     FROM office_standing_assignments a
     WHERE a.is_active = TRUE
       AND a.office_location_id IN (
         SELECT DISTINCT ola.office_location_id
         FROM office_location_agencies ola
         WHERE ola.agency_id IN (${placeholders})
       )
     GROUP BY a.office_location_id, a.room_id, a.weekday, a.hour
     HAVING COUNT(*) > 1
     ORDER BY a.office_location_id ASC, a.room_id ASC, a.weekday ASC, a.hour ASC
     LIMIT 100`,
    agencyIds
  );

  if (!dupAssignSlots.length) return [];

  const aCond = dupAssignSlots.map(() => '(a.office_location_id = ? AND a.room_id = ? AND a.weekday = ? AND a.hour = ?)').join(' OR ');
  const aParams = dupAssignSlots.flatMap((s) => [s.office_location_id, s.room_id, s.weekday, s.hour]);
  const [assignRows] = await pool.execute(
    `SELECT a.id, a.office_location_id, ol.name AS office_name,
            a.room_id, r.name AS room_name, r.room_number, r.label AS room_label,
            a.weekday, a.hour, a.assigned_frequency, a.created_at, a.provider_id,
            TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name
     FROM office_standing_assignments a
     JOIN office_locations ol ON ol.id = a.office_location_id
     JOIN office_rooms r ON r.id = a.room_id
     LEFT JOIN users u ON u.id = a.provider_id
     WHERE a.is_active = TRUE
       AND (${aCond})
     ORDER BY a.office_location_id ASC, a.room_id ASC, a.weekday ASC, a.hour ASC, a.id ASC`,
    aParams
  );

  const aSlotMap = new Map();
  for (const row of assignRows) {
    const key = `${row.office_location_id}|${row.room_id}|${row.weekday}|${row.hour}`;
    if (!aSlotMap.has(key)) {
      aSlotMap.set(key, {
        office_location_id: row.office_location_id,
        office_name: row.office_name,
        room_id: row.room_id,
        room_name: row.room_name,
        room_number: row.room_number,
        room_label: row.room_label,
        weekday: row.weekday,
        hour: row.hour,
        assignments: []
      });
    }
    aSlotMap.get(key).assignments.push({
      id: row.id,
      provider_id: row.provider_id || null,
      provider_name: row.provider_name || null,
      assigned_frequency: row.assigned_frequency || null,
      created_at: row.created_at || null
    });
  }
  return [...aSlotMap.values()];
}

async function fetchProviderDoubleBookings(agencyIds) {
  const placeholders = agencyIds.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT provider_id, provider_name, start_at, end_at,
            COUNT(*) AS booking_count,
            GROUP_CONCAT(event_id ORDER BY event_id) AS event_ids,
            GROUP_CONCAT(room_label ORDER BY room_label SEPARATOR ', ') AS rooms
     FROM (
       SELECT e.id AS event_id,
              COALESCE(e.booked_provider_id, e.assigned_provider_id) AS provider_id,
              TRIM(CONCAT(COALESCE(u.first_name,''), ' ', COALESCE(u.last_name,''))) AS provider_name,
              e.start_at, e.end_at,
              CONCAT(ol.name, ' / ', COALESCE(r.label, r.name)) AS room_label
       FROM office_events e
       JOIN office_locations ol ON ol.id = e.office_location_id
       JOIN office_rooms r ON r.id = e.room_id
       LEFT JOIN users u ON u.id = COALESCE(e.booked_provider_id, e.assigned_provider_id)
       WHERE e.start_at >= NOW()
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         AND UPPER(COALESCE(e.status,'')) = 'BOOKED'
         AND COALESCE(e.booked_provider_id, e.assigned_provider_id) IS NOT NULL
         AND e.office_location_id IN (
           SELECT DISTINCT ola.office_location_id
           FROM office_location_agencies ola
           WHERE ola.agency_id IN (${placeholders})
         )
     ) booked
     GROUP BY provider_id, provider_name, start_at, end_at
     HAVING COUNT(*) > 1
     ORDER BY start_at ASC, provider_name ASC
     LIMIT 100`,
    agencyIds
  );
  return rows || [];
}

/**
 * Read-only integrity scan. Does not mutate any rows.
 */
async function scanIntegrityIssues({ agencyIds }) {
  const [
    duplicateActiveEvents,
    duplicateActiveStandingAssignments,
    providerDoubleBookings
  ] = await Promise.all([
    fetchDuplicateEventGroups(agencyIds),
    fetchDuplicateStandingAssignmentGroups(agencyIds),
    fetchProviderDoubleBookings(agencyIds)
  ]);

  return {
    summary: {
      duplicateActiveEvents: duplicateActiveEvents.length,
      duplicateActiveStandingAssignments: duplicateActiveStandingAssignments.length,
      providerDoubleBookings: providerDoubleBookings.length
    },
    duplicateActiveEvents,
    duplicateActiveStandingAssignments,
    providerDoubleBookings
  };
}

/**
 * Auto-resolve same-provider duplicate events and standing assignments.
 * Returns counts of what was resolved plus remaining issues needing manual review.
 */
async function autoResolveIntegrityIssues({ agencyIds }) {
  const duplicateActiveEvents = await fetchDuplicateEventGroups(agencyIds);
  const duplicateActiveStandingAssignments = await fetchDuplicateStandingAssignmentGroups(agencyIds);

  let autoResolvedEventCount = 0;
  let autoResolvedAssignmentCount = 0;
  const eventsNeedingReview = [];

  for (const group of duplicateActiveEvents) {
    const uniqueProviders = new Set(group.events.map((e) => e.provider_id).filter(Boolean));
    if (uniqueProviders.size <= 1) {
      const sorted = [...group.events].sort((a, b) => {
        const aBooked = (a.status || '').toUpperCase() === 'BOOKED' ? 0 : 1;
        const bBooked = (b.status || '').toUpperCase() === 'BOOKED' ? 0 : 1;
        if (aBooked !== bBooked) return aBooked - bBooked;
        return a.id - b.id;
      });
      const cancelIds = sorted.slice(1).map((e) => e.id);
      if (cancelIds.length) {
        const cancelPlaceholders = cancelIds.map(() => '?').join(',');
        await pool.execute(
          `UPDATE office_events SET status = 'CANCELLED', updated_at = NOW()
           WHERE id IN (${cancelPlaceholders})
             AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
          cancelIds
        );
        autoResolvedEventCount += cancelIds.length;
      }
    } else {
      eventsNeedingReview.push(group);
    }
  }

  const assignmentsNeedingReview = [];
  for (const group of duplicateActiveStandingAssignments) {
    const uniqueProviders = new Set(group.assignments.map((a) => a.provider_id).filter(Boolean));
    if (uniqueProviders.size <= 1) {
      const sorted = [...group.assignments].sort((a, b) => a.id - b.id);
      const deactivateIds = sorted.slice(1).map((a) => a.id);
      if (deactivateIds.length) {
        const dp = deactivateIds.map(() => '?').join(',');
        await pool.execute(
          `UPDATE office_standing_assignments SET is_active = FALSE, updated_at = NOW()
           WHERE id IN (${dp}) AND is_active = TRUE`,
          deactivateIds
        );
        await pool.execute(
          `UPDATE office_events SET status = 'CANCELLED', updated_at = NOW()
           WHERE standing_assignment_id IN (${dp})
             AND start_at >= NOW()
             AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
          deactivateIds
        );
        autoResolvedAssignmentCount += deactivateIds.length;
      }
    } else {
      assignmentsNeedingReview.push(group);
    }
  }

  const providerDoubleBookings = await fetchProviderDoubleBookings(agencyIds);

  return {
    autoResolved: {
      events: autoResolvedEventCount,
      standingAssignments: autoResolvedAssignmentCount
    },
    summary: {
      duplicateActiveEvents: eventsNeedingReview.length,
      duplicateActiveStandingAssignments: assignmentsNeedingReview.length,
      providerDoubleBookings: providerDoubleBookings.length
    },
    duplicateActiveEvents: eventsNeedingReview,
    duplicateActiveStandingAssignments: assignmentsNeedingReview,
    providerDoubleBookings
  };
}

export {
  scanIntegrityIssues,
  autoResolveIntegrityIssues
};
