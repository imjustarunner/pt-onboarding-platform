import pool from '../config/database.js';

class AgencyMileageRate {
  static async listForAgency(agencyId) {
    const [rows] = await pool.execute(
      `SELECT agency_id, tier_level, rate_per_mile, updated_by_user_id, created_at, updated_at
       FROM agency_mileage_rates
       WHERE agency_id = ?
       ORDER BY tier_level ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async upsert({ agencyId, tierLevel, ratePerMile, updatedByUserId }) {
    await pool.execute(
      `INSERT INTO agency_mileage_rates (agency_id, tier_level, rate_per_mile, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         rate_per_mile = VALUES(rate_per_mile),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, tierLevel, ratePerMile, updatedByUserId || null]
    );
  }
}

export default AgencyMileageRate;

