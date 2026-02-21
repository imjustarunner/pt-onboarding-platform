import pool from '../config/database.js';

const MEETING_TYPES = ['supervision_session', 'provider_schedule_event'];

class MeetingAgenda {
  static async findByMeeting(meetingType, meetingId) {
    if (!MEETING_TYPES.includes(meetingType) || !meetingId) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM meeting_agendas
       WHERE meeting_type = ? AND meeting_id = ?
       LIMIT 1`,
      [meetingType, parseInt(meetingId, 10)]
    );
    return rows?.[0] || null;
  }

  static async findOrCreateForMeeting({ meetingType, meetingId, agencyId, createdByUserId }) {
    const existing = await this.findByMeeting(meetingType, meetingId);
    if (existing) return existing;

    const [result] = await pool.execute(
      `INSERT INTO meeting_agendas (agency_id, meeting_type, meeting_id, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [
        Number(agencyId),
        String(meetingType),
        parseInt(meetingId, 10),
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM meeting_agendas WHERE id = ?',
      [parseInt(id, 10)]
    );
    return rows?.[0] || null;
  }

  static async create({ agencyId, meetingType, meetingId, createdByUserId }) {
    if (!MEETING_TYPES.includes(meetingType) || !meetingId || !agencyId) return null;
    const [result] = await pool.execute(
      `INSERT INTO meeting_agendas (agency_id, meeting_type, meeting_id, created_by_user_id)
       VALUES (?, ?, ?, ?)`,
      [
        Number(agencyId),
        String(meetingType),
        parseInt(meetingId, 10),
        createdByUserId ? Number(createdByUserId) : null
      ]
    );
    return this.findById(result.insertId);
  }
}

export default MeetingAgenda;
