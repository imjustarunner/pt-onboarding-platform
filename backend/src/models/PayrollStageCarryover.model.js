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
      const meta =
        r?.carryoverMeta && typeof r.carryoverMeta === 'object'
          ? r.carryoverMeta
          : null;
      values.push([
        payrollPeriodId,
        agencyId,
        r.userId,
        r.serviceCode,
        r.carryoverFinalizedUnits,
        Number.isFinite(Number(r.carryoverFinalizedRowCount)) ? Math.max(0, parseInt(r.carryoverFinalizedRowCount, 10) || 0) : 0,
        meta ? JSON.stringify(meta) : null,
        sourcePayrollPeriodId,
        computedByUserId
      ]);
    }
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    try {
      const [result] = await pool.execute(
        `INSERT INTO payroll_stage_carryovers
         (payroll_period_id, agency_id, user_id, service_code,
          carryover_finalized_units, carryover_finalized_row_count,
          carryover_meta_json,
          source_payroll_period_id, computed_by_user_id)
         VALUES ${placeholders}`,
        flat
      );
      return result.affectedRows || 0;
    } catch (e) {
      // Backward compatible: older DBs may not have the new columns yet.
      if (e?.code === 'ER_BAD_FIELD_ERROR') {
        const msg = String(e?.sqlMessage || e?.message || '');
        // If DB has row-count but not meta_json, retry without meta_json.
        if (msg.includes('carryover_meta_json')) {
          const retryValues = [];
          for (const r of rows) {
            retryValues.push([
              payrollPeriodId,
              agencyId,
              r.userId,
              r.serviceCode,
              r.carryoverFinalizedUnits,
              Number.isFinite(Number(r.carryoverFinalizedRowCount)) ? Math.max(0, parseInt(r.carryoverFinalizedRowCount, 10) || 0) : 0,
              sourcePayrollPeriodId,
              computedByUserId
            ]);
          }
          const retryPlaceholders = retryValues.map(() => '(?, ?, ?, ?, ?, ?, ?, ?)').join(',');
          const retryFlat = retryValues.flat();
          const [resultRetry] = await pool.execute(
            `INSERT INTO payroll_stage_carryovers
             (payroll_period_id, agency_id, user_id, service_code,
              carryover_finalized_units, carryover_finalized_row_count,
              source_payroll_period_id, computed_by_user_id)
             VALUES ${retryPlaceholders}`,
            retryFlat
          );
          return resultRetry.affectedRows || 0;
        }

        // If DB doesn't have row-count either, fall back to the legacy shape.
        const fallbackValues = [];
        for (const r of rows) {
          fallbackValues.push([
            payrollPeriodId,
            agencyId,
            r.userId,
            r.serviceCode,
            r.carryoverFinalizedUnits,
            sourcePayrollPeriodId,
            computedByUserId
          ]);
        }
        const fbPlaceholders = fallbackValues.map(() => '(?, ?, ?, ?, ?, ?, ?)').join(',');
        const fbFlat = fallbackValues.flat();
        const [result2] = await pool.execute(
          `INSERT INTO payroll_stage_carryovers
           (payroll_period_id, agency_id, user_id, service_code, carryover_finalized_units, source_payroll_period_id, computed_by_user_id)
           VALUES ${fbPlaceholders}`,
          fbFlat
        );
        return result2.affectedRows || 0;
      }
      throw e;
    }
  }
}

export default PayrollStageCarryover;

