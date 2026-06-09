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
    otherRate1Bucket = undefined,
    otherRate2Bucket = undefined,
    otherRate3Bucket = undefined,
    percentPayEnabled = undefined,
    updatedByUserId
  }) {
    const normalizeBucket = (v, fallback = 'other') => {
      const s = String(v ?? '').trim().toLowerCase();
      if (s === 'direct' || s === 'indirect' || s === 'other') return s;
      return fallback;
    };

    // Preserve existing bucket/toggle settings unless explicitly provided.
    const existing = await this.findForUser(agencyId, userId);
    const b1 = normalizeBucket(otherRate1Bucket, normalizeBucket(existing?.other_rate_1_bucket, 'other'));
    const b2 = normalizeBucket(otherRate2Bucket, normalizeBucket(existing?.other_rate_2_bucket, 'other'));
    const b3 = normalizeBucket(otherRate3Bucket, normalizeBucket(existing?.other_rate_3_bucket, 'other'));
    const pctEnabled = percentPayEnabled === undefined
      ? (existing?.percent_pay_enabled ?? 0)
      : (percentPayEnabled ? 1 : 0);

    await pool.execute(
      `INSERT INTO payroll_rate_cards
       (agency_id, user_id, direct_rate, indirect_rate, other_rate_1, other_rate_1_bucket, other_rate_2, other_rate_2_bucket, other_rate_3, other_rate_3_bucket, percent_pay_enabled, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         direct_rate = VALUES(direct_rate),
         indirect_rate = VALUES(indirect_rate),
         other_rate_1 = VALUES(other_rate_1),
         other_rate_1_bucket = VALUES(other_rate_1_bucket),
         other_rate_2 = VALUES(other_rate_2),
         other_rate_2_bucket = VALUES(other_rate_2_bucket),
         other_rate_3 = VALUES(other_rate_3),
         other_rate_3_bucket = VALUES(other_rate_3_bucket),
         percent_pay_enabled = VALUES(percent_pay_enabled),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, userId, directRate, indirectRate, otherRate1, b1, otherRate2, b2, otherRate3, b3, pctEnabled, updatedByUserId]
    );
    return this.findForUser(agencyId, userId);
  }
}

export default PayrollRateCard;

