import pool from '../config/database.js';

class PayrollImportRow {
  static async _latestImportIdForPeriod(payrollPeriodId) {
    const [rows] = await pool.execute(
      `SELECT id
       FROM payroll_imports
       WHERE payroll_period_id = ?
       ORDER BY created_at DESC, id DESC
       LIMIT 1`,
      [payrollPeriodId]
    );
    return rows?.[0]?.id || null;
  }

  static async bulkInsert(rows) {
    if (!rows || rows.length === 0) return 0;
    const values = [];
    for (const r of rows) {
      values.push([
        r.payrollImportId,
        r.payrollPeriodId,
        r.agencyId,
        r.userId || null,
        r.providerName,
        r.patientFirstName || null,
        r.serviceCode,
        r.serviceDate || null,
        r.noteStatus || null,
        null, // appt_type (do not store)
        null, // amount_collected (do not store)
        null, // paid_status (do not store)
        r.draftPayable === undefined || r.draftPayable === null ? 1 : (r.draftPayable ? 1 : 0),
        r.unitCount,
        null, // raw_row (do not store)
        r.rowFingerprint || null,
        r.requiresProcessing ? 1 : 0,
        r.processedAt || null,
        r.processedByUserId || null
      ]);
    }

    // 19 columns inserted (see column list below) => 19 placeholders per row.
    const placeholders = values.map(() => '(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').join(',');
    const flat = values.flat();
    const [result] = await pool.execute(
      `INSERT INTO payroll_import_rows
       (payroll_import_id, payroll_period_id, agency_id, user_id, provider_name, patient_first_name, service_code, service_date, note_status, appt_type, amount_collected, paid_status, draft_payable, unit_count, raw_row, row_fingerprint, requires_processing, processed_at, processed_by_user_id)
       VALUES ${placeholders}`,
      flat
    );
    return result.affectedRows || 0;
  }

