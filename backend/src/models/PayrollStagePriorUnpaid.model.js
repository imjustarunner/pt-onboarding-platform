import pool from '../config/database.js';

class PayrollStagePriorUnpaid {
  static async listForPeriod(payrollPeriodId) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM payroll_stage_prior_unpaid WHERE payroll_period_id = ?`,
        [payrollPeriodId]
      );
      return rows;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }

  static async replaceForPeriod({ payrollPeriodId, agencyId, sourcePayrollPeriodId = null, computedByUserId, rows }) {
    try {
      await pool.execute('DELETE FROM payroll_stage_prior_unpaid WHERE payroll_period_id = ?', [payrollPeriodId]);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        throw new Error('Missing table payroll_stage_prior_unpaid. Run migrations before saving prior unpaid snapshot.');
      }
      throw e;
    }

    if (!rows || !rows.length) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        payrollPeriodId,
        agencyId,
        r.userId,
        r.serviceCode,
        r.stillUnpaidUnits,
        sourcePayrollPeriodId,
        computedByUserId
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_stage_prior_unpaid
       (payroll_period_id, agency_id, user_id, service_code, still_unpaid_units, source_payroll_period_id, computed_by_user_id)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }
}

export default PayrollStagePriorUnpaid;

