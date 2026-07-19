import pool from '../config/database.js';

class AgencyServiceLocation {
  static async listByAgency(agencyId, { includeInactive = false } = {}) {
    const [rows] = await pool.execute(
      `SELECT l.*,
              o.name AS billing_office_name,
              o.street_address AS billing_office_street,
              o.city AS billing_office_city,
              o.state AS billing_office_state,
              o.postal_code AS billing_office_postal
       FROM agency_service_locations l
       LEFT JOIN office_locations o ON o.id = l.billing_office_location_id
       WHERE l.agency_id = ?
         AND (? = 1 OR l.is_active = 1)
       ORDER BY l.name ASC`,
      [agencyId, includeInactive ? 1 : 0]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute(
      `SELECT l.*,
              o.name AS billing_office_name,
              o.street_address AS billing_office_street,
              o.city AS billing_office_city,
              o.state AS billing_office_state,
              o.postal_code AS billing_office_postal
       FROM agency_service_locations l
       LEFT JOIN office_locations o ON o.id = l.billing_office_location_id
       WHERE l.id = ?
       LIMIT 1`,
      [id]
    );
    return rows?.[0] || null;
  }

  static async create(payload) {
    const {
      agencyId,
      name,
      placeOfService,
      streetAddress = null,
      city = null,
      state = null,
      postalCode = null,
      notes = null,
      requiresCredentialing = false,
      billingOfficeLocationId = null,
      createdByUserId = null
    } = payload;
    const [result] = await pool.execute(
      `INSERT INTO agency_service_locations
         (agency_id, name, place_of_service, street_address, city, state, postal_code, notes,
          requires_credentialing, billing_office_location_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        String(name || '').trim(),
        String(placeOfService || '').trim().slice(0, 2),
        streetAddress,
        city,
        state,
        postalCode,
        notes,
        requiresCredentialing ? 1 : 0,
        billingOfficeLocationId,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const map = {
      name: 'name',
      placeOfService: 'place_of_service',
      streetAddress: 'street_address',
      city: 'city',
      state: 'state',
      postalCode: 'postal_code',
      notes: 'notes',
      requiresCredentialing: 'requires_credentialing',
      billingOfficeLocationId: 'billing_office_location_id',
      isActive: 'is_active'
    };
    const fields = [];
    const vals = [];
    for (const [k, col] of Object.entries(map)) {
      if (updates[k] === undefined) continue;
      fields.push(`${col} = ?`);
      if (k === 'requiresCredentialing' || k === 'isActive') vals.push(updates[k] ? 1 : 0);
      else if (k === 'placeOfService') vals.push(String(updates[k] || '').slice(0, 2));
      else vals.push(updates[k]);
    }
    if (!fields.length) return this.findById(id);
    vals.push(id);
    await pool.execute(
      `UPDATE agency_service_locations SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      vals
    );
    return this.findById(id);
  }
}

export default AgencyServiceLocation;
