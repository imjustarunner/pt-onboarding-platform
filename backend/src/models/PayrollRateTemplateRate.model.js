import pool from '../config/database.js';

class PayrollRateTemplateRate {
  static async _hasVisibilityColumn() {
    try {
      const [cols] = await pool.execute(
        "SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'payroll_rate_template_rates' AND COLUMN_NAME = 'show_in_rate_sheet'"
      );
      return (cols || []).length > 0;
    } catch {
      return false;
    }
  }

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
        rateUnit: r.rateUnit || 'per_unit',
        showInRateSheet:
          r.showInRateSheet === undefined || r.showInRateSheet === null ? 1 : (r.showInRateSheet ? 1 : 0)
      });
    }
    const rows = Array.from(byCode.values());
    if (!rows.length) return;

    const hasVis = await this._hasVisibilityColumn();
    const placeholders = rows.map(() => (hasVis ? '(?, ?, ?, ?, ?, ?)' : '(?, ?, ?, ?, ?)')).join(',');
    const params = [];
    for (const r of rows) {
      if (hasVis) {
        params.push(
          templateId,
          agencyId,
          r.serviceCode,
          Number(r.rateAmount) || 0,
          r.rateUnit || 'per_unit',
          r.showInRateSheet ? 1 : 0
        );
      } else {
        params.push(templateId, agencyId, r.serviceCode, Number(r.rateAmount) || 0, r.rateUnit || 'per_unit');
      }
    }
    await pool.execute(
      `INSERT INTO payroll_rate_template_rates
       (${[
         'template_id',
         'agency_id',
         'service_code',
         'rate_amount',
         'rate_unit',
         ...(hasVis ? ['show_in_rate_sheet'] : [])
       ].join(', ')})
       VALUES ${placeholders}`,
      params
    );
  }
}

export default PayrollRateTemplateRate;

