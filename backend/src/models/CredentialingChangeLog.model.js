import pool from '../config/database.js';

/**
 * Credentialing change log for timeline display.
 */
class CredentialingChangeLog {
  static async create({
    userId,
    agencyId,
    fieldChanged,
    oldValue = null,
    newValue = null,
    changedByUserId = null,
    insuranceCredentialingDefinitionId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO credentialing_change_log
       (user_id, agency_id, field_changed, old_value, new_value, changed_by_user_id, insurance_credentialing_definition_id)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [userId, agencyId, fieldChanged, oldValue, newValue, changedByUserId, insuranceCredentialingDefinitionId]
    );
    return result?.insertId || null;
  }

  static async listByUserId(userId, limit = 100) {
    const [rows] = await pool.execute(
      `SELECT ccl.*, u.first_name AS changed_by_first_name, u.last_name AS changed_by_last_name,
              icd.name AS insurance_name
       FROM credentialing_change_log ccl
       LEFT JOIN users u ON u.id = ccl.changed_by_user_id
       LEFT JOIN insurance_credentialing_definitions icd ON icd.id = ccl.insurance_credentialing_definition_id
       WHERE ccl.user_id = ?
       ORDER BY ccl.changed_at DESC
       LIMIT ?`,
      [userId, limit]
    );
    return rows || [];
  }

  static async listByAgencyId(agencyId, limit = 200) {
    const [rows] = await pool.execute(
      `SELECT ccl.*, u.first_name AS changed_by_first_name, u.last_name AS changed_by_last_name,
              target.first_name AS target_first_name, target.last_name AS target_last_name,
              icd.name AS insurance_name
       FROM credentialing_change_log ccl
       LEFT JOIN users u ON u.id = ccl.changed_by_user_id
       LEFT JOIN users target ON target.id = ccl.user_id
       LEFT JOIN insurance_credentialing_definitions icd ON icd.id = ccl.insurance_credentialing_definition_id
       WHERE ccl.agency_id = ?
       ORDER BY ccl.changed_at DESC
       LIMIT ?`,
      [agencyId, limit]
    );
    return rows || [];
  }
}

export default CredentialingChangeLog;
