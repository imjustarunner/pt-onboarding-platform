import pool from '../config/database.js';

class ProgramShiftSignup {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT ss.*, ps.name as site_name, u.first_name, u.last_name
       FROM program_shift_signups ss
       LEFT JOIN program_sites ps ON ss.program_site_id = ps.id
       LEFT JOIN users u ON ss.user_id = u.id
       WHERE ss.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByUser(userId, { startDate = null, endDate = null, onlyShiftProgramsEnabledAgencies = false } = {}) {
    let query = `
      SELECT ss.*, ps.name as site_name, p.name as program_name, p.id as program_id
       FROM program_shift_signups ss
       JOIN program_sites ps ON ss.program_site_id = ps.id
       JOIN programs p ON ps.program_id = p.id
       ${onlyShiftProgramsEnabledAgencies ? 'JOIN agencies a ON p.agency_id = a.id AND (JSON_UNQUOTE(JSON_EXTRACT(COALESCE(a.feature_flags, "{}"), "$.shiftProgramsEnabled")) = "true")' : ''}
       WHERE ss.user_id = ?
    `;
    const params = [userId];
    if (startDate) {
      query += ' AND ss.slot_date >= ?';
      params.push(startDate);
    }
    if (endDate) {
      query += ' AND ss.slot_date <= ?';
      params.push(endDate);
    }
    query += ' ORDER BY ss.slot_date, ss.start_time';
    const [rows] = await pool.execute(query, params);
    return rows;
  }

  static async findBySiteAndDate(programSiteId, slotDate) {
    const [rows] = await pool.execute(
      `SELECT ss.*, u.first_name, u.last_name
       FROM program_shift_signups ss
       LEFT JOIN users u ON ss.user_id = u.id
       WHERE ss.program_site_id = ? AND ss.slot_date = ? AND ss.status = 'confirmed'
       ORDER BY ss.start_time`,
      [programSiteId, slotDate]
    );
    return rows;
  }

  static async create({
    programSiteId,
    programSiteShiftSlotId = null,
    userId,
    slotDate,
    startTime = null,
    endTime = null,
    signupType = 'scheduled'
  }) {
    const [result] = await pool.execute(
      `INSERT INTO program_shift_signups
       (program_site_id, program_site_shift_slot_id, user_id, slot_date, start_time, end_time, signup_type)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [programSiteId, programSiteShiftSlotId, userId, slotDate, startTime, endTime, signupType]
    );
    return this.findById(result.insertId);
  }

  static async updateStatus(id, status, coveredByUserId = null) {
    await pool.execute(
      'UPDATE program_shift_signups SET status = ? WHERE id = ?',
      [status, id]
    );
    return this.findById(id);
  }

  static async release(id) {
    return this.updateStatus(id, 'released');
  }
}

export default ProgramShiftSignup;
