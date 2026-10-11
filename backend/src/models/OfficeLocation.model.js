import pool from '../config/database.js';
import crypto from 'crypto';
import OfficeLocationAgency from './OfficeLocationAgency.model.js';

class OfficeLocation {
  static async listAll({ includeInactive = false, physicalOnly = false } = {}) {
    const where = (includeInactive ? '1=1' : 'is_active = TRUE') + (physicalOnly ? ' AND physical_office_location_id IS NULL' : '');
    const [rows] = await pool.execute(
      `SELECT * FROM office_locations WHERE ${where} ORDER BY name ASC`
    );
    return rows;
  }

  static async findByAgency(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'agency_id = ?' : 'agency_id = ? AND is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT * FROM office_locations WHERE ${where} ORDER BY name ASC`,
      [agencyId]
    );
    return rows;
  }

  // Multi-agency: list offices assigned to an agency via join table
  static async findByAgencyMembership(agencyId, { includeInactive = false, physicalOnly = false } = {}) {
    const where = (includeInactive ? '1=1' : 'ol.is_active = TRUE') + (physicalOnly ? ' AND ol.physical_office_location_id IS NULL' : '');
    const [rows] = await pool.execute(
      `SELECT ol.*
       FROM office_locations ol
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       WHERE ola.agency_id = ?
         AND ${where}
       ORDER BY ol.name ASC`,
      [agencyId]
    );
    return rows;
  }

  // Prefer the agency's own billing identity at each shared physical building.
  // Scheduling membership alone must not select another agency's NPI by name order.
  static async findBillingByAgency(agencyId) {
    const rows = await this.findByAgencyMembership(agencyId);
    const owned = await this.findByAgency(agencyId);
    const byBuilding = new Map();
    for (const row of [...rows, ...owned]) {
      const id = Number(row.physical_office_location_id || row.id);
      const existing = byBuilding.get(id);
      if (!existing || Number(row.agency_id) === Number(agencyId)) byBuilding.set(id, row);
    }
    return [...byBuilding.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  static async userHasAccess({ officeLocationId, userId }) {
    if (!officeLocationId || !userId) return false;
    const agencies = await (await import('./User.model.js')).default.getAgencies(userId);
    const ids = (agencies || []).map((a) => a.id);
    return await OfficeLocationAgency.userHasAccess({ officeLocationId, agencyIds: ids });
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_locations WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async findByAccessKey(accessKey) {
    const [rows] = await pool.execute('SELECT * FROM office_locations WHERE access_key = ? AND is_active = TRUE', [accessKey]);
    return rows[0] || null;
  }

  static async create({ agencyId, name, timezone = 'America/New_York', svgMarkup = null, accessKey = null }) {
    const normalizedName = String(name || '').trim().replace(/\s+/g, ' ');
    if (!normalizedName) throw Object.assign(new Error('Building name is required.'), { status: 400 });
    const [existing] = await pool.execute(`SELECT ol.id, ol.physical_office_location_id FROM office_locations ol
      WHERE ol.is_active = TRUE AND LOWER(TRIM(ol.name)) = LOWER(?)
      AND (ol.agency_id = ? OR EXISTS (SELECT 1 FROM office_location_agencies a WHERE a.office_location_id = ol.id AND a.agency_id = ?))
      ORDER BY ol.physical_office_location_id IS NULL DESC, ol.id LIMIT 1`, [normalizedName, agencyId, agencyId]);
    if (existing.length) throw Object.assign(new Error('This building already exists for this agency. Select it in Building Settings; use Agency Access to share it with another agency.'), { status: 409, statusCode: 409 });
    const key = accessKey || crypto.randomBytes(16).toString('hex'); // 32 chars
    const [result] = await pool.execute(
      `INSERT INTO office_locations (agency_id, name, timezone, access_key, svg_markup)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, normalizedName, timezone, key, svgMarkup]
    );
    const loc = await this.findById(result.insertId);
    // Seed join table for multi-agency access (creating agency auto-assigned).
    try {
      if (loc?.id && agencyId) {
        await OfficeLocationAgency.add({ officeLocationId: loc.id, agencyId });
      }
    } catch {
      // best-effort (older DBs may not have the join table yet)
    }
    return loc;
  }

  static async update(id, updates = {}) {
    const allowed = [
      'name',
      'timezone',
      'svg_markup',
      'svg_url',
      'is_active',
      'street_address',
      'city',
      'state',
      'postal_code',
      'default_place_of_service',
      'use_as_billing_address',
      'practice_name',
      'phone',
      'fax',
      'practice_npi',
      'taxonomy_code',
      'default_modifiers',
      'services_provided_at_address',
      'telehealth_default'
    ];
    const fields = [];
    const values = [];

    for (const k of allowed) {
      if (k in updates) {
        fields.push(`${k} = ?`);
        values.push(updates[k]);
      }
    }
    if (fields.length === 0) return this.findById(id);

    values.push(id);
    await pool.execute(`UPDATE office_locations SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeLocation;
