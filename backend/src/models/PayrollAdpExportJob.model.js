import pool from '../config/database.js';

class PayrollAdpExportJob {
  static async create({ payrollPeriodId, agencyId, requestedByUserId, status = 'queued', provider = 'adp', requestPayload = null }) {
    const [result] = await pool.execute(
      `INSERT INTO payroll_adp_export_jobs
       (payroll_period_id, agency_id, requested_by_user_id, status, provider, request_payload)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payrollPeriodId, agencyId, requestedByUserId, status, provider, requestPayload ? JSON.stringify(requestPayload) : null]
    );
    return this.findById(result.insertId);
  }

  static async update(id, { status, responsePayload = null, errorMessage = null }) {
    await pool.execute(
      `UPDATE payroll_adp_export_jobs
       SET status = ?, response_payload = ?, error_message = ?, finished_at = NOW()
       WHERE id = ?`,
      [status, responsePayload ? JSON.stringify(responsePayload) : null, errorMessage, id]
    );
    return this.findById(id);
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM payroll_adp_export_jobs WHERE id = ?', [id]);
    const row = rows[0] || null;
    if (row && typeof row.request_payload === 'string') {
      try { row.request_payload = JSON.parse(row.request_payload); } catch { /* ignore */ }
    }
    if (row && typeof row.response_payload === 'string') {
      try { row.response_payload = JSON.parse(row.response_payload); } catch { /* ignore */ }
    }
    return row;
  }
}

export default PayrollAdpExportJob;

