import pool from '../config/database.js';

class PayrollRunDelta {
  static async replaceForRunComparison({
    payrollPeriodId,
    agencyId,
    baselineRunId,
    compareRunId,
    createdByUserId = null,
    rows = []
  }) {
    await pool.execute(
      `DELETE FROM payroll_run_deltas
       WHERE payroll_period_id = ?
         AND baseline_run_id = ?
         AND compare_run_id = ?`,
      [payrollPeriodId, baselineRunId, compareRunId]
    );
    if (!rows.length) return 0;

    const values = rows.map((r) => ([
      payrollPeriodId,
      agencyId,
      baselineRunId,
      compareRunId,
      r.rowMatchKey || null,
      r.deltaType,
      r.fromStatus || null,
      r.toStatus || null,
      r.fromServiceCode || null,
      r.toServiceCode || null,
      r.fromUnits ?? null,
      r.toUnits ?? null,
      r.paidState || null,
      r.metadataJson || null,
      createdByUserId || null
    ]));
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const [result] = await pool.execute(
      `INSERT INTO payroll_run_deltas
       (payroll_period_id, agency_id, baseline_run_id, compare_run_id, row_match_key, delta_type,
        from_status, to_status, from_service_code, to_service_code, from_units, to_units,
        paid_state, metadata_json, created_by_user_id)
       VALUES ${placeholders}`,
      values.flat()
    );
    return result.affectedRows || 0;
  }
}

export default PayrollRunDelta;
