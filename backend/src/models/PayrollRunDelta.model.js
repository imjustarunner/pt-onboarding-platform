import pool from '../config/database.js';

class PayrollRunDelta {
  static async replaceForRunComparison({
    payrollPeriodId,
    agencyId,
    baselineRunId,
    compareRunId,
    createdByUserId = null,
    rows = []
  }, getConnection = () => pool.getConnection()) {
    const db = await getConnection();
    try {
      await db.beginTransaction();
      let supportsIdentityChange = true;
      if (rows.some(row => row.deltaType === 'identity_changed')) {
        // Inspect the table actually used by this connection, including a
        // temporary regression-test table. Avoid caching across a migration.
        const [[column]] = await db.execute("SHOW COLUMNS FROM payroll_run_deltas LIKE 'delta_type'");
        if (!column) throw new Error('Payroll comparison type column is unavailable.');
        supportsIdentityChange = !/^enum\(/i.test(column.Type) || column.Type.includes("'identity_changed'");
      }
      const values = rows.map(row => {
        const legacyIdentity = row.deltaType === 'identity_changed' && !supportsIdentityChange;
        let metadata = row.metadataJson || null;
        if (legacyIdentity) {
          if (typeof metadata === 'string') metadata = JSON.parse(metadata);
          // The API still returns identity_changed. An older schema stores its
          // exact subtype in metadata until the enum migration is applied.
          metadata = { ...metadata, deltaType: 'identity_changed' };
        }
        return [
          payrollPeriodId, agencyId, baselineRunId, compareRunId,
          row.rowMatchKey || null,
          legacyIdentity ? 'status_change' : row.deltaType,
          row.fromStatus || null, row.toStatus || null,
          row.fromServiceCode || null, row.toServiceCode || null,
          row.fromUnits ?? null, row.toUnits ?? null,
          row.paidState || null,
          metadata && typeof metadata !== 'string' ? JSON.stringify(metadata) : metadata,
          createdByUserId || null
        ];
      });
      await db.execute(
        `DELETE FROM payroll_run_deltas
         WHERE payroll_period_id = ? AND agency_id = ?
           AND baseline_run_id = ? AND compare_run_id = ?`,
        [payrollPeriodId, agencyId, baselineRunId, compareRunId]
      );
      let count = 0;
      if (values.length) {
        const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
        const [result] = await db.execute(
          `INSERT INTO payroll_run_deltas
           (payroll_period_id, agency_id, baseline_run_id, compare_run_id, row_match_key, delta_type,
            from_status, to_status, from_service_code, to_service_code, from_units, to_units,
            paid_state, metadata_json, created_by_user_id)
           VALUES ${placeholders}`,
          values.flat()
        );
        count = result.affectedRows || 0;
      }
      await db.commit();
      return count;
    } catch (error) {
      await db.rollback();
      throw error;
    } finally {
      db.release();
    }
  }
}

export default PayrollRunDelta;