  static async listForPeriod(payrollPeriodId) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const [rows] = await pool.execute(
      `SELECT
         pir.id,
         pir.payroll_import_id,
         pir.payroll_period_id,
         pir.agency_id,
         pir.user_id,
         u.first_name,
         u.last_name,
         pir.provider_name,
         pir.patient_first_name,
         pir.service_code,
         pir.service_date,
         pir.note_status,
         pir.draft_payable,
         pir.unit_count,
         pir.row_fingerprint,
         pir.requires_processing,
         pir.processed_at,
         pir.processed_by_user_id,
         pir.created_at
       FROM payroll_import_rows pir
       LEFT JOIN users u ON pir.user_id = u.id
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
       ORDER BY pir.created_at DESC`,
      [payrollPeriodId, latestImportId]
    );
    return rows;
  }

  static async listAggregatedForPeriod(payrollPeriodId) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const [rows] = await pool.execute(
      `SELECT
         pir.user_id,
         pir.provider_name,
         pir.service_code,
         SUM(CASE WHEN pir.note_status = 'NO_NOTE' THEN pir.unit_count ELSE 0 END) AS raw_no_note_units,
         SUM(CASE WHEN pir.note_status = 'DRAFT' AND (pir.draft_payable = 1) THEN pir.unit_count ELSE 0 END) AS raw_draft_payable_units,
         SUM(CASE WHEN pir.note_status = 'DRAFT' AND (pir.draft_payable = 0) THEN pir.unit_count ELSE 0 END) AS raw_draft_not_payable_units,
         SUM(CASE WHEN pir.note_status = 'FINALIZED' THEN pir.unit_count ELSE 0 END) AS raw_finalized_units
       FROM payroll_import_rows pir
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
       GROUP BY pir.user_id, pir.provider_name, pir.service_code
       ORDER BY pir.user_id ASC, pir.provider_name ASC, pir.service_code ASC`,
      [payrollPeriodId, latestImportId]
    );
    return rows;
  }

  static async listAggregatedSessionsUnitsForPeriod({ payrollPeriodId, providerIds = null, groupBy = 'provider' }) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];

    const gb = String(groupBy || 'provider').toLowerCase();
    const by = gb === 'provider_service_code' ? 'provider_service_code' : (gb === 'service_code' ? 'service_code' : 'provider');
    const where = ['pir.payroll_period_id = ?', 'pir.payroll_import_id = ?'];
    const vals = [payrollPeriodId, latestImportId];

    const ids = Array.isArray(providerIds)
      ? providerIds.map((x) => parseInt(x, 10)).filter((n) => Number.isFinite(n) && n > 0)
      : [];
    if (ids.length) {
      where.push(`pir.user_id IN (${ids.map(() => '?').join(',')})`);
      vals.push(...ids);
    }

    const selectUser = by === 'service_code' ? 'NULL AS user_id, NULL AS first_name, NULL AS last_name, NULL AS provider_name,' : 'pir.user_id, u.first_name, u.last_name, pir.provider_name,';
    const selectServiceCode =
      (by === 'provider_service_code' || by === 'service_code')
        ? 'pir.service_code,'
        : '';
    const groupByClause =
      by === 'provider_service_code'
        ? 'pir.user_id, pir.provider_name, pir.service_code'
        : (by === 'service_code' ? 'pir.service_code' : 'pir.user_id, pir.provider_name');
    const orderByClause =
      by === 'service_code'
        ? 'pir.service_code ASC'
        : (by === 'provider_service_code'
            ? 'u.last_name ASC, u.first_name ASC, pir.provider_name ASC, pir.service_code ASC'
            : 'u.last_name ASC, u.first_name ASC, pir.provider_name ASC');

    const [rows] = await pool.execute(
      `SELECT
         ${selectUser}
         ${selectServiceCode}
         COUNT(*) AS session_count,
         SUM(COALESCE(pir.unit_count, 0)) AS units_total,
         SUM(CASE WHEN pir.note_status = 'NO_NOTE' THEN 1 ELSE 0 END) AS no_note_session_count,
         SUM(CASE WHEN pir.note_status = 'DRAFT' THEN 1 ELSE 0 END) AS draft_session_count,
         SUM(CASE WHEN pir.note_status = 'FINALIZED' THEN 1 ELSE 0 END) AS finalized_session_count,
         SUM(CASE WHEN pir.note_status = 'NO_NOTE' THEN COALESCE(pir.unit_count, 0) ELSE 0 END) AS no_note_units_total,
         SUM(CASE WHEN pir.note_status = 'DRAFT' THEN COALESCE(pir.unit_count, 0) ELSE 0 END) AS draft_units_total,
         SUM(CASE WHEN pir.note_status = 'FINALIZED' THEN COALESCE(pir.unit_count, 0) ELSE 0 END) AS finalized_units_total
       FROM payroll_import_rows pir
       LEFT JOIN users u ON u.id = pir.user_id
       WHERE ${where.join(' AND ')}
       GROUP BY ${groupByClause}
       ORDER BY ${orderByClause}`,
      vals
    );
    return rows || [];
  }

  static async updateDraftPayable({ rowId, draftPayable }) {
    const [result] = await pool.execute(
      `UPDATE payroll_import_rows
       SET draft_payable = ?
       WHERE id = ?`,
      [draftPayable ? 1 : 0, rowId]
    );
    return result.affectedRows || 0;
  }

  static async updateUnitCount({ rowId, unitCount }) {
    const [result] = await pool.execute(
      `UPDATE payroll_import_rows
       SET unit_count = ?
       WHERE id = ?`,
      [Number(unitCount), rowId]
    );
    return result.affectedRows || 0;
  }

  static async updateProcessed({ rowId, processedAt, processedByUserId }) {
    const [result] = await pool.execute(
      `UPDATE payroll_import_rows
       SET processed_at = ?, processed_by_user_id = ?
       WHERE id = ?`,
      [processedAt || null, processedByUserId || null, rowId]
    );
    return result.affectedRows || 0;
  }

  static async countUnprocessedForPeriod({ payrollPeriodId }) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return 0;
    const [rows] = await pool.execute(
      `SELECT COUNT(1) AS c
       FROM payroll_import_rows
       WHERE payroll_period_id = ?
         AND payroll_import_id = ?
         AND requires_processing = 1
         AND processed_at IS NULL
         AND UPPER(TRIM(service_code)) IN ('H0031','H0032')
         AND (
           note_status = 'FINALIZED'
           OR (note_status = 'DRAFT' AND draft_payable = 1)
         )`,
      [payrollPeriodId, latestImportId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  static async listUnprocessedForPeriod({ payrollPeriodId, limit = 200 }) {
    const latestImportId = await this._latestImportIdForPeriod(payrollPeriodId);
    if (!latestImportId) return [];
    const lim = Math.max(1, Math.min(1000, Number(limit) || 200));
    const [rows] = await pool.execute(
      `SELECT
         pir.id,
         pir.user_id,
         pir.provider_name,
         pir.service_code,
         pir.service_date,
         pir.note_status,
         pir.draft_payable,
         pir.unit_count,
         pir.requires_processing,
         pir.processed_at
       FROM payroll_import_rows pir
       WHERE pir.payroll_period_id = ?
         AND pir.payroll_import_id = ?
         AND pir.requires_processing = 1
         AND pir.processed_at IS NULL
         AND UPPER(TRIM(pir.service_code)) IN ('H0031','H0032')
         AND (
           pir.note_status = 'FINALIZED'
           OR (pir.note_status = 'DRAFT' AND pir.draft_payable = 1)
         )
       ORDER BY pir.service_code ASC, pir.service_date DESC, pir.id DESC
       LIMIT ${lim}`,
      [payrollPeriodId, latestImportId]
    );
    return rows;
  }

  static async findById(rowId) {
    const [rows] = await pool.execute('SELECT * FROM payroll_import_rows WHERE id = ? LIMIT 1', [rowId]);
    return rows?.[0] || null;
  }
}

export default PayrollImportRow;

