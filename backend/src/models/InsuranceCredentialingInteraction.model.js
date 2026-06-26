import pool from '../config/database.js';

class InsuranceCredentialingInteraction {
  static async list({ agencyId, insuranceDefinitionId, userId = undefined, scope = 'all' }) {
    const clauses = [
      'ici.agency_id = ?',
      'ici.insurance_credentialing_definition_id = ?'
    ];
    const params = [agencyId, insuranceDefinitionId];

    if (scope === 'employee' && userId != null) {
      clauses.push('ici.user_id = ?');
      params.push(userId);
    } else if (scope === 'agency') {
      clauses.push('ici.user_id IS NULL');
    } else if (userId != null) {
      clauses.push('(ici.user_id = ? OR ici.user_id IS NULL)');
      params.push(userId);
    }

    const [rows] = await pool.execute(
      `SELECT ici.*,
              caller.first_name AS caller_first_name,
              caller.last_name AS caller_last_name,
              provider.first_name AS provider_first_name,
              provider.last_name AS provider_last_name,
              icc.label AS contact_label,
              icc.contact_name AS contact_directory_name
       FROM insurance_credentialing_interactions ici
       LEFT JOIN users caller ON caller.id = ici.caller_user_id
       LEFT JOIN users provider ON provider.id = ici.user_id
       LEFT JOIN insurance_credentialing_contacts icc ON icc.id = ici.contact_id
       WHERE ${clauses.join(' AND ')}
       ORDER BY ici.interaction_at DESC, ici.id DESC
       LIMIT 500`,
      params
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT ici.*,
              caller.first_name AS caller_first_name,
              caller.last_name AS caller_last_name,
              provider.first_name AS provider_first_name,
              provider.last_name AS provider_last_name
       FROM insurance_credentialing_interactions ici
       LEFT JOIN users caller ON caller.id = ici.caller_user_id
       LEFT JOIN users provider ON provider.id = ici.user_id
       WHERE ici.id = ? LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async create({
    agencyId,
    insuranceDefinitionId,
    userId = null,
    contactId = null,
    interactionAt,
    callerUserId,
    phoneNumberCalled = null,
    contactPersonName = null,
    outcome = null,
    referenceId = null,
    notes = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO insurance_credentialing_interactions
       (agency_id, insurance_credentialing_definition_id, user_id, contact_id,
        interaction_at, caller_user_id, phone_number_called, contact_person_name,
        outcome, reference_id, notes, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        insuranceDefinitionId,
        userId,
        contactId,
        interactionAt,
        callerUserId,
        phoneNumberCalled,
        contactPersonName,
        outcome,
        referenceId,
        notes,
        createdByUserId
      ]
    );
    return result?.insertId ? await this.findById(result.insertId) : null;
  }

  static async update(id, updates) {
    const allowed = [
      'user_id', 'contact_id', 'interaction_at', 'caller_user_id',
      'phone_number_called', 'contact_person_name', 'outcome', 'reference_id', 'notes'
    ];
    const setClauses = [];
    const values = [];
    for (const [k, v] of Object.entries(updates)) {
      const col = k.replace(/([A-Z])/g, '_$1').toLowerCase().replace(/^_/, '');
      if (allowed.includes(col)) {
        setClauses.push(`${col} = ?`);
        values.push(v);
      }
    }
    if (!setClauses.length) return await this.findById(id);
    values.push(id);
    await pool.execute(
      `UPDATE insurance_credentialing_interactions SET ${setClauses.join(', ')} WHERE id = ?`,
      values
    );
    return await this.findById(id);
  }

  static async delete(id) {
    const [result] = await pool.execute(
      'DELETE FROM insurance_credentialing_interactions WHERE id = ?',
      [id]
    );
    return result?.affectedRows > 0;
  }
}

export default InsuranceCredentialingInteraction;
