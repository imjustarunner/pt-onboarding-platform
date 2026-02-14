import pool from '../config/database.js';

class ProgramTimePunch {
  static async create({
    programId,
    programSiteId,
    userId = null,
    guardianUserId = null,
    punchType,
    punchedAt,
    kioskLocationId = null,
    clientId = null,
    directHours = null,
    indirectHours = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO program_time_punches
       (program_id, program_site_id, user_id, guardian_user_id, punch_type, punched_at, kiosk_location_id, client_id, direct_hours, indirect_hours)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        programId,
        programSiteId,
        userId,
        guardianUserId,
        punchType,
        punchedAt,
        kioskLocationId,
        clientId,
        directHours,
        indirectHours
      ]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM program_time_punches WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findLastClockIn(userId, programId, programSiteId) {
    const [rows] = await pool.execute(
      `SELECT * FROM program_time_punches
       WHERE user_id = ? AND program_id = ? AND program_site_id = ? AND punch_type = 'clock_in'
       ORDER BY punched_at DESC LIMIT 1`,
      [userId, programId, programSiteId]
    );
    return rows[0] || null;
  }

  static async findLastGuardianCheckIn(guardianUserId, clientId, programSiteId) {
    const [rows] = await pool.execute(
      `SELECT * FROM program_time_punches
       WHERE guardian_user_id = ? AND client_id = ? AND program_site_id = ? AND punch_type = 'guardian_check_in'
       ORDER BY punched_at DESC LIMIT 1`,
      [guardianUserId, clientId, programSiteId]
    );
    return rows[0] || null;
  }
}

export default ProgramTimePunch;
