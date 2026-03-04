import pool from '../config/database.js';

/**
 * Insurance credentialing definitions - agency-configurable list of insurances
 * (e.g. Aetna, First Health) with contact info and login credentials.
 */
class InsuranceCredentialingDefinition {
  static async listByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT id, agency_id, name, parent_id, contact_phone, contact_email,
              reminder_notes, sort_order, created_at, updated_at
       FROM insurance_credentialing_definitions
       WHERE agency_id = ?
       ORDER BY sort_order ASC, name ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      'SELECT * FROM insurance_credentialing_definitions WHERE id = ? LIMIT 1',
      [id]
    );
    return rows?.[0] || null;
  }

  static async create({
    agencyId,
    name,
    parentId = null,
    contactPhone = null,
    contactEmail = null,
    reminderNotes = null,
    sortOrder = 0
  }) {
    const [result] = await pool.execute(
      `INSERT INTO insurance_credentialing_definitions
       (agency_id, name, parent_id, contact_phone, contact_email, reminder_notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [agencyId, name, parentId, contactPhone, contactEmail, reminderNotes, sortOrder]
    );
    return result?.insertId ? await this.findById(result.insertId) : null;
  }

  static async update(id, updates) {
    const allowed = [
      'name', 'parent_id', 'contact_phone', 'contact_email', 'reminder_notes', 'sort_order',
      'login_username_ciphertext', 'login_username_iv', 'login_username_auth_tag', 'login_username_key_id',
      'login_password_ciphertext', 'login_password_iv', 'login_password_auth_tag', 'login_password_key_id'
    ];
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
      `UPDATE insurance_credentialing_definitions SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    return await this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM insurance_credentialing_definitions WHERE id = ?',
      [id]
    );
    return result?.affectedRows > 0;
  }
}

export default InsuranceCredentialingDefinition;
