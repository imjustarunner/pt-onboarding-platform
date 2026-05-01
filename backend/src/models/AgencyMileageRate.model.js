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

  static async getSettings(agencyId) {
    const [rows] = await pool.execute(
      `SELECT agency_id, standard_mileage_rate_per_mile, standard_mileage_uses_tier_rates, updated_by_user_id, created_at, updated_at
       FROM agency_mileage_settings
       WHERE agency_id = ?
       LIMIT 1`,
      [agencyId]
    );
    return rows?.[0] || null;
  }

  static async upsertSettings({
    agencyId,
    standardMileageRatePerMile,
    standardMileageUsesTierRates,
    updatedByUserId
  }) {
    await pool.execute(
      `INSERT INTO agency_mileage_settings
       (agency_id, standard_mileage_rate_per_mile, standard_mileage_uses_tier_rates, updated_by_user_id)
       VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         standard_mileage_rate_per_mile = VALUES(standard_mileage_rate_per_mile),
         standard_mileage_uses_tier_rates = VALUES(standard_mileage_uses_tier_rates),
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        standardMileageRatePerMile,
        standardMileageUsesTierRates ? 1 : 0,
        updatedByUserId || null
      ]
    );
  }
}

export default AgencyMileageRate;

