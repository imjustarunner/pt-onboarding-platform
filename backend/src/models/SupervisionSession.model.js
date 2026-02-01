import pool from '../config/database.js';

class SupervisionSession {
  static async create({
    agencyId,
    supervisorUserId,
    superviseeUserId,
    startAt,
    endAt,
    modality = null,
    locationText = null,
    notes = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO supervision_sessions
        (agency_id, supervisor_user_id, supervisee_user_id, start_at, end_at, modality, location_text, notes, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)`,
      [
        Number(agencyId),
        Number(supervisorUserId),
        Number(superviseeUserId),
        startAt,
        endAt,
        modality,
        locationText,
        notes,
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const sid = parseInt(id, 10);
    const [rows] = await pool.execute(
      `SELECT ss.*
       FROM supervision_sessions ss
       WHERE ss.id = ?
       LIMIT 1`,
      [sid]
    );
    return rows[0] || null;
  }

  static async setGoogleSync(id, { hostEmail, calendarId, eventId, meetLink, status, errorMessage }) {
    const sid = parseInt(id, 10);
    await pool.execute(
      `UPDATE supervision_sessions
       SET google_host_email = ?,
           google_calendar_id = ?,
           google_event_id = ?,
           google_meet_link = ?,
           google_sync_status = ?,
           google_sync_error = ?,
           google_synced_at = CASE WHEN ? = 'SYNCED' THEN NOW() ELSE NULL END
       WHERE id = ?`,
      [
        hostEmail || null,
        calendarId || null,
        eventId || null,
        meetLink || null,
        status || null,
        errorMessage || null,
        status || null,
        sid
      ]
    );
    return this.findById(sid);
  }

  static async cancel(id) {
    const sid = parseInt(id, 10);
    await pool.execute(
      `UPDATE supervision_sessions
       SET status = 'CANCELLED', updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [sid]
    );
    return this.findById(sid);
  }

  static async updateById(id, { startAt, endAt, modality, locationText, notes }) {
    const sid = parseInt(id, 10);
    const updates = [];
    const values = [];

    if (startAt !== undefined) {
      updates.push('start_at = ?');
      values.push(startAt);
    }
    if (endAt !== undefined) {
      updates.push('end_at = ?');
      values.push(endAt);
    }
    if (modality !== undefined) {
      updates.push('modality = ?');
      values.push(modality);
    }
    if (locationText !== undefined) {
      updates.push('location_text = ?');
      values.push(locationText);
    }
    if (notes !== undefined) {
      updates.push('notes = ?');
      values.push(notes);
    }

    if (!updates.length) return this.findById(sid);

    await pool.execute(
      `UPDATE supervision_sessions
       SET ${updates.join(', ')}
       WHERE id = ?`,
      [...values, sid]
    );
    return this.findById(sid);
  }

  static async listForUserInWindow({ agencyId, userId, windowStart, windowEnd }) {
    const aId = parseInt(agencyId, 10);
    const uId = parseInt(userId, 10);
    const [rows] = await pool.execute(
      `SELECT
         ss.*,
         sup.first_name AS supervisor_first_name,
         sup.last_name AS supervisor_last_name,
         sup.email AS supervisor_email,
         sv.first_name AS supervisee_first_name,
         sv.last_name AS supervisee_last_name,
         sv.email AS supervisee_email
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       JOIN users sv ON sv.id = ss.supervisee_user_id
       WHERE ss.agency_id = ?
         AND (ss.supervisor_user_id = ? OR ss.supervisee_user_id = ?)
         AND ss.start_at < ?
         AND ss.end_at > ?
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
       ORDER BY ss.start_at ASC`,
      [aId, uId, uId, windowEnd, windowStart]
    );
    return rows || [];
  }

  /**
   * Get total completed/scheduled supervision hours for a supervisee in an agency.
   * Sums (end_at - start_at) for sessions where supervisee_user_id = superviseeUserId, agency_id = agencyId, status <> 'CANCELLED'.
   */
  static async getHoursSummaryForSupervisee(agencyId, superviseeUserId) {
    const aId = parseInt(agencyId, 10);
    const uId = parseInt(superviseeUserId, 10);
    const [rows] = await pool.execute(
      `SELECT
         COALESCE(SUM(TIMESTAMPDIFF(SECOND, ss.start_at, ss.end_at)), 0) AS total_seconds,
         COUNT(ss.id) AS session_count
       FROM supervision_sessions ss
       WHERE ss.agency_id = ?
         AND ss.supervisee_user_id = ?
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')`,
      [aId, uId]
    );
    const r = rows?.[0] || null;
    const totalSeconds = Number(r?.total_seconds || 0);
    const totalHours = totalSeconds / 3600;
    return {
      totalSeconds,
      totalHours: Math.round(totalHours * 100) / 100,
      sessionCount: Number(r?.session_count || 0)
    };
  }
}

export default SupervisionSession;

