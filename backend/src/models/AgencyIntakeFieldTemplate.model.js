import pool from '../config/database.js';

class AgencyIntakeFieldTemplate {
  static async create({ agencyId, name, fieldsJson, isActive = true, templateType = 'field_template' }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_intake_field_templates
       (agency_id, name, template_type, fields_json, is_active)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, name, templateType, JSON.stringify(fieldsJson || []), isActive ? 1 : 0]
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

  static async listByAgency(agencyId, templateType = null) {
    const [rows] = await pool.execute(
      `SELECT * FROM agency_intake_field_templates
       WHERE agency_id = ?${templateType ? ' AND template_type = ?' : ''}
       ORDER BY updated_at DESC, id DESC`,
      templateType ? [agencyId, templateType] : [agencyId]
    );
    return rows.map((r) => this.normalize(r));
  }

  static async update(id, { name, fieldsJson, isActive }) {
    const fields = [];
    const values = [];
    if (name !== undefined) { fields.push('name = ?'); values.push(name); }
    if (fieldsJson !== undefined) { fields.push('fields_json = ?'); values.push(JSON.stringify(fieldsJson)); }
    if (isActive !== undefined) { fields.push('is_active = ?'); values.push(isActive ? 1 : 0); }
    if (!fields.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE agency_intake_field_templates SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async delete(id) {
    await pool.execute('DELETE FROM agency_intake_field_templates WHERE id = ?', [id]);
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
