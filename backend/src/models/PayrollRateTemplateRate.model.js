import pool from '../config/database.js';

class PayrollRateTemplateRate {
  static async listForTemplate(templateId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_template_rates
       WHERE template_id = ?
       ORDER BY service_code ASC`,
      [templateId]
    );
    return rows || [];
  }

  static async replaceAllForTemplate({ templateId, agencyId, rates }) {
    await pool.execute(`DELETE FROM payroll_rate_template_rates WHERE template_id = ?`, [templateId]);
    const rows = (rates || []).filter((r) => r && r.serviceCode);
    if (!rows.length) return;

    const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(',');
    const params = [];
    for (const r of rows) {
      params.push(templateId, agencyId, String(r.serviceCode).trim(), Number(r.rateAmount) || 0, r.rateUnit || 'per_unit');
    }
    await pool.execute(
      `INSERT INTO payroll_rate_template_rates
       (template_id, agency_id, service_code, rate_amount, rate_unit)
       VALUES ${placeholders}`,
      params
    );
  }
}

export default PayrollRateTemplateRate;

