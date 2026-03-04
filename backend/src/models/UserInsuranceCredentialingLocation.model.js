import pool from '../config/database.js';

/**
 * Locations and effective dates per user-insurance credentialing.
 */
class UserInsuranceCredentialingLocation {
  static async listByUserInsuranceCredentialingId(userInsuranceCredentialingId) {
    const [rows] = await pool.execute(
      'SELECT * FROM user_insurance_credentialing_locations WHERE user_insurance_credentialing_id = ? ORDER BY effective_date DESC',
      [userInsuranceCredentialingId]
    );
    return rows || [];
  }

  static async create({ userInsuranceCredentialingId, locationName, effectiveDate = null }) {
    const [result] = await pool.execute(
      `INSERT INTO user_insurance_credentialing_locations
       (user_insurance_credentialing_id, location_name, effective_date)
       VALUES (?, ?, ?)`,
      [userInsuranceCredentialingId, locationName, effectiveDate]
    );
    return result?.insertId || null;
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM user_insurance_credentialing_locations WHERE id = ?',
      [id]
    );
    return result?.affectedRows > 0;
  }
}

export default UserInsuranceCredentialingLocation;
