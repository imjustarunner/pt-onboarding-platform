import pool from '../config/database.js';

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

class OfficeBookingPlan {
  static async listActiveByAssignmentIds(assignmentIds) {
    const ids = (assignmentIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_booking_plans
       WHERE standing_assignment_id IN (${placeholders})
         AND is_active = TRUE
         AND (active_until_date IS NULL OR active_until_date >= CURDATE())`,
      ids
    );
    return rows || [];
  }

  static async findActiveByAssignmentId(assignmentId) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_booking_plans
       WHERE standing_assignment_id = ?
         AND is_active = TRUE
         AND (active_until_date IS NULL OR active_until_date >= CURDATE())
       LIMIT 1`,
      [assignmentId]
    );
    return rows?.[0] || null;
  }

  static async upsertActive({ standingAssignmentId, bookedFrequency, bookingStartDate, createdByUserId }) {
    const start = String(bookingStartDate || '').slice(0, 10);
    const activeUntilDate = addDaysYmd(start, 365);
    const existing = await this.findActiveByAssignmentId(standingAssignmentId);
    if (existing?.id) {
      await pool.execute(
        `UPDATE office_booking_plans
         SET booked_frequency = ?,
             booking_start_date = ?,
             active_until_date = ?,
             last_confirmed_at = CURRENT_TIMESTAMP,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [bookedFrequency, start, activeUntilDate, existing.id]
      );
      const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [existing.id]);
      return rows?.[0] || null;
    }

    const [result] = await pool.execute(
      `INSERT INTO office_booking_plans
         (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, last_confirmed_at, created_by_user_id)
       VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
      [standingAssignmentId, bookedFrequency, start, activeUntilDate, createdByUserId]
    );
    const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [result.insertId]);
    return rows?.[0] || null;
  }

  static async deactivateByAssignmentId(assignmentId) {
    await pool.execute(
      `UPDATE office_booking_plans
       SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
       WHERE standing_assignment_id = ?`,
      [assignmentId]
    );
    return true;
  }

  static async confirm(planId) {
    await pool.execute(
      `UPDATE office_booking_plans
       SET last_confirmed_at = CURRENT_TIMESTAMP,
           active_until_date = DATE_ADD(CURDATE(), INTERVAL 42 DAY),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [planId]
    );
    const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [planId]);
    return rows?.[0] || null;
  }
}

export default OfficeBookingPlan;

