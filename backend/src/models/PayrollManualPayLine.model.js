import pool from '../config/database.js';

class PayrollManualPayLine {
  static async _hasColumn(colName) {
    try {
      const [rows] = await pool.execute(
        `SELECT 1 AS ok
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = DATABASE()
           AND TABLE_NAME = 'payroll_manual_pay_lines'
           AND COLUMN_NAME = ?
         LIMIT 1`,
        [colName]
      );
      return Boolean(rows?.[0]?.ok);
    } catch {
      return false;
    }
  }

  static async _hasCreditsHoursColumn() {
    return this._hasColumn('credits_hours');
  }

  static async listForPeriod(args) {
    // Supports:
    // - listForPeriod(payrollPeriodId)
    // - listForPeriod({ payrollPeriodId, agencyId })
    const payrollPeriodId =
      (typeof args === 'object' && args !== null)
        ? Number(args.payrollPeriodId || args.payroll_period_id || 0)
        : Number(args || 0);
    const agencyId =
      (typeof args === 'object' && args !== null)
        ? Number(args.agencyId || args.agency_id || 0)
        : 0;

    if (!payrollPeriodId) return [];

    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ?
         ${agencyId ? 'AND agency_id = ?' : ''}
       ORDER BY id ASC`,
      agencyId ? [payrollPeriodId, agencyId] : [payrollPeriodId]
    );
    return rows || [];
  }

  static async create({
    payrollPeriodId,
    agencyId,
    userId,
    lineType = 'pay',
    ptoBucket = null,
    label,
    category = 'indirect',
    creditsHours = null,
    amount,
    createdByUserId
  }) {
    const lt = String(lineType || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay';
    const ptoB = (String(ptoBucket || '').trim().toLowerCase() === 'training') ? 'training' : 'sick';
    const cat = String(category || 'indirect').trim().toLowerCase();
    const safeCat = (cat === 'indirect') ? 'indirect' : 'direct';
    const hasCredits = await this._hasCreditsHoursColumn();
    const hasLineType = await this._hasColumn('line_type');
    const hasPtoBucket = await this._hasColumn('pto_bucket');
    const hrsRaw = creditsHours === null || creditsHours === undefined || creditsHours === '' ? null : Number(creditsHours);
    const safeHrs = Number.isFinite(hrsRaw) ? Math.round(hrsRaw * 100) / 100 : null;
    const [res] = await pool.execute(
      (hasLineType && hasPtoBucket && hasCredits)
        ? `INSERT INTO payroll_manual_pay_lines
           (payroll_period_id, agency_id, user_id, line_type, pto_bucket, label, category, credits_hours, amount, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        : (hasLineType && hasPtoBucket)
          ? `INSERT INTO payroll_manual_pay_lines
             (payroll_period_id, agency_id, user_id, line_type, pto_bucket, label, category, amount, created_by_user_id)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
          : hasCredits
            ? `INSERT INTO payroll_manual_pay_lines
               (payroll_period_id, agency_id, user_id, label, category, credits_hours, amount, created_by_user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            : `INSERT INTO payroll_manual_pay_lines
               (payroll_period_id, agency_id, user_id, label, category, amount, created_by_user_id)
               VALUES (?, ?, ?, ?, ?, ?, ?)`,
      (hasLineType && hasPtoBucket && hasCredits)
        ? [payrollPeriodId, agencyId, userId, lt, (lt === 'pto' ? ptoB : null), label, safeCat, safeHrs, amount, createdByUserId]
        : (hasLineType && hasPtoBucket)
          ? [payrollPeriodId, agencyId, userId, lt, (lt === 'pto' ? ptoB : null), label, safeCat, amount, createdByUserId]
          : hasCredits
            ? [payrollPeriodId, agencyId, userId, label, safeCat, safeHrs, amount, createdByUserId]
            : [payrollPeriodId, agencyId, userId, label, safeCat, amount, createdByUserId]
    );
    return res?.insertId || null;
  }

  static async sumByUserForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT user_id, COALESCE(SUM(amount), 0) AS amount
       FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ? AND agency_id = ?
       GROUP BY user_id`,
      [payrollPeriodId, agencyId]
    );
    return rows || [];
  }

  static async listForPeriodGroupedByUser({ payrollPeriodId, agencyId }) {
    const lines = await this.listForPeriod({ payrollPeriodId, agencyId });
    const byUserId = new Map();
    for (const l of lines || []) {
      const uid = Number(l?.user_id || 0);
      if (!uid) continue;
      if (!byUserId.has(uid)) byUserId.set(uid, []);
      byUserId.get(uid).push({
        id: Number(l?.id || 0),
        lineType: String(l?.line_type || 'pay').trim().toLowerCase() === 'pto' ? 'pto' : 'pay',
        ptoBucket: (String(l?.pto_bucket || '').trim().toLowerCase() === 'training') ? 'training' : 'sick',
        label: String(l?.label || ''),
        category: String(l?.category || 'direct').trim().toLowerCase() === 'indirect' ? 'indirect' : 'direct',
        creditsHours:
          (l?.credits_hours === null || l?.credits_hours === undefined || l?.credits_hours === '')
            ? null
            : Number(l?.credits_hours),
        amount: Number(l?.amount || 0)
      });
    }
    return { byUserId };
  }

  static async replaceForPeriod({ payrollPeriodId, agencyId, rows, createdByUserId }) {
    // Replace everything for the period. Intended for staging UI "Save manual lines".
    await pool.execute(
      `DELETE FROM payroll_manual_pay_lines
       WHERE payroll_period_id = ? AND agency_id = ?`,
      [payrollPeriodId, agencyId]
    );

    const clean = [];
    for (const r of rows || []) {
      const userId = Number(r?.userId || r?.user_id || 0);
      const label = String(r?.label || '').trim();
      const cat = String(r?.category || 'indirect').trim().toLowerCase();
      const category = (cat === 'indirect') ? 'indirect' : 'direct';
      const amount = Number(r?.amount);
      const hrsRaw = (r?.creditsHours === null || r?.creditsHours === undefined || r?.creditsHours === '' || r?.credits_hours === null || r?.credits_hours === undefined || r?.credits_hours === '')
        ? null
        : Number(r?.creditsHours ?? r?.credits_hours);
      if (!Number.isFinite(userId) || userId <= 0) continue;
      if (!label) continue;
      if (label.length > 128) continue;
      if (!Number.isFinite(amount)) continue;
      if (hrsRaw !== null && (!Number.isFinite(hrsRaw) || hrsRaw < 0)) continue;
      // Allow negative amounts for corrections.
      clean.push({ userId, label, category, creditsHours: (hrsRaw === null ? null : Number((Math.round(hrsRaw * 100) / 100).toFixed(2))), amount: Number(amount.toFixed(2)) });
    }

    if (!clean.length) return [];

    const hasCredits = await this._hasCreditsHoursColumn();
    const placeholders = clean.map(() => (hasCredits ? '(?, ?, ?, ?, ?, ?, ?, ?)' : '(?, ?, ?, ?, ?, ?, ?)')).join(',');
    const params = [];
    for (const r of clean) {
      params.push(
        payrollPeriodId,
        agencyId,
        r.userId,
        r.label,
        r.category,
        ...(hasCredits ? [r.creditsHours] : []),
        r.amount,
        createdByUserId
      );
    }
    await pool.execute(
      hasCredits
        ? `INSERT INTO payroll_manual_pay_lines
           (payroll_period_id, agency_id, user_id, label, category, credits_hours, amount, created_by_user_id)
           VALUES ${placeholders}`
        : `INSERT INTO payroll_manual_pay_lines
           (payroll_period_id, agency_id, user_id, label, category, amount, created_by_user_id)
           VALUES ${placeholders}`,
      params
    );

    return this.listForPeriod({ payrollPeriodId, agencyId });
  }
}

export default PayrollManualPayLine;

