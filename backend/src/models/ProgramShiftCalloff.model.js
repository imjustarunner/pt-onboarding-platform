import pool from '../config/database.js';

class ProgramShiftCalloff {
  static async create({ shiftSignupId, userId, reason }) {
    const [result] = await pool.execute(
      `INSERT INTO program_shift_calloffs (shift_signup_id, user_id, reason, calloff_at, status)
       VALUES (?, ?, ?, NOW(), 'pending')`,
      [shiftSignupId, userId, reason || null]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT c.*, ss.program_site_id, ss.slot_date, ss.start_time, ss.end_time, ps.name as site_name, p.name as program_name
       FROM program_shift_calloffs c
       JOIN program_shift_signups ss ON c.shift_signup_id = ss.id
       JOIN program_sites ps ON ss.program_site_id = ps.id
       JOIN programs p ON ps.program_id = p.id
       WHERE c.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async updateCovered(id, coveredByUserId) {
    await pool.execute(
      'UPDATE program_shift_calloffs SET status = ?, covered_by_user_id = ?, covered_at = NOW() WHERE id = ?',
      ['covered', coveredByUserId, id]
    );
    return this.findById(id);
  }
}

export default ProgramShiftCalloff;
