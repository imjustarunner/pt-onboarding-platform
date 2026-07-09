import pool from '../config/database.js';

/**
 * Normalize a date-like value to YYYY-MM-DD.
 * mysql2 returns DATE columns as JS Date objects; String(date).slice(0, 10)
 * yields "Sat Jun 27" which MySQL rejects on write — never use that pattern.
 */
function normalizeYmd(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return '';
    return value.toISOString().slice(0, 10);
  }
  const raw = String(value || '').trim();
  if (!raw) return '';
  const exact = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (exact) return `${exact[1]}-${exact[2]}-${exact[3]}`;
  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function addDaysYmd(ymd, days) {
  const m = String(ymd || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}

function normalizeActiveUntilDate({ bookingStartDate, activeUntilDate }) {
  const start = normalizeYmd(bookingStartDate);
  const maxAllowed = addDaysYmd(start, 364);
  const requested = normalizeYmd(activeUntilDate);
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
    createdByUserId,
    bookingOrigin = 'user'
  }) {
    const start = normalizeYmd(bookingStartDate);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start)) {
      const err = new Error('bookingStartDate must be YYYY-MM-DD');
      err.status = 400;
      throw err;
    }
    const normalizedActiveUntilDate = normalizeActiveUntilDate({ bookingStartDate: start, activeUntilDate });
    const normalizedOccurrenceCount = Number.isInteger(Number(bookedOccurrenceCount)) && Number(bookedOccurrenceCount) > 0
      ? Number(bookedOccurrenceCount)
      : null;
    const incomingOrigin = String(bookingOrigin || 'user').toLowerCase() === 'ehr_sync' ? 'ehr_sync' : 'user';
    const existing = await this.findActiveByAssignmentId(standingAssignmentId);

    let effectiveOrigin = incomingOrigin;
    if (incomingOrigin === 'ehr_sync' && existing?.id && String(existing.booking_origin || '').toLowerCase() === 'user') {
      effectiveOrigin = 'user';
    }

    const preserveUserTs =
      effectiveOrigin === 'user' && incomingOrigin === 'ehr_sync' && existing?.user_booking_confirmed_at
        ? existing.user_booking_confirmed_at
        : null;

    if (existing?.id) {
      try {
        if (incomingOrigin === 'user') {
          await pool.execute(
            `UPDATE office_booking_plans
             SET booked_frequency = ?,
                 booking_start_date = ?,
                 active_until_date = ?,
                 booked_occurrence_count = ?,
                 booking_origin = 'user',
                 user_booking_confirmed_at = CURRENT_TIMESTAMP,
                 last_confirmed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, existing.id]
          );
        } else if (preserveUserTs) {
          await pool.execute(
            `UPDATE office_booking_plans
             SET booked_frequency = ?,
                 booking_start_date = ?,
                 active_until_date = ?,
                 booked_occurrence_count = ?,
                 booking_origin = 'user',
                 user_booking_confirmed_at = ?,
                 last_confirmed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, preserveUserTs, existing.id]
          );
        } else {
          await pool.execute(
            `UPDATE office_booking_plans
             SET booked_frequency = ?,
                 booking_start_date = ?,
                 active_until_date = ?,
                 booked_occurrence_count = ?,
                 booking_origin = 'ehr_sync',
                 user_booking_confirmed_at = NULL,
                 last_confirmed_at = CURRENT_TIMESTAMP,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, existing.id]
          );
        }
      } catch (e) {
        if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
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
        } catch (e2) {
          if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
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
      }
      const [rows] = await pool.execute(`SELECT * FROM office_booking_plans WHERE id = ? LIMIT 1`, [existing.id]);
      return rows?.[0] || null;
    }

    let result;
    try {
      if (incomingOrigin === 'user') {
        [result] = await pool.execute(
          `INSERT INTO office_booking_plans
             (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, booked_occurrence_count, last_confirmed_at, created_by_user_id, booking_origin, user_booking_confirmed_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'user', CURRENT_TIMESTAMP)`,
          [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, createdByUserId]
        );
      } else {
        [result] = await pool.execute(
          `INSERT INTO office_booking_plans
             (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, booked_occurrence_count, last_confirmed_at, created_by_user_id, booking_origin, user_booking_confirmed_at)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, 'ehr_sync', NULL)`,
          [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, createdByUserId]
        );
      }
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      try {
        [result] = await pool.execute(
          `INSERT INTO office_booking_plans
             (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, booked_occurrence_count, last_confirmed_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, normalizedOccurrenceCount, createdByUserId]
        );
      } catch (e2) {
        if (e2?.code !== 'ER_BAD_FIELD_ERROR') throw e2;
        [result] = await pool.execute(
          `INSERT INTO office_booking_plans
             (standing_assignment_id, booked_frequency, booking_start_date, active_until_date, last_confirmed_at, created_by_user_id)
           VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, ?)`,
          [standingAssignmentId, bookedFrequency, start, normalizedActiveUntilDate, createdByUserId]
        );
      }
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

