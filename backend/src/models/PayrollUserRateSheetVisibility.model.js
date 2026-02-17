import pool from '../config/database.js';

class PayrollUserRateSheetVisibility {
  static async listForUser({ agencyId, userId }) {
    try {
      const [rows] = await pool.execute(
        `SELECT agency_id, user_id, service_code, show_in_rate_sheet, updated_by_user_id, created_at, updated_at
         FROM payroll_user_rate_sheet_visibility
         WHERE agency_id = ? AND user_id = ?`,
        [agencyId, userId]
      );
      return rows || [];
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return [];
      throw e;
    }
  }

  static async upsert({ agencyId, userId, serviceCode, showInRateSheet, updatedByUserId }) {
    try {
      await pool.execute(
        `INSERT INTO payroll_user_rate_sheet_visibility
         (agency_id, user_id, service_code, show_in_rate_sheet, updated_by_user_id)
         VALUES (?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           show_in_rate_sheet = VALUES(show_in_rate_sheet),
           updated_by_user_id = VALUES(updated_by_user_id),
           updated_at = CURRENT_TIMESTAMP`,
        [agencyId, userId, serviceCode, showInRateSheet ? 1 : 0, updatedByUserId || null]
      );
      const [rows] = await pool.execute(
        `SELECT agency_id, user_id, service_code, show_in_rate_sheet, updated_by_user_id, created_at, updated_at
         FROM payroll_user_rate_sheet_visibility
         WHERE agency_id = ? AND user_id = ? AND service_code = ?
         LIMIT 1`,
        [agencyId, userId, serviceCode]
      );
      return rows?.[0] || null;
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') {
        // Backward compatibility: if migration is not applied, act as no-op visible.
        return {
          agency_id: agencyId,
          user_id: userId,
          service_code: serviceCode,
          show_in_rate_sheet: showInRateSheet ? 1 : 0,
          updated_by_user_id: updatedByUserId || null
        };
      }
      throw e;
    }
  }
}

export default PayrollUserRateSheetVisibility;

