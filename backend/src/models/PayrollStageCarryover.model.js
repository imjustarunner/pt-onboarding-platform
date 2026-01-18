import pool from '../config/database.js';

class PayrollStageCarryover {
  static async listForPeriod(payrollPeriodId) {
    try {
      const [rows] = await pool.execute(
        `SELECT * FROM payroll_stage_carryovers WHERE payroll_period_id = ?`,
        [payrollPeriodId]
      );
      return rows;
    } catch (e) {
      // Some environments may not have all payroll tables yet.
      if (e?.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }

  static async replaceForPeriod({ payrollPeriodId, agencyId, sourcePayrollPeriodId = null, computedByUserId, rows }) {
    // Replace all carryovers for the period (idempotent).
    try {
      await pool.execute('DELETE FROM payroll_stage_carryovers WHERE payroll_period_id = ?', [payrollPeriodId]);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        throw new Error('Missing table payroll_stage_carryovers. Run migrations before applying carryovers.');
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
        r.carryoverFinalizedUnits,
        sourcePayrollPeriodId,
        computedByUserId
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_stage_carryovers
       (payroll_period_id, agency_id, user_id, service_code, carryover_finalized_units, source_payroll_period_id, computed_by_user_id)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }
}

export default PayrollStageCarryover;

