import pool from '../config/database.js';
import GoogleCalendarService from './googleCalendar.service.js';

/**
 * Retire standing assignments that can no longer appear on the schedule grid.
 *
 * Safe to run after materialization. Two cases:
 * 1. temporary_until_date has passed — materializer will never create rows again.
 * 2. No active booking plan AND no future live events for this assignment.
 *
 * Also deactivates orphaned booking plans and best-effort removes Google events.
 */
export async function deactivateStaleStandingAssignments() {
  let assignmentsDeactivated = 0;
  let plansDeactivated = 0;
  let googleCancelled = 0;

  const [staleRows] = await pool.execute(
    `SELECT sa.id
     FROM office_standing_assignments sa
     LEFT JOIN office_booking_plans bp
       ON bp.standing_assignment_id = sa.id AND bp.is_active = TRUE
     WHERE sa.is_active = TRUE
       AND (
         (sa.temporary_until_date IS NOT NULL AND sa.temporary_until_date < CURDATE())
         OR (
           bp.id IS NULL
           AND NOT EXISTS (
             SELECT 1
             FROM office_events e
             WHERE e.standing_assignment_id = sa.id
               AND e.start_at >= CURDATE()
               AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')
           )
         )
       )`
  );

  const assignmentIds = (staleRows || [])
    .map((r) => Number(r.id))
    .filter((n) => Number.isInteger(n) && n > 0);

  if (!assignmentIds.length) {
    return { ok: true, assignmentsDeactivated: 0, plansDeactivated: 0, googleCancelled: 0 };
  }

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

  return {
    ok: true,
    assignmentsDeactivated,
    plansDeactivated,
    googleCancelled,
    assignmentIds
  };
}

export default { deactivateStaleStandingAssignments };
