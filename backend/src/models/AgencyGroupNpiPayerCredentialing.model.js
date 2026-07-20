import pool from '../config/database.js';

/**
 * Per agency-group-NPI × payer credentialing (mirrors user_insurance_credentialing).
 */
class AgencyGroupNpiPayerCredentialing {
  static async listByGroupNpiId(groupNpiId) {
    const [rows] = await pool.execute(
      `SELECT pc.*, icd.name AS insurance_name, icd.logo_path AS insurance_logo_path,
              icd.agency_id AS insurance_agency_id
       FROM agency_group_npi_payer_credentialing pc
       JOIN insurance_credentialing_definitions icd
         ON icd.id = pc.insurance_credentialing_definition_id
       WHERE pc.agency_group_npi_id = ?
       ORDER BY icd.sort_order ASC, icd.name ASC`,
      [groupNpiId]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT pc.*, icd.name AS insurance_name, icd.logo_path AS insurance_logo_path,
              icd.agency_id AS insurance_agency_id, agn.agency_id AS group_npi_agency_id
       FROM agency_group_npi_payer_credentialing pc
       JOIN insurance_credentialing_definitions icd
         ON icd.id = pc.insurance_credentialing_definition_id
       JOIN agency_group_npis agn ON agn.id = pc.agency_group_npi_id
       WHERE pc.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async findByGroupNpiAndInsurance(groupNpiId, insuranceDefinitionId) {
    const [rows] = await pool.execute(
      `SELECT pc.*, icd.name AS insurance_name, icd.logo_path AS insurance_logo_path
       FROM agency_group_npi_payer_credentialing pc
       JOIN insurance_credentialing_definitions icd
         ON icd.id = pc.insurance_credentialing_definition_id
       WHERE pc.agency_group_npi_id = ? AND pc.insurance_credentialing_definition_id = ?
       LIMIT 1`,
      [groupNpiId, insuranceDefinitionId]
    );
    return rows?.[0] || null;
  }

  static async upsert({
    agencyGroupNpiId,
    insuranceCredentialingDefinitionId,
    effectiveDate = null,
    submittedDate = null,
    resubmittedDate = null,
    returnedDate = null,
    pinOrReference = null,
    notes = null,
    updatedByUserId = null
  }) {
    const existing = await this.findByGroupNpiAndInsurance(
      agencyGroupNpiId,
      insuranceCredentialingDefinitionId
    );
    if (existing?.id) {
      await pool.execute(
        `UPDATE agency_group_npi_payer_credentialing
         SET effective_date = ?, submitted_date = ?, resubmitted_date = ?, returned_date = ?,
             pin_or_reference = ?, notes = ?, updated_by_user_id = ?
         WHERE id = ?`,
        [
          effectiveDate,
          submittedDate,
          resubmittedDate,
          returnedDate,
          pinOrReference,
          notes,
          updatedByUserId,
          existing.id
        ]
      );
      return this.findById(existing.id);
    }
    const [result] = await pool.execute(
      `INSERT INTO agency_group_npi_payer_credentialing
       (agency_group_npi_id, insurance_credentialing_definition_id, effective_date, submitted_date,
        resubmitted_date, returned_date, pin_or_reference, notes, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyGroupNpiId,
        insuranceCredentialingDefinitionId,
        effectiveDate,
        submittedDate,
        resubmittedDate,
        returnedDate,
        pinOrReference,
        notes,
        updatedByUserId
      ]
    );
    return result?.insertId ? this.findById(result.insertId) : null;
  }

  static async update(id, patch = {}) {
    const updates = [];
    const values = [];
    const map = {
      effectiveDate: 'effective_date',
      submittedDate: 'submitted_date',
      resubmittedDate: 'resubmitted_date',
      returnedDate: 'returned_date',
      pinOrReference: 'pin_or_reference',
      notes: 'notes',
      welcomeLetterPath: 'welcome_letter_path',
      contractPath: 'contract_path',
      updatedByUserId: 'updated_by_user_id'
    };
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] === undefined) continue;
      updates.push(`${col} = ?`);
      if (key === 'updatedByUserId') values.push(patch[key] || null);
      else if (patch[key] == null || patch[key] === '') values.push(null);
      else values.push(typeof patch[key] === 'string' ? patch[key].trim() : patch[key]);
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE agency_group_npi_payer_credentialing SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async updateCredentials(id, { usernameEnc, passwordEnc }, updatedByUserId) {
    const updates = [];
    const values = [];
    if (usernameEnc) {
      updates.push(
        'group_level_username_ciphertext = ?',
        'group_level_username_iv = ?',
        'group_level_username_auth_tag = ?',
        'group_level_username_key_id = ?'
      );
      values.push(usernameEnc.ciphertextB64, usernameEnc.ivB64, usernameEnc.authTagB64, usernameEnc.keyId);
    }
    if (passwordEnc) {
      updates.push(
        'group_level_password_ciphertext = ?',
        'group_level_password_iv = ?',
        'group_level_password_auth_tag = ?',
        'group_level_password_key_id = ?'
      );
      values.push(passwordEnc.ciphertextB64, passwordEnc.ivB64, passwordEnc.authTagB64, passwordEnc.keyId);
    }
    if (!updates.length) return this.findById(id);
    updates.push('updated_by_user_id = ?');
    values.push(updatedByUserId, id);
    await pool.execute(
      `UPDATE agency_group_npi_payer_credentialing SET ${updates.join(', ')} WHERE id = ?`,
      values
    );
    return this.findById(id);
  }

  static async delete(agencyGroupNpiId, insuranceCredentialingDefinitionId) {
    const [result] = await pool.execute(
      `DELETE FROM agency_group_npi_payer_credentialing
       WHERE agency_group_npi_id = ? AND insurance_credentialing_definition_id = ?`,
      [agencyGroupNpiId, insuranceCredentialingDefinitionId]
    );
    return result?.affectedRows > 0;
  }
}

export default AgencyGroupNpiPayerCredentialing;
