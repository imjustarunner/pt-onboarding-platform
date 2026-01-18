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
    isVariable = 0,
    directRate = 0,
    indirectRate = 0,
    otherRate1 = 0,
    otherRate2 = 0,
    otherRate3 = 0,
    createdByUserId,
    updatedByUserId
  }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_rate_templates
       (agency_id, name, is_variable, direct_rate, indirect_rate, other_rate_1, other_rate_2, other_rate_3, created_by_user_id, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        name,
        isVariable ? 1 : 0,
        directRate,
        indirectRate,
        otherRate1,
        otherRate2,
        otherRate3,
        createdByUserId,
        updatedByUserId
      ]
    );
    return this.findById(result.insertId);
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
}

export default PayrollRateTemplate;

