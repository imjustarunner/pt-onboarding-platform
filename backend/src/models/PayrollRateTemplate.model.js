import pool from '../config/database.js';

class PayrollRateTemplate {
  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_templates
       WHERE agency_id = ?
       ORDER BY name ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findByAgencyAndName({ agencyId, name }) {
    const aId = agencyId ? parseInt(agencyId, 10) : null;
    const nm = String(name || '').trim();
    if (!aId || !nm) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_templates
       WHERE agency_id = ? AND name = ?
       LIMIT 1`,
      [aId, nm]
    );
    return rows?.[0] || null;
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_templates WHERE id = ? LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async create({
    agencyId,
    name,
    fingerprint = null,
    isVariable = 0,
    directRate = 0,
    indirectRate = 0,
    otherRate1 = 0,
    otherRate2 = 0,
    otherRate3 = 0,
    createdByUserId,
    updatedByUserId
  }) {
    // Backward compatible: fingerprint column may not exist yet.
    let hasFingerprint = false;
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_rate_templates' AND COLUMN_NAME = 'fingerprint'"
      );
      hasFingerprint = (cols || []).length > 0;
    } catch {
      hasFingerprint = false;
    }

    const fields = [
      'agency_id',
      'name',
      ...(hasFingerprint ? ['fingerprint'] : []),
      'is_variable',
      'direct_rate',
      'indirect_rate',
      'other_rate_1',
      'other_rate_2',
      'other_rate_3',
      'created_by_user_id',
      'updated_by_user_id'
    ];
    const values = [
      agencyId,
      name,
      ...(hasFingerprint ? [fingerprint] : []),
      isVariable ? 1 : 0,
      directRate,
      indirectRate,
      otherRate1,
      otherRate2,
      otherRate3,
      createdByUserId,
      updatedByUserId
    ];
    const placeholders = fields.map(() => '?').join(', ');

    const [result] = await pool.execute(
      `INSERT INTO payroll_rate_templates (${fields.join(', ')}) VALUES (${placeholders})`,
      values
    );
    return this.findById(result.insertId);
  }

  static async findByFingerprint({ agencyId, fingerprint }) {
    if (!agencyId || !fingerprint) return null;
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_templates
       WHERE agency_id = ? AND fingerprint = ?
       LIMIT 1`,
      [agencyId, String(fingerprint).trim()]
    );
    return rows?.[0] || null;
  }

  static async updateName({ templateId, agencyId, name, updatedByUserId }) {
    await pool.execute(
      `UPDATE payroll_rate_templates
       SET name = ?, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ? AND agency_id = ?`,
      [name, updatedByUserId, templateId, agencyId]
    );
    return this.findById(templateId);
  }

  static async deleteForAgency({ templateId, agencyId }) {
    const id = templateId ? parseInt(templateId, 10) : null;
    const aId = agencyId ? parseInt(agencyId, 10) : null;
    if (!id || !aId) return 0;
    const [result] = await pool.execute(
      `DELETE FROM payroll_rate_templates WHERE id = ? AND agency_id = ?`,
      [id, aId]
    );
    return result.affectedRows || 0;
  }
}

export default PayrollRateTemplate;

