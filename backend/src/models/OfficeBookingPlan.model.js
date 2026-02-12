import pool from '../config/database.js';

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').slice(0, 10).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function normalizeActiveUntilDate({ bookingStartDate, activeUntilDate }) {
  const start = String(bookingStartDate || '').slice(0, 10);
  const maxAllowed = addDaysYmd(start, 364);
  const requested = String(activeUntilDate || '').slice(0, 10);
  if (!requested || !/^\d{4}-\d{2}-\d{2}$/.test(requested)) return maxAllowed;
  if (!maxAllowed || requested <= start) return maxAllowed;
  return requested > maxAllowed ? maxAllowed : requested;
}

class OfficeBookingPlan {
  static async listActiveByAssignmentIds(assignmentIds) {
    const ids = (assignmentIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];
    const placeholders = ids.map(() => '?').join(',');
    try {
      const [rows] = await pool.execute(
        `SELECT *
         FROM office_booking_plans
         WHERE standing_assignment_id IN (${placeholders})
           AND is_active = TRUE
           AND (active_until_date IS NULL OR active_until_date >= CURDATE())`,
        ids
      );
      return rows || [];
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT id, standing_assignment_id, booked_frequency, booking_start_date, active_until_date, last_confirmed_at, is_active, created_by_user_id, created_at, updated_at
         FROM office_booking_plans
         WHERE standing_assignment_id IN (${placeholders})
           AND is_active = TRUE
           AND (active_until_date IS NULL OR active_until_date >= CURDATE())`,
        ids
      );
      return rows || [];
    }
  }

  static async findActiveByAssignmentId(assignmentId) {
    try {
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
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      const [rows] = await pool.execute(
        `SELECT id, standing_assignment_id, booked_frequency, booking_start_date, active_until_date, last_confirmed_at, is_active, created_by_user_id, created_at, updated_at
         FROM office_booking_plans
         WHERE standing_assignment_id = ?
           AND is_active = TRUE
           AND (active_until_date IS NULL OR active_until_date >= CURDATE())
         LIMIT 1`,
        [assignmentId]
      );
      return rows?.[0] || null;
    }
  }

  static async upsertActive({
    standingAssignmentId,
    bookedFrequency,
    bookingStartDate,
    activeUntilDate = null,
    bookedOccurrenceCount = null,
    createdByUserId
  }) {
    const start = String(bookingStartDate || '').slice(0, 10);
    const normalizedActiveUntilDate = normalizeActiveUntilDate({ bookingStartDate: start, activeUntilDate });
    const normalizedOccurrenceCount = Number.isInteger(Number(bookedOccurrenceCount)) && Number(bookedOccurrenceCount) > 0
      ? Number(bookedOccurrenceCount)
      : null;
    const existing = await this.findActiveByAssignmentId(standingAssignmentId);
    if (existing?.id) {
      try {
        await pool.execute(
          `UPDATE office_booking_plans
           SET booked_frequency = ?,
               booking_start_date = ?,
               active_until_date = ?,
               booked_occurrence_count = ?,
               last_confirmed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, existing.id]
        );
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
        await pool.execute(
          `UPDATE office_booking_plans
           SET booked_frequency = ?,
               booking_start_date = ?,
               active_until_date = ?,
               last_confirmed_at = CURRENT_TIMESTAMP,
               updated_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [bookedFrequency, start, normalizedActiveUntilDate, existing.id]
        );
      }
      const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [existing.id]);
      return rows?.[0] || null;
    }

    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO office_booking_plans
           (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, booked_occurrence_count, last_confirmed_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, createdByUserId]
      );
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      [result] = await pool.execute(
        `INSERT INTO office_booking_plans
           (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, last_confirmed_at, created_by_user_id)
         VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
        [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, createdByUserId]
      );
    }
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
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [planId]
    );
    const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [planId]);
    return rows?.[0] || null;
  }
}

export default OfficeBookingPlan;

