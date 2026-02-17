import pool from '../config/database.js';

class SupervisionSession {
  static async create({
    agencyId,
    supervisorUserId,
    superviseeUserId,
    sessionType = 'individual',
    startAt,
    endAt,
    modality = null,
    locationText = null,
    notes = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO supervision_sessions
        (agency_id, supervisor_user_id, supervisee_user_id, session_type, start_at, end_at, modality, location_text, notes, status, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'SCHEDULED', ?)`,
      [
        Number(agencyId),
        Number(supervisorUserId),
        Number(superviseeUserId),
        String(sessionType || 'individual'),
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

  static async upsertAttendees(sessionId, attendees = []) {
    const sid = parseInt(sessionId, 10);
    if (!sid || !Array.isArray(attendees) || !attendees.length) return;

    const normalized = [];
    const seen = new Set();
    for (const row of attendees) {
      const userId = parseInt(row?.userId, 10);
      if (!userId) continue;
      if (seen.has(userId)) continue;
      seen.add(userId);
      normalized.push({
        userId,
        participantRole: String(row?.participantRole || 'supervisee'),
        isRequired: row?.isRequired === false ? 0 : 1,
        isCompensableSnapshot: row?.isCompensableSnapshot ? 1 : 0,
        status: String(row?.status || 'INVITED')
      });
    }
    if (!normalized.length) return;

    const placeholders = normalized.map(() => '(?, ?, ?, ?, ?, ?)').join(', ');
    const values = normalized.flatMap((r) => [sid, r.userId, r.participantRole, r.isRequired, r.isCompensableSnapshot, r.status]);
    await pool.execute(
      `INSERT INTO supervision_session_attendees
        (session_id, user_id, participant_role, is_required, is_compensable_snapshot, status)
       VALUES ${placeholders}
       ON DUPLICATE KEY UPDATE
         participant_role = VALUES(participant_role),
         is_required = VALUES(is_required),
         is_compensable_snapshot = VALUES(is_compensable_snapshot),
         status = VALUES(status),
         updated_at = CURRENT_TIMESTAMP`,
      values
    );
  }

  static async listAttendees(sessionId) {
    const sid = parseInt(sessionId, 10);
    if (!sid) return [];
    const [rows] = await pool.execute(
      `SELECT ssa.*
       FROM supervision_session_attendees ssa
       WHERE ssa.session_id = ?
       ORDER BY CASE WHEN ssa.participant_role = 'supervisor' THEN 0 ELSE 1 END, ssa.id ASC`,
      [sid]
    );
    return rows || [];
  }

  static async listPromptSessionsForUser({ userId, agencyId = null, now = new Date() }) {
    const uid = parseInt(userId, 10);
    const nowDate = now instanceof Date ? now : new Date(now);
    if (!uid || Number.isNaN(nowDate.getTime())) return [];
    const nowSql = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}-${String(nowDate.getDate()).padStart(2, '0')} ${String(nowDate.getHours()).padStart(2, '0')}:${String(nowDate.getMinutes()).padStart(2, '0')}:${String(nowDate.getSeconds()).padStart(2, '0')}`;

    const whereAgency = Number(agencyId) > 0 ? 'AND ss.agency_id = ?' : '';
    const args = [uid, uid];
    if (Number(agencyId) > 0) args.push(Number(agencyId));
    args.push(nowSql, nowSql);

    const [rows] = await pool.execute(
      `SELECT
         ss.id,
         ss.agency_id,
         ss.session_type,
         ss.start_at,
         ss.end_at,
         ss.status,
         ss.google_meet_link,
         ss.modality,
         ss.notes,
         ss.supervisor_user_id,
         CONCAT(COALESCE(sup.first_name, ''), ' ', COALESCE(sup.last_name, '')) AS supervisor_name,
         ssa.id AS attendee_id,
         ssa.user_id AS attendee_user_id,
         ssa.participant_role,
         ssa.is_required
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       LEFT JOIN supervision_session_attendees ssa
         ON ssa.session_id = ss.id
        AND ssa.user_id = ?
       WHERE (
           ss.supervisee_user_id = ?
           OR ssa.user_id IS NOT NULL
         )
         ${whereAgency}
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
         AND ss.end_at >= ?
         AND ss.start_at <= DATE_ADD(?, INTERVAL 5 MINUTE)
       ORDER BY ss.start_at ASC`,
      args
    );

    return (rows || []).map((r) => {
      const fallbackRequired = Number(r?.attendee_user_id || 0) ? Number(r?.is_required || 0) === 1 : Number(r?.supervisor_user_id || 0) !== uid;
      return {
        id: Number(r.id),
        agencyId: Number(r.agency_id),
        sessionType: String(r.session_type || 'individual'),
        startAt: r.start_at,
        endAt: r.end_at,
        status: r.status,
        googleMeetLink: r.google_meet_link || null,
        modality: r.modality || null,
        notes: r.notes || null,
        supervisorUserId: Number(r.supervisor_user_id || 0),
        supervisorName: String(r.supervisor_name || '').trim() || null,
        participantRole: String(r.participant_role || (Number(r.supervisor_user_id || 0) === uid ? 'supervisor' : 'supervisee')),
        isRequired: fallbackRequired
      };
    });
  }

  static async recordAttendanceEvent({
    sessionId,
    attendeeId = null,
    userId = null,
    participantSessionKey,
    eventType,
    eventAt,
    rawPayload = null
  }) {
    const sid = parseInt(sessionId, 10);
    const aid = attendeeId ? parseInt(attendeeId, 10) : null;
    const uid = userId ? parseInt(userId, 10) : null;
    await pool.execute(
      `INSERT INTO supervision_session_attendance_events
        (session_id, attendee_id, user_id, participant_session_key, event_type, event_at, raw_payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = id`,
      [
        sid,
        aid,
        uid,
        String(participantSessionKey || '').trim(),
        String(eventType || '').trim().toLowerCase(),
        eventAt,
        rawPayload ? JSON.stringify(rawPayload) : null
      ]
    );
  }

  static async upsertAttendanceRollup({
    sessionId,
    userId,
    firstJoinedAt = null,
    lastLeftAt = null,
    totalSeconds = 0,
    segmentCount = 0,
    isFinalized = false
  }) {
    const sid = parseInt(sessionId, 10);
    const uid = parseInt(userId, 10);
    await pool.execute(
      `INSERT INTO supervision_session_attendance_rollups
        (session_id, user_id, first_joined_at, last_left_at, total_seconds, segment_count, is_finalized)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         first_joined_at = VALUES(first_joined_at),
         last_left_at = VALUES(last_left_at),
         total_seconds = VALUES(total_seconds),
         segment_count = VALUES(segment_count),
         is_finalized = VALUES(is_finalized),
         updated_at = CURRENT_TIMESTAMP`,
      [
        sid,
        uid,
        firstJoinedAt,
        lastLeftAt,
        Number(totalSeconds || 0),
        Number(segmentCount || 0),
        isFinalized ? 1 : 0
      ]
    );
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

  static async updateById(id, { startAt, endAt, sessionType, modality, locationText, notes }) {
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
    if (sessionType !== undefined) {
      updates.push('session_type = ?');
      values.push(String(sessionType || 'individual'));
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
         sv.email AS supervisee_email,
         (
           SELECT ssv.is_required
           FROM supervision_session_attendees ssv
           WHERE ssv.session_id = ss.id
             AND ssv.user_id = ?
           LIMIT 1
         ) AS viewer_is_required,
         (
           SELECT GROUP_CONCAT(
             TRIM(CONCAT(COALESCE(u2.first_name, ''), ' ', COALESCE(u2.last_name, '')))
             ORDER BY u2.last_name ASC, u2.first_name ASC
             SEPARATOR ', '
           )
           FROM supervision_session_attendees ssa2
           JOIN users u2 ON u2.id = ssa2.user_id
           WHERE ssa2.session_id = ss.id
             AND ssa2.participant_role = 'supervisee'
         ) AS supervisee_names
       FROM supervision_sessions ss
       JOIN users sup ON sup.id = ss.supervisor_user_id
       LEFT JOIN users sv ON sv.id = ss.supervisee_user_id
       WHERE ss.agency_id = ?
         AND (
           ss.supervisor_user_id = ?
           OR ss.supervisee_user_id = ?
           OR EXISTS (
             SELECT 1
             FROM supervision_session_attendees ssa
             WHERE ssa.session_id = ss.id
               AND ssa.user_id = ?
           )
         )
         AND ss.start_at < ?
         AND ss.end_at > ?
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')
       ORDER BY ss.start_at ASC`,
      [uId, aId, uId, uId, uId, windowEnd, windowStart]
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
         AND (
           ss.supervisee_user_id = ?
           OR EXISTS (
             SELECT 1
             FROM supervision_session_attendees ssa
             WHERE ssa.session_id = ss.id
               AND ssa.user_id = ?
               AND ssa.participant_role = 'supervisee'
           )
         )
         AND (ss.status IS NULL OR ss.status <> 'CANCELLED')`,
      [aId, uId, uId]
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

