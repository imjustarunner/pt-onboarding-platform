import pool from '../config/database.js';

/**
 * Tenant / agency Type-2 group NPIs (one agency can have many, often one per location).
 */
class AgencyGroupNpi {
  static async listByAgencyId(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'agn.agency_id = ?' : 'agn.agency_id = ? AND agn.is_active = 1';
    const [rows] = await pool.execute(
      `SELECT agn.*,
              ol.name AS office_location_name,
              ol.street_address AS office_street_address,
              ol.city AS office_city,
              ol.state AS office_state,
              ol.postal_code AS office_postal_code,
              (
                SELECT COUNT(*)
                FROM agency_group_npi_payer_credentialing pc
                WHERE pc.agency_group_npi_id = agn.id
              ) AS payer_credential_count
       FROM agency_group_npis agn
       LEFT JOIN office_locations ol ON ol.id = agn.office_location_id
       WHERE ${where}
       ORDER BY COALESCE(agn.label, ''), agn.npi_number ASC, agn.id ASC`,
      [agencyId]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT agn.*,
              ol.name AS office_location_name
       FROM agency_group_npis agn
       LEFT JOIN office_locations ol ON ol.id = agn.office_location_id
       WHERE agn.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async create({
    agencyId,
    npiNumber,
    label = null,
    taxonomyCode = null,
    medicaidProviderType = null,
    officeLocationId = null,
    notes = null,
    isActive = true,
    updatedByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO agency_group_npis
       (agency_id, npi_number, label, taxonomy_code, medicaid_provider_type,
        office_location_id, notes, is_active, updated_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        String(npiNumber || '').trim(),
        label ? String(label).trim() : null,
        taxonomyCode ? String(taxonomyCode).trim() : null,
        medicaidProviderType ? String(medicaidProviderType).trim() : null,
        officeLocationId || null,
        notes ? String(notes).trim() : null,
        isActive ? 1 : 0,
        updatedByUserId
      ]
    );
    return result?.insertId ? this.findById(result.insertId) : null;
  }

  static async update(id, patch = {}) {
    const updates = [];
    const values = [];
    const map = {
      npiNumber: 'npi_number',
      label: 'label',
      taxonomyCode: 'taxonomy_code',
      medicaidProviderType: 'medicaid_provider_type',
      officeLocationId: 'office_location_id',
      notes: 'notes',
      isActive: 'is_active',
      updatedByUserId: 'updated_by_user_id'
    };
    for (const [key, col] of Object.entries(map)) {
      if (patch[key] === undefined) continue;
      if (key === 'isActive') {
        updates.push(`${col} = ?`);
        values.push(patch[key] ? 1 : 0);
      } else if (key === 'officeLocationId' || key === 'updatedByUserId') {
        updates.push(`${col} = ?`);
        values.push(patch[key] || null);
      } else {
        updates.push(`${col} = ?`);
        const v = patch[key];
        values.push(v == null || v === '' ? null : String(v).trim());
      }
    }
    if (!updates.length) return this.findById(id);
    values.push(id);
    await pool.execute(`UPDATE agency_group_npis SET ${updates.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }

  static async softDelete(id, updatedByUserId = null) {
    await pool.execute(
      'UPDATE agency_group_npis SET is_active = 0, updated_by_user_id = ? WHERE id = ?',
      [updatedByUserId, id]
    );
    return this.findById(id);
  }

  static async hardDelete(id) {
    const [result] = await pool.execute('DELETE FROM agency_group_npis WHERE id = ?', [id]);
    return result?.affectedRows > 0;
  }
}

export default AgencyGroupNpi;
