import pool from '../config/database.js';

class AgencyMeetingAttendanceRollup {
  static async upsert({ eventId, userId, totalSeconds, participantEmail = null }) {
    const eid = Number(eventId || 0);
    const uid = Number(userId || 0);
    const sec = Math.max(0, Math.floor(Number(totalSeconds || 0)));
    if (!eid || !uid) return null;

    await pool.execute(
      `INSERT INTO agency_meeting_attendance_rollups
        (event_id, user_id, total_seconds, participant_email, synced_at)
       VALUES (?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
         total_seconds = VALUES(total_seconds),
         participant_email = VALUES(participant_email),
         synced_at = NOW(),
         updated_at = CURRENT_TIMESTAMP`,
      [eid, uid, sec, participantEmail ? String(participantEmail).trim().slice(0, 255) : null]
    );
    const [rows] = await pool.execute(
      `SELECT * FROM agency_meeting_attendance_rollups
       WHERE event_id = ? AND user_id = ?
       LIMIT 1`,
      [eid, uid]
    );
    return rows?.[0] || null;
  }

  static async listForEvent(eventId) {
    const eid = Number(eventId || 0);
    if (!eid) return [];
    const [rows] = await pool.execute(
      `SELECT r.*, u.email, u.first_name, u.last_name
       FROM agency_meeting_attendance_rollups r
       JOIN users u ON u.id = r.user_id
       WHERE r.event_id = ?
       ORDER BY r.total_seconds DESC`,
      [eid]
    );
    return rows || [];
  }

  static async listForAgencyInWindow(agencyId, periodStart, periodEnd) {
    const aid = Number(agencyId || 0);
    const start = String(periodStart || '').slice(0, 10);
    const end = String(periodEnd || '').slice(0, 10);
    if (!aid || !start || !end) return [];

    const [rows] = await pool.execute(
      `SELECT
         r.event_id,
         r.user_id,
         r.total_seconds,
         r.synced_at,
         pse.agency_id,
         pse.provider_id,
         pse.kind,
         pse.title,
         pse.start_at,
         pse.end_at,
         DATE(pse.start_at) AS service_date
       FROM agency_meeting_attendance_rollups r
       JOIN provider_schedule_events pse ON pse.id = r.event_id
       WHERE pse.agency_id = ?
         AND UPPER(COALESCE(pse.kind, '')) = 'TEAM_MEETING'
         AND UPPER(COALESCE(pse.status, 'ACTIVE')) <> 'CANCELLED'
         AND pse.start_at >= ?
         AND pse.start_at < DATE_ADD(?, INTERVAL 1 DAY)
         AND r.total_seconds > 0
       ORDER BY pse.start_at, r.user_id`,
      [aid, start, end]
    );
    return rows || [];
  }
}

export default AgencyMeetingAttendanceRollup;
