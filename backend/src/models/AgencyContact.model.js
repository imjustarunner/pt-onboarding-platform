import pool from '../config/database.js';

function normalizePhone(phone) {
  if (!phone) return null;
  const str = String(phone).trim();
  if (str.startsWith('+')) return '+' + str.slice(1).replace(/[^\d]/g, '');
  const digits = str.replace(/[^\d]/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return digits ? `+${digits}` : null;
}

class AgencyContact {
  static normalizePhone = normalizePhone;

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM agency_contacts WHERE id = ? LIMIT 1', [id]);
    return rows[0] || null;
  }

  static async findByPhone(phone, agencyId = null) {
    const norm = normalizePhone(phone);
    if (!norm) return null;
    let sql = 'SELECT * FROM agency_contacts WHERE phone = ? AND is_active = TRUE LIMIT 1';
    const params = [norm];
    if (agencyId) {
      sql = 'SELECT * FROM agency_contacts WHERE phone = ? AND agency_id = ? AND is_active = TRUE LIMIT 1';
      params.push(agencyId);
    }
    const [rows] = await pool.execute(sql, params);
    return rows[0] || null;
  }

  static async findByEmail(email, agencyId) {
    if (!email || !agencyId) return null;
    const [rows] = await pool.execute(
      'SELECT * FROM agency_contacts WHERE email = ? AND agency_id = ? AND is_active = TRUE LIMIT 1',
      [String(email).trim().toLowerCase(), agencyId]
    );
    return rows[0] || null;
  }

  static async create(data) {
    const {
      agencyId,
      createdByUserId,
      shareWithAll = false,
      clientId = null,
      fullName,
      email,
      phone,
      source = 'manual',
      sourceRefId = null
    } = data;
    const [result] = await pool.execute(
      `INSERT INTO agency_contacts
       (agency_id, created_by_user_id, share_with_all, client_id, full_name, email, phone, source, source_ref_id, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE)`,
      [
        agencyId,
        createdByUserId,
        shareWithAll ? 1 : 0,
        clientId,
        fullName || null,
        email || null,
        phone ? normalizePhone(phone) || phone : null,
        source,
        sourceRefId
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, patch) {
    const updates = [];
    const params = [];
    const allowed = ['full_name', 'email', 'phone', 'share_with_all', 'client_id', 'is_active'];
    for (const key of allowed) {
      if (patch[key] === undefined) continue;
      if (key === 'phone' && patch[key]) {
        updates.push('phone = ?');
        params.push(normalizePhone(patch[key]) || patch[key]);
      } else if (key === 'share_with_all') {
        updates.push('share_with_all = ?');
        params.push(patch[key] ? 1 : 0);
      } else if (key === 'is_active') {
        updates.push('is_active = ?');
        params.push(patch[key] ? 1 : 0);
      } else {
        updates.push(`${key} = ?`);
        params.push(patch[key]);
      }
    }
    if (!updates.length) return this.findById(id);
    params.push(id);
    await pool.execute(
      `UPDATE agency_contacts SET ${updates.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      params
    );
    return this.findById(id);
  }

  static async addSchoolAssignment(contactId, schoolOrganizationId) {
    await pool.execute(
      `INSERT IGNORE INTO contact_school_assignments (contact_id, school_organization_id) VALUES (?, ?)`,
      [contactId, schoolOrganizationId]
    );
  }

  static async addProviderAssignment(contactId, providerUserId) {
    await pool.execute(
      `INSERT IGNORE INTO contact_provider_assignments (contact_id, provider_user_id) VALUES (?, ?)`,
      [contactId, providerUserId]
    );
  }

  static async listSchoolIds(contactId) {
    const [rows] = await pool.execute(
      'SELECT school_organization_id FROM contact_school_assignments WHERE contact_id = ?',
      [contactId]
    );
    return rows.map((r) => r.school_organization_id);
  }

  static async listProviderIds(contactId) {
    const [rows] = await pool.execute(
      'SELECT provider_user_id FROM contact_provider_assignments WHERE contact_id = ?',
      [contactId]
    );
    return rows.map((r) => r.provider_user_id);
  }

  static async removeSchoolAssignment(contactId, schoolOrganizationId) {
    await pool.execute(
      'DELETE FROM contact_school_assignments WHERE contact_id = ? AND school_organization_id = ?',
      [contactId, schoolOrganizationId]
    );
  }

  static async removeProviderAssignment(contactId, providerUserId) {
    await pool.execute(
      'DELETE FROM contact_provider_assignments WHERE contact_id = ? AND provider_user_id = ?',
      [contactId, providerUserId]
    );
  }
}

export default AgencyContact;
