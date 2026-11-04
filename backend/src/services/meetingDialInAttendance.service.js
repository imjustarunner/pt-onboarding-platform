import pool from '../config/database.js';

export async function dialInAttendance(type, meetingId, db = pool) {
  try {
    const [rows] = await db.execute(`SELECT c.id, i.user_id, c.connected_at AS started_at,
      COALESCE(c.ended_at, c.last_verified_at) AS ended_at, (c.ended_at IS NULL AND c.state='connected') AS is_active, u.email, u.role,
      COALESCE(NULLIF(TRIM(u.preferred_name),''),u.first_name) AS first_name,u.last_name,
      'dial_in' AS source
      FROM meeting_dial_in_calls c JOIN meeting_dial_in_invitations i ON i.id=c.invitation_id
      JOIN users u ON u.id=i.user_id WHERE i.meeting_type=? AND i.meeting_id=? AND c.connected_at IS NOT NULL`, [type, meetingId]);
    return rows;
  } catch (error) {
    if (error.code === 'ER_NO_SUCH_TABLE' && process.env.MEETING_DIAL_IN_ENABLED !== 'true') return [];
    throw error;
  }
}
