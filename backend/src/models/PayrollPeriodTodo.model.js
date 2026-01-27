import pool from '../config/database.js';
import PayrollTodoTemplate from './PayrollTodoTemplate.model.js';

class PayrollPeriodTodo {
  static async listForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT ppt.*,
              u.first_name AS done_by_first_name,
              u.last_name AS done_by_last_name
       FROM payroll_period_todos ppt
       LEFT JOIN users u ON ppt.done_by_user_id = u.id
       WHERE ppt.payroll_period_id = ? AND ppt.agency_id = ?
       ORDER BY (ppt.status = 'pending') DESC, ppt.id ASC`,
      [payrollPeriodId, agencyId]
    );
    return rows || [];
  }

  static async createAdHoc({
    payrollPeriodId,
    agencyId,
    title,
    description = null,
    scope = 'agency',
    targetUserId = 0,
    createdByUserId
  }) {
    const [res] = await pool.execute(
      `INSERT INTO payroll_period_todos
       (payroll_period_id, agency_id, template_id, title, description, scope, target_user_id, status, created_by_user_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 'pending', ?)`,
      [payrollPeriodId, agencyId, title, description, scope, Number(targetUserId || 0), createdByUserId]
    );
    return res?.insertId || null;
  }

  static async setStatus({ todoId, payrollPeriodId, agencyId, status, doneByUserId }) {
    const st = String(status || '').toLowerCase() === 'done' ? 'done' : 'pending';
    await pool.execute(
      `UPDATE payroll_period_todos
       SET status = ?,
           done_at = ${st === 'done' ? 'CURRENT_TIMESTAMP' : 'NULL'},
           done_by_user_id = ${st === 'done' ? '?' : 'NULL'}
       WHERE id = ? AND payroll_period_id = ? AND agency_id = ?
       LIMIT 1`,
      st === 'done'
        ? [st, doneByUserId, todoId, payrollPeriodId, agencyId]
        : [st, todoId, payrollPeriodId, agencyId]
    );
  }

  static async countPendingForPeriod({ payrollPeriodId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT COUNT(1) AS c
       FROM payroll_period_todos
       WHERE payroll_period_id = ? AND agency_id = ? AND status = 'pending'`,
      [payrollPeriodId, agencyId]
    );
    return Number(rows?.[0]?.c || 0);
  }

  static async listPendingSampleForPeriod({ payrollPeriodId, agencyId, limit = 20 }) {
    const lim = Math.max(1, Math.min(200, Number(limit) || 20));
    const [rows] = await pool.execute(
      `SELECT id, title, scope, target_user_id, template_id, created_at
       FROM payroll_period_todos
       WHERE payroll_period_id = ? AND agency_id = ? AND status = 'pending'
       ORDER BY id ASC
       LIMIT ${lim}`,
      [payrollPeriodId, agencyId]
    );
    return rows || [];
  }

  static async ensureMaterializedForPeriod({ payrollPeriodId, agencyId }) {
    // Best-effort if tables don't exist yet.
    const [pRows] = await pool.execute(
      `SELECT period_start
       FROM payroll_periods
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [payrollPeriodId, agencyId]
    );
    const periodStart = pRows?.[0]?.period_start ? String(pRows[0].period_start).slice(0, 10) : null;
    if (!periodStart) return { inserted: 0 };

    const templates = await PayrollTodoTemplate.listActiveForAgencyWithStartDate({ agencyId });
    let inserted = 0;

    for (const t of templates || []) {
      const startPeriodStart = t?.start_period_start ? String(t.start_period_start).slice(0, 10) : null;
      const startOk = (!Number(t?.start_payroll_period_id || 0)) || (!!startPeriodStart && startPeriodStart <= periodStart);
      if (!startOk) continue;

      const scope = String(t?.scope || 'agency').trim().toLowerCase() === 'provider' ? 'provider' : 'agency';
      const targetUserId = Number(t?.target_user_id || 0);
      if (scope === 'provider' && !(targetUserId > 0)) continue;

      // Upsert-like insert (unique key on period/template/target).
      try {
        const [res] = await pool.execute(
          `INSERT INTO payroll_period_todos
           (payroll_period_id, agency_id, template_id, title, description, scope, target_user_id, status, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', ?)
           ON DUPLICATE KEY UPDATE id = id`,
          [
            payrollPeriodId,
            agencyId,
            t.id,
            String(t.title || '').slice(0, 180),
            t.description ?? null,
            scope,
            scope === 'provider' ? targetUserId : 0,
            Number(t.updated_by_user_id || t.created_by_user_id || 0) || 1
          ]
        );
        inserted += Number(res?.affectedRows || 0) > 0 ? 1 : 0;
      } catch (e) {
        // Ignore duplicate errors / missing table errors
        if (e?.code === 'ER_NO_SUCH_TABLE') return { inserted: 0 };
        if (e?.code === 'ER_DUP_ENTRY') continue;
        throw e;
      }
    }

    return { inserted };
  }
}

export default PayrollPeriodTodo;

