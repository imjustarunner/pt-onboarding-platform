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
    // De-duplicate by service code. This prevents unique-key failures if callers
    // provide multiple effective-dated rows (same code) or accidental duplicates.
    const byCode = new Map();
    for (const r of (rates || [])) {
      const code = String(r?.serviceCode || '').trim().toUpperCase();
      if (!code) continue;
      byCode.set(code, {
        serviceCode: code,
        rateAmount: Number(r.rateAmount) || 0,
        rateUnit: r.rateUnit || 'per_unit'
      });
    }
    const rows = Array.from(byCode.values());
    if (!rows.length) return;

    const placeholders = rows.map(() => '(?, ?, ?, ?, ?)').join(',');
    const params = [];
    for (const r of rows) {
      params.push(templateId, agencyId, r.serviceCode, Number(r.rateAmount) || 0, r.rateUnit || 'per_unit');
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

