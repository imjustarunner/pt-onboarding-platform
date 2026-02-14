import pool from '../config/database.js';

class ProgramStaffAssignment {
  static async findByProgram(programId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'psa.program_id = ?' : 'psa.program_id = ? AND psa.is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT psa.*, u.first_name, u.last_name, u.email
       FROM program_staff_assignments psa
       JOIN users u ON psa.user_id = u.id
       WHERE ${where}
       ORDER BY u.last_name, u.first_name`,
      [programId]
    );
    return rows;
  }

  static async findByUser(userId) {
    const [rows] = await pool.execute(
      `SELECT psa.*, p.name as program_name, p.agency_id
       FROM program_staff_assignments psa
       JOIN programs p ON psa.program_id = p.id
       WHERE psa.user_id = ? AND psa.is_active = TRUE AND p.is_active = TRUE
       ORDER BY p.name`,
      [userId]
    );
    return rows;
  }

  static async create({
    programId,
    userId,
    role = 'participant',
    minScheduledHoursPerWeek = null,
    minOnCallHoursPerWeek = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO program_staff_assignments
       (program_id, user_id, role, min_scheduled_hours_per_week, min_on_call_hours_per_week, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         role = VALUES(role),
         min_scheduled_hours_per_week = VALUES(min_scheduled_hours_per_week),
         min_on_call_hours_per_week = VALUES(min_on_call_hours_per_week),
         is_active = TRUE`,
      [programId, userId, role, minScheduledHoursPerWeek, minOnCallHoursPerWeek, createdByUserId]
    );
    const [rows] = await pool.execute(
      'SELECT * FROM program_staff_assignments WHERE program_id = ? AND user_id = ?',
      [programId, userId]
    );
    return rows[0] || null;
  }

  static async update(id, updates = {}) {
    const allowed = ['role', 'min_scheduled_hours_per_week', 'min_on_call_hours_per_week', 'is_active'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (k in updates) {
        const col = k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
        fields.push(`${col} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return null;
    values.push(id);
    await pool.execute(`UPDATE program_staff_assignments SET ${fields.join(', ')} WHERE id = ?`, values);
    const [rows] = await pool.execute('SELECT * FROM program_staff_assignments WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async remove(programId, userId) {
    await pool.execute(
      'UPDATE program_staff_assignments SET is_active = FALSE WHERE program_id = ? AND user_id = ?',
      [programId, userId]
    );
  }
}

export default ProgramStaffAssignment;
