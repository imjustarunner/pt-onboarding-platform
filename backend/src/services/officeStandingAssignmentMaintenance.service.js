import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';
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

  // ── Case A: expired TEMPORARY windows only ────────────────────────────────
  const [expiredTempRows] = await pool.execute(
    `SELECT sa.id, sa.provider_id, sa.office_location_id, sa.weekday, sa.hour,
            sa.availability_mode, sa.assigned_frequency, sa.temporary_until_date
     FROM office_standing_assignments sa
     WHERE sa.is_active = TRUE
       AND UPPER(COALESCE(sa.availability_mode, '')) = 'TEMPORARY'
       AND sa.temporary_until_date IS NOT NULL
       AND sa.temporary_until_date < CURDATE()
       AND (sa.available_since_date IS NULL OR sa.available_since_date < DATE_SUB(CURDATE(), INTERVAL 2 DAY))
       AND (sa.updated_at IS NULL OR sa.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))
       AND (sa.last_two_week_confirmed_at IS NULL OR sa.last_two_week_confirmed_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))`
  );

  const assignmentIds = (expiredTempRows || [])
    .map((r) => Number(r.id))
    .filter((n) => Number.isInteger(n) && n > 0);

  for (const row of expiredTempRows || []) {
    console.info('[staleStandingCleanup]', JSON.stringify({
      action: 'deactivate_expired_temporary',
      assignmentId: Number(row.id) || null,
      providerId: Number(row.provider_id) || null,
      officeLocationId: Number(row.office_location_id) || null,
      weekday: row.weekday,
      hour: row.hour,
      reason: 'temporary_until_date_passed',
      temporaryUntilDate: row.temporary_until_date
        ? String(row.temporary_until_date).slice(0, 10)
        : null,
      planPresent: null,
      futureEventCount: null
    }));
  }

  if (assignmentIds.length) {
    const ph = assignmentIds.map(() => '?').join(',');

    const [futureEvents] = await pool.execute(
      `SELECT id
       FROM office_events
       WHERE standing_assignment_id IN (${ph})
         AND start_at >= NOW()
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
      assignmentIds
    );

    for (const row of futureEvents || []) {
      const eid = Number(row.id);
      if (!eid) continue;
      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await GoogleCalendarService.cancelBookedOfficeEvent({ officeEventId: eid });
        if (r?.ok) googleCancelled += 1;
      } catch {
        // best-effort
      }
    }

    const [assignResult] = await pool.execute(
      `UPDATE office_standing_assignments
       SET is_active = FALSE, updated_at = NOW()
       WHERE id IN (${ph})
         AND is_active = TRUE`,
      assignmentIds
    );
    assignmentsDeactivated = Number(assignResult?.affectedRows || 0);

    const [planResult] = await pool.execute(
      `UPDATE office_booking_plans bp
       JOIN office_standing_assignments sa ON sa.id = bp.standing_assignment_id
       SET bp.is_active = FALSE, bp.updated_at = NOW()
       WHERE sa.id IN (${ph})
         AND bp.is_active = TRUE`,
      assignmentIds
    );
    plansDeactivated = Number(planResult?.affectedRows || 0);

    await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED', updated_at = NOW()
       WHERE standing_assignment_id IN (${ph})
         AND start_at >= NOW()
         AND (status IS NULL OR UPPER(status) <> 'CANCELLED')`,
      assignmentIds
    );
  }

  // ── Case B: AVAILABLE weekly/biweekly orphans — log + rematerialize only ──
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
       AND UPPER(COALESCE(sa.assigned_frequency, 'WEEKLY')) IN ('WEEKLY', 'BIWEEKLY')
       AND (sa.available_since_date IS NULL OR sa.available_since_date < DATE_SUB(CURDATE(), INTERVAL 2 DAY))
       AND (sa.updated_at IS NULL OR sa.updated_at < DATE_SUB(NOW(), INTERVAL 48 HOUR))
       AND (
         bp.id IS NULL
         OR NOT EXISTS (
           SELECT 1
           FROM office_events e
           WHERE e.standing_assignment_id = sa.id
             AND e.start_at >= CURDATE()
             AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
         )
       )
     LIMIT 200`
  );

  const officeIdsToRematerialize = new Set();
  for (const row of orphanRows || []) {
    orphanLogged += 1;
    const officeLocationId = Number(row.office_location_id || 0);
    const planPresent = !!row.booking_plan_id;
    const futureEventCount = Number(row.future_event_count || 0);
    console.info('[staleStandingCleanup]', JSON.stringify({
      action: 'rematerialize_orphan_available',
      assignmentId: Number(row.id) || null,
      providerId: Number(row.provider_id) || null,
      officeLocationId: officeLocationId || null,
      weekday: row.weekday,
      hour: row.hour,
      reason: !planPresent
        ? 'available_weekly_missing_booking_plan'
        : 'available_weekly_missing_future_events',
      planPresent,
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
