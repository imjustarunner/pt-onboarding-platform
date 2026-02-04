import pool from '../config/database.js';

class AgencyIntakeFieldTemplate {
  static async create({ agencyId, name, fieldsJson, isActive = true }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_intake_field_templates
       (agency_id, name, fields_json, is_active)
       VALUES (?, ?, ?, ?)`,
      [agencyId, name, JSON.stringify(fieldsJson || []), isActive ? 1 : 0]
    );
    return this.findById(result.insertId);
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM agency_intake_field_templates WHERE id = ? LIMIT 1',
      [id]
    );
    return this.normalize(rows[0] || null);
  }

  static async listByAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_intake_field_templates
       WHERE agency_id = ?
       ORDER BY updated_at DESC, id DESC`,
      [agencyId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static normalize(row) {
    if (!row) return null;
    let fields = [];
    try {
      fields = typeof row.fields_json === 'string' ? JSON.parse(row.fields_json) : row.fields_json;
    } catch {
      fields = [];
    }
    return { ...row, fields_json: fields };
  }
}

export default AgencyIntakeFieldTemplate;
