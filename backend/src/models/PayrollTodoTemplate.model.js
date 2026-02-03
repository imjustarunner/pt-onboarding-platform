import pool from '../config/database.js';

class PayrollTodoTemplate {
  static _normalizeTargetUserIdForDb(targetUserId) {
    // Some environments enforce an FK to users(id), where "0" is invalid.
    // Represent "not applicable" as NULL when possible.
    if (targetUserId === null) return null;
    if (targetUserId === undefined) return 0;
    const n = Number(targetUserId || 0);
    return Number.isFinite(n) ? n : 0;
  }

  static async listForAgency({ agencyId, includeInactive = true }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM payroll_todo_templates
       WHERE agency_id = ?
         ${includeInactive ? '' : 'AND is_active = 1'}
       ORDER BY is_active DESC, id DESC`,
      [agencyId]
    );
    return rows || [];
  }

  static async create({
    agencyId,
    title,
    description = null,
    scope = 'agency',
    targetUserId = 0,
    startPayrollPeriodId = null,
    createdByUserId,
    updatedByUserId
  }) {
    const targetUserDb = PayrollTodoTemplate._normalizeTargetUserIdForDb(targetUserId);
    const startDb = startPayrollPeriodId ? Number(startPayrollPeriodId) : null;

    let res;
    try {
      [res] = await pool.execute(
        `INSERT INTO payroll_todo_templates
         (agency_id, title, description, scope, target_user_id, start_payroll_period_id, is_active, created_by_user_id, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
        [agencyId, title, description, scope, targetUserDb, startDb, createdByUserId, updatedByUserId]
      );
    } catch (e) {
      // Back-compat: older schemas may have target_user_id NOT NULL, so NULL will error.
      if ((e?.code === 'ER_BAD_NULL_ERROR' || e?.errno === 1048) && targetUserDb === null) {
        [res] = await pool.execute(
          `INSERT INTO payroll_todo_templates
           (agency_id, title, description, scope, target_user_id, start_payroll_period_id, is_active, created_by_user_id, updated_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
          [agencyId, title, description, scope, 0, startDb, createdByUserId, updatedByUserId]
        );
      } else {
        throw e;
      }
    }
    return res?.insertId || null;
  }

  static async update({
    id,
    agencyId,
    title,
    description = null,
    scope = 'agency',
    targetUserId = 0,
    startPayrollPeriodId = null,
    isActive = 1,
    updatedByUserId
  }) {
    const targetUserDb = PayrollTodoTemplate._normalizeTargetUserIdForDb(targetUserId);
    const startDb = startPayrollPeriodId ? Number(startPayrollPeriodId) : null;
    try {
      await pool.execute(
        `UPDATE payroll_todo_templates
         SET title = ?,
             description = ?,
             scope = ?,
             target_user_id = ?,
             start_payroll_period_id = ?,
             is_active = ?,
             updated_by_user_id = ?
         WHERE id = ? AND agency_id = ?
         LIMIT 1`,
        [
          title,
          description,
          scope,
          targetUserDb,
          startDb,
          Number(isActive) ? 1 : 0,
          updatedByUserId,
          id,
          agencyId
        ]
      );
    } catch (e) {
      if ((e?.code === 'ER_BAD_NULL_ERROR' || e?.errno === 1048) && targetUserDb === null) {
        await pool.execute(
          `UPDATE payroll_todo_templates
           SET title = ?,
               description = ?,
               scope = ?,
               target_user_id = ?,
               start_payroll_period_id = ?,
               is_active = ?,
               updated_by_user_id = ?
           WHERE id = ? AND agency_id = ?
           LIMIT 1`,
          [
            title,
            description,
            scope,
            0,
            startDb,
            Number(isActive) ? 1 : 0,
            updatedByUserId,
            id,
            agencyId
          ]
        );
      } else {
        throw e;
      }
    }
  }

  static async setActive({ id, agencyId, isActive, updatedByUserId }) {
    await pool.execute(
      `UPDATE payroll_todo_templates
       SET is_active = ?, updated_by_user_id = ?
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [Number(isActive) ? 1 : 0, updatedByUserId, id, agencyId]
    );
  }

  static async delete({ id, agencyId }) {
    await pool.execute(
      `DELETE FROM payroll_todo_templates
       WHERE id = ? AND agency_id = ?
       LIMIT 1`,
      [id, agencyId]
    );
  }

  static async listActiveForAgencyWithStartDate({ agencyId }) {
    const [rows] = await pool.execute(
      `SELECT t.*,
              sp.period_start AS start_period_start,
              sp.period_end AS start_period_end
       FROM payroll_todo_templates t
       LEFT JOIN payroll_periods sp ON sp.id = t.start_payroll_period_id
       WHERE t.agency_id = ?
         AND t.is_active = 1
       ORDER BY t.id ASC`,
      [agencyId]
    );
    return rows || [];
  }
}

export default PayrollTodoTemplate;

