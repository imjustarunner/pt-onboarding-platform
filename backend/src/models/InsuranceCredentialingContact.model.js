import pool from '../config/database.js';

class InsuranceCredentialingContact {
  static async listByInsuranceDefinitionId(insuranceDefinitionId) {
    const [rows] = await pool.execute(
      `SELECT * FROM insurance_credentialing_contacts
       WHERE insurance_credentialing_definition_id = ?
       ORDER BY sort_order ASC, id ASC`,
      [insuranceDefinitionId]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM insurance_credentialing_contacts WHERE id = ? LIMIT 1',
      [id]
    );
    return rows?.[0] || null;
  }

  static async create({
    insuranceDefinitionId,
    agencyId,
    label = null,
    contactName = null,
    phone = null,
    email = null,
    notes = null,
    sortOrder = 0
  }) {
    const [result] = await pool.execute(
      `INSERT INTO insurance_credentialing_contacts
       (insurance_credentialing_definition_id, agency_id, label, contact_name, phone, email, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [insuranceDefinitionId, agencyId, label, contactName, phone, email, notes, sortOrder]
    );
    return result?.insertId ? await this.findById(result.insertId) : null;
  }

  static async update(id, updates) {
    const allowed = ['label', 'contact_name', 'phone', 'email', 'notes', 'sort_order'];
    const setClauses = [];
    const values = [];
    for (const [k, v] of Object.entries(updates)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      if (allowed.includes(col)) {
        setClauses.push(`${col} = ?`);
        values.push(v);
      }
    }
    if (!setClauses.length) return await this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE insurance_credentialing_contacts SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    return await this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM insurance_credentialing_contacts WHERE id = ?',
      [id]
    );
    return result?.affectedRows > 0;
  }
}

export default InsuranceCredentialingContact;
