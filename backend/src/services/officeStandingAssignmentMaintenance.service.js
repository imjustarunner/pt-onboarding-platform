import pool from '../config/database.js';
import { auditExpiredOfficeAssignments, retireInactiveOfficePlans } from './officeAssignmentExpiry.service.js';
import OfficeScheduleMaterializer from './officeScheduleMaterializer.service.js';

/**
 * Retire standing assignments that can no longer appear on the schedule grid.
 *
 * Safe to run after materialization. Only auto-deactivates:
 * 1. TEMPORARY assignments whose temporary_until_date has passed.
 *
 * AVAILABLE weekly/biweekly rows are NEVER killed solely because future events
 * are missing — that was the Gini vanish loop (week-1 exists → week-2 never
 * materialized → watchdog deactivates after 48h). Those orphans are logged and
 * rematerialized instead.
 *
 * Explicit forfeit / DROP_ASSIGNMENT / inactive-provider cleanup / integrity
 * resolve remain the only other deactivation paths.
 */
export async function deactivateStaleStandingAssignments() {
  let assignmentsDeactivated = 0;
  let plansDeactivated = 0;
  let googleCancelled = 0;
  let rematerializedOffices = 0;
  let orphanLogged = 0;

  // Only release expired temporary reservations without ongoing or future events.
  // Inconsistent rows with live events require review; never cancel their sessions.
  const expiry = await auditExpiredOfficeAssignments({ apply: true });
  const assignmentIds = expiry.expired;
  assignmentsDeactivated = assignmentIds.length;
  plansDeactivated = expiry.plansDeactivated + await retireInactiveOfficePlans();
  if (expiry.protectedByEvents.length) console.warn('[staleStandingCleanup] expired assignments with live events', expiry.protectedByEvents);

  // ── Case B: AVAILABLE weekly/biweekly missing future events — rematerialize ──
  // NOTE: Missing booking_plan is normal for AVAILABLE (unbooked) standing rows.
  // Only treat missing future office_events as an orphan that needs rematerialize.
  const [orphanRows] = await pool.execute(
    `SELECT sa.id, sa.provider_id, sa.office_location_id, sa.weekday, sa.hour,
            sa.availability_mode, sa.assigned_frequency,
            bp.id AS booking_plan_id,
            (
              SELECT COUNT(*)
              FROM office_events e
              WHERE e.standing_assignment_id = sa.id
                AND e.start_at >= CURDATE()
                AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
            ) AS future_event_count
     FROM office_standing_assignments sa
     LEFT JOIN office_booking_plans bp
       ON bp.standing_assignment_id = sa.id AND bp.is_active = TRUE
     WHERE sa.is_active = TRUE
       AND UPPER(COALESCE(sa.availability_mode, 'AVAILABLE')) <> 'TEMPORARY'
       AND UPPER(COALESCE(sa.assigned_frequency, 'WEEKLY')) IN ('WEEKLY', 'BIWEEKLY', 'EVERY_3_WEEKS', 'EVERY_4_WEEKS', 'MONTHLY')
       AND (sa.available_since_date IS NULL OR sa.available_since_date < DATE_SUB(CURDATE(), INTERVAL 2 DAY))
       AND (sa.updated_at IS NULL OR sa.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))
       AND NOT EXISTS (
         SELECT 1
         FROM office_events e
         WHERE e.standing_assignment_id = sa.id
           AND e.start_at >= CURDATE()
           AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
       )
     LIMIT 200`
  );

  const officeIdsToRematerialize = new Set();
  for (const row of orphanRows || []) {
    orphanLogged += 1;
    const officeLocationId = Number(row.office_location_id || 0);
    const futureEventCount = Number(row.future_event_count || 0);
    console.info('[staleStandingCleanup]', JSON.stringify({
      action: 'rematerialize_orphan_available',
      assignmentId: Number(row.id) || null,
      providerId: Number(row.provider_id) || null,
      officeLocationId: officeLocationId || null,
      weekday: row.weekday,
      hour: row.hour,
      reason: 'available_weekly_missing_future_events',
      planPresent: !!row.booking_plan_id,
      futureEventCount,
      assignedFrequency: row.assigned_frequency || null
    }));
    if (officeLocationId > 0) officeIdsToRematerialize.add(officeLocationId);
  }

  const today = new Date().toISOString().slice(0, 10);
  const startWeek = OfficeScheduleMaterializer.startOfWeekMonday(today);
  for (const officeLocationId of officeIdsToRematerialize) {
    try {
      OfficeScheduleMaterializer.invalidateOffice(officeLocationId);
      for (let i = 0; i < 12; i++) {
        const weekStart = OfficeScheduleMaterializer.addDays(startWeek, i * 7);
        // eslint-disable-next-line no-await-in-loop
        await OfficeScheduleMaterializer.materializeWeek({
          officeLocationId,
          weekStartRaw: weekStart,
          createdByUserId: 1,
          useExactWeekStart: true,
          force: true
        });
      }
      rematerializedOffices += 1;
    } catch (e) {
      console.warn(
        '[staleStandingCleanup] rematerialize failed',
        officeLocationId,
        e?.message || e
      );
    }
  }

  return {
    ok: true,
    assignmentsDeactivated,
    plansDeactivated,
    googleCancelled,
    rematerializedOffices,
    orphanLogged,
    assignmentIds
  };
}

export default { deactivateStaleStandingAssignments };
