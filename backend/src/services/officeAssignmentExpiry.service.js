import pool from '../config/database.js';
import { isExpiredTemporaryAssignment } from '../utils/officeMoveConflict.js';
import { resolveOfficeTimeZone } from '../utils/officeEventDateTime.util.js';
import { utcDateToZonedParts } from '../utils/zonedWallTime.util.js';

/** Release only an explicitly expired temporary hold with no live events.
 * Caller owns the transaction and locks the assignment before calling this.
 * Never infer abandonment from role, missing materialization or utilization.
 */
export async function retireExpiredOfficeAssignment(conn, row, timeZone, now = new Date()) {
  const p = utcDateToZonedParts(now, resolveOfficeTimeZone(timeZone));
  const today = `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
  if (!isExpiredTemporaryAssignment(row, today)) return { retired: false, reason: 'not_expired' };
  const [events] = await conn.execute(`SELECT id FROM office_events WHERE standing_assignment_id = ?
    AND end_at > UTC_TIMESTAMP() AND (status IS NULL OR UPPER(status) NOT IN ('CANCELLED', 'CANCELED')) LIMIT 1 FOR UPDATE`, [row.id]);
  if (events.length) return { retired: false, reason: 'live_events' };
  const [plans] = await conn.execute('UPDATE office_booking_plans SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE standing_assignment_id = ? AND is_active = TRUE', [row.id]);
  await conn.execute('UPDATE office_standing_assignments SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [row.id]);
  return { retired: true, plansDeactivated: Number(plans?.affectedRows || 0) };
}

/** Dry run by default. Recheck each candidate under lock before changing anything. */
export async function auditExpiredOfficeAssignments({ apply = false, officeLocationId = null, roomId = null } = {}) {
  const [candidates] = await pool.execute(`SELECT s.id, s.room_id FROM office_standing_assignments s
    WHERE s.is_active = TRUE AND UPPER(s.availability_mode) = 'TEMPORARY'
      AND s.temporary_until_date < UTC_DATE() + INTERVAL 1 DAY
      AND (? IS NULL OR s.office_location_id = ?) AND (? IS NULL OR s.room_id = ?)
    ORDER BY s.room_id, s.id`, [officeLocationId, officeLocationId, roomId, roomId]);
  const report = { expired: [], protectedByEvents: [], plansDeactivated: 0, applied: apply };
  for (const candidate of candidates) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      await conn.execute('SELECT id FROM office_rooms WHERE id = ? FOR UPDATE', [candidate.room_id]);
      const [[row]] = await conn.execute(`SELECT s.*, l.timezone FROM office_standing_assignments s
        JOIN office_locations l ON l.id = s.office_location_id WHERE s.id = ? AND s.is_active = TRUE FOR UPDATE`, [candidate.id]);
      if (!row) { await conn.rollback(); continue; }
      const result = await retireExpiredOfficeAssignment(conn, row, row.timezone);
      if (result.retired) { report.expired.push(Number(row.id)); report.plansDeactivated += result.plansDeactivated; }
      else if (result.reason === 'live_events') report.protectedByEvents.push(Number(row.id));
      if (apply) await conn.commit(); else await conn.rollback();
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
  }
  return report;
}

/** An inactive assignment cannot generate a live plan. Preserve any plan still
 * referenced by ongoing/future events so those inconsistencies get reviewed. */
export async function retireInactiveOfficePlans() {
  const [result] = await pool.execute(`UPDATE office_booking_plans p
    JOIN office_standing_assignments s ON s.id = p.standing_assignment_id
    SET p.is_active = FALSE, p.updated_at = CURRENT_TIMESTAMP
    WHERE p.is_active = TRUE AND s.is_active = FALSE
      AND NOT EXISTS (SELECT 1 FROM office_events e WHERE e.booking_plan_id = p.id
        AND e.end_at > UTC_TIMESTAMP() AND (e.status IS NULL OR UPPER(e.status) NOT IN ('CANCELLED', 'CANCELED')))`);
  return Number(result.affectedRows || 0);
}
