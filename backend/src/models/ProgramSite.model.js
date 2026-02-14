import pool from '../config/database.js';

class ProgramSite {
  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT ps.*, ol.name as office_location_name
       FROM program_sites ps
       LEFT JOIN office_locations ol ON ps.office_location_id = ol.id
       WHERE ps.id = ?`,
      [id]
    );
    return rows[0] || null;
  }

  static async findByProgram(programId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'program_id = ?' : 'program_id = ? AND ps.is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT ps.*, ol.name as office_location_name
       FROM program_sites ps
       LEFT JOIN office_locations ol ON ps.office_location_id = ol.id
       WHERE ${where}
       ORDER BY ps.name ASC`,
      [programId]
    );
    return rows;
  }

  static async findByOfficeLocation(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT ps.*, p.name as program_name, p.agency_id
       FROM program_sites ps
       JOIN programs p ON ps.program_id = p.id
       WHERE ps.office_location_id = ? AND ps.is_active = TRUE AND p.is_active = TRUE
       ORDER BY ps.name ASC`,
      [officeLocationId]
    );
    return rows;
  }

  static async create({ programId, name, address = null, officeLocationId = null }) {
    const [result] = await pool.execute(
      `INSERT INTO program_sites (program_id, name, address, office_location_id)
       VALUES (?, ?, ?, ?)`,
      [programId, name, address, officeLocationId]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const allowed = ['name', 'address', 'office_location_id', 'is_active'];
    const fields = [];
    const values = [];
    for (const k of allowed) {
      if (k in updates) {
        fields.push(`${k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '')} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE program_sites SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default ProgramSite;
