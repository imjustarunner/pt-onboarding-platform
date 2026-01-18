import pool from '../config/database.js';

class PayrollRateCard {
  static async findForUser(agencyId, userId) {
    const [rows] = await pool.execute(
      `SELECT * FROM payroll_rate_cards WHERE agency_id = ? AND user_id = ? LIMIT 1`,
      [agencyId, userId]
    );
    return rows?.[0] || null;
  }

  static async deleteForUser(agencyId, userId) {
    await pool.execute(
      `DELETE FROM payroll_rate_cards WHERE agency_id = ? AND user_id = ?`,
      [agencyId, userId]
    );
  }

  static async upsert({
    agencyId,
    userId,
    directRate = 0,
    indirectRate = 0,
    otherRate1 = 0,
    otherRate2 = 0,
    otherRate3 = 0,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO payroll_rate_cards
       (agency_id, user_id, direct_rate, indirect_rate, other_rate_1, other_rate_2, other_rate_3, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         direct_rate = VALUES(direct_rate),
         indirect_rate = VALUES(indirect_rate),
         other_rate_1 = VALUES(other_rate_1),
         other_rate_2 = VALUES(other_rate_2),
         other_rate_3 = VALUES(other_rate_3),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, userId, directRate, indirectRate, otherRate1, otherRate2, otherRate3, updatedByUserId]
    );
    return this.findForUser(agencyId, userId);
  }
}

export default PayrollRateCard;

