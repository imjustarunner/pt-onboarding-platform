import pool from '../config/database.js';

/**
 * Per-user, per-insurance credentialing status.
 */
class UserInsuranceCredentialing {
  static async listByUserId(userId) {
    const [rows] = await pool.execute(
      `SELECT uic.*, icd.name AS insurance_name, icd.parent_id AS insurance_parent_id
       FROM user_insurance_credentialing uic
       JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
       WHERE uic.user_id = ?
       ORDER BY icd.sort_order ASC, icd.name ASC`,
      [userId]
    );
    return rows || [];
  }

  static async listByInsuranceId(insuranceDefinitionId) {
    const [rows] = await pool.execute(
      `SELECT uic.*, u.first_name, u.last_name, u.role
       FROM user_insurance_credentialing uic
       JOIN users u ON u.id = uic.user_id
       WHERE uic.insurance_credentialing_definition_id = ?
       ORDER BY u.last_name ASC, u.first_name ASC`,
      [insuranceDefinitionId]
    );
    return rows || [];
  }

  static async listByAgencyId(agencyId) {
    const [rows] = await pool.execute(
      `SELECT uic.*, icd.name AS insurance_name, u.first_name, u.last_name, u.role
       FROM user_insurance_credentialing uic
       JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
       JOIN users u ON u.id = uic.user_id
       WHERE icd.agency_id = ?
       ORDER BY icd.sort_order ASC, icd.name ASC, u.last_name ASC, u.first_name ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findByUserAndInsurance(userId, insuranceDefinitionId) {
    const [rows] = await pool.execute(
      `SELECT uic.*, icd.name AS insurance_name
       FROM user_insurance_credentialing uic
       JOIN insurance_credentialing_definitions icd ON icd.id = uic.insurance_credentialing_definition_id
       WHERE uic.user_id = ? AND uic.insurance_credentialing_definition_id = ?
       LIMIT 1`,
      [userId, insuranceDefinitionId]
    );
    return rows?.[0] || null;
  }

  static async upsert({
    userId,
    insuranceCredentialingDefinitionId,
    effectiveDate = null,
    submittedDate = null,
    resubmittedDate = null,
    pinOrReference = null,
    notes = null,
    updatedByUserId = null
  }) {
    const [existing] = await pool.execute(
      'SELECT id FROM user_insurance_credentialing WHERE user_id = ? AND insurance_credentialing_definition_id = ? LIMIT 1',
      [userId, insuranceCredentialingDefinitionId]
    );
    if (existing?.length) {
      await pool.execute(
        `UPDATE user_insurance_credentialing
         SET effective_date = ?, submitted_date = ?, resubmitted_date = ?,
             pin_or_reference = ?, notes = ?, updated_by_user_id = ?
         WHERE user_id = ? AND insurance_credentialing_definition_id = ?`,
        [effectiveDate, submittedDate, resubmittedDate, pinOrReference, notes, updatedByUserId, userId, insuranceCredentialingDefinitionId]
      );
      return await this.findByUserAndInsurance(userId, insuranceCredentialingDefinitionId);
    }
    const [result] = await pool.execute(
      `INSERT INTO user_insurance_credentialing
       (user_id, insurance_credentialing_definition_id, effective_date, submitted_date, resubmitted_date,
        pin_or_reference, notes, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, insuranceCredentialingDefinitionId, effectiveDate, submittedDate, resubmittedDate, pinOrReference, notes, updatedByUserId]
    );
    return result?.insertId ? await this.findByUserAndInsurance(userId, insuranceCredentialingDefinitionId) : null;
  }

  static async updateCredentials(id, { usernameEnc, passwordEnc }, updatedByUserId) {
    const updates = [];
    const values = [];
    if (usernameEnc) {
      updates.push('user_level_username_ciphertext = ?', 'user_level_username_iv = ?', 'user_level_username_auth_tag = ?', 'user_level_username_key_id = ?');
      values.push(usernameEnc.ciphertextB64, usernameEnc.ivB64, usernameEnc.authTagB64, usernameEnc.keyId);
    }
    if (passwordEnc) {
      updates.push('user_level_password_ciphertext = ?', 'user_level_password_iv = ?', 'user_level_password_auth_tag = ?', 'user_level_password_key_id = ?');
      values.push(passwordEnc.ciphertextB64, passwordEnc.ivB64, passwordEnc.authTagB64, passwordEnc.keyId);
    }
    if (!updates.length) {
      const [rows] = await pool.execute('SELECT * FROM user_insurance_credentialing WHERE id = ?', [id]);
      return rows?.[0] || null;
    }
    updates.push('updated_by_user_id = ?');
    values.push(updatedByUserId, id);
    await pool.execute(
      `UPDATE user_insurance_credentialing SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    const [rows] = await pool.execute('SELECT * FROM user_insurance_credentialing WHERE id = ?', [id]);
    return rows?.[0] || null;
  }

  static async delete(userId, insuranceCredentialingDefinitionId) {
    const [result] = await pool.execute(
      'DELETE FROM user_insurance_credentialing WHERE user_id = ? AND insurance_credentialing_definition_id = ?',
      [userId, insuranceCredentialingDefinitionId]
    );
    return result?.affectedRows > 0;
  }
}

export default UserInsuranceCredentialing;
