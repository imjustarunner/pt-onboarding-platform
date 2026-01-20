import pool from '../config/database.js';

class PayrollManualPayLine {
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

  static async create({ payrollPeriodId, agencyId, userId, label, amount, createdByUserId }) {
    const [res] = await pool.execute(
      `INSERT INTO payroll_manual_pay_lines
       (payroll_period_id, agency_id, user_id, label, amount, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [payrollPeriodId, agencyId, userId, label, amount, createdByUserId]
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
        label: String(l?.label || ''),
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
      const amount = Number(r?.amount);
      if (!Number.isFinite(userId) || userId <= 0) continue;
      if (!label) continue;
      if (label.length > 128) continue;
      if (!Number.isFinite(amount)) continue;
      // Allow negative amounts for corrections.
      clean.push({ userId, label, amount: Number(amount.toFixed(2)) });
    }

    if (!clean.length) return [];

    const placeholders = clean.map(() => '(?, ?, ?, ?, ?, ?)').join(',');
    const params = [];
    for (const r of clean) {
      params.push(
        payrollPeriodId,
        agencyId,
        r.userId,
        r.label,
        r.amount,
        createdByUserId
      );
    }
    await pool.execute(
      `INSERT INTO payroll_manual_pay_lines
       (payroll_period_id, agency_id, user_id, label, amount, created_by_user_id)
       VALUES ${placeholders}`,
      params
    );

    return this.listForPeriod({ payrollPeriodId, agencyId });
  }
}

export default PayrollManualPayLine;

