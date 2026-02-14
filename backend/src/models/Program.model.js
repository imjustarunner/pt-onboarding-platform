import pool from '../config/database.js';

class Program {
  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT p.*, a.name as agency_name FROM programs p LEFT JOIN agencies a ON p.agency_id = a.id WHERE p.id = ?',
      [id]
    );
    return rows[0] || null;
  }

  static async findByAgency(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'agency_id = ?' : 'agency_id = ? AND is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT p.*, a.name as agency_name FROM programs p
       LEFT JOIN agencies a ON p.agency_id = a.id
       WHERE ${where}
       ORDER BY p.name ASC`,
      [agencyId]
    );
    return rows;
  }
}

export default Program;
