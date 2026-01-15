import pool from '../config/database.js';

class OfficeRoomAssignment {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_room_assignments WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create({
    roomId,
    assignedUserId,
    assignmentType = 'ONE_TIME',
    startAt,
    endAt,
    sourceRequestId = null,
    createdByUserId
  }) {
    const [result] = await pool.execute(
      `INSERT INTO office_room_assignments
       (room_id, assigned_user_id, assignment_type, start_at, end_at, source_request_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [roomId, assignedUserId, assignmentType, startAt, endAt, sourceRequestId, createdByUserId]
    );
    return this.findById(result.insertId);
  }

  static async findAssignmentsForLocationWindow({ locationId, startAt, endAt }) {
    // Overlap condition:
    // assignment.start < windowEnd AND (assignment.end IS NULL OR assignment.end > windowStart)
    const [rows] = await pool.execute(
      `SELECT
         a.*,
         r.location_id,
         u.first_name,
         u.last_name
       FROM office_room_assignments a
       JOIN office_rooms r ON a.room_id = r.id
       JOIN users u ON a.assigned_user_id = u.id
       WHERE r.location_id = ?
       AND a.start_at < ?
       AND (a.end_at IS NULL OR a.end_at > ?)`,
      [locationId, endAt, startAt]
    );
    return rows;
  }
}

export default OfficeRoomAssignment;

