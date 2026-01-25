import pool from '../config/database.js';
import crypto from 'crypto';
import OfficeLocationAgency from './OfficeLocationAgency.model.js';

class OfficeLocation {
  static async listAll({ includeInactive = false } = {}) {
    const where = includeInactive ? '1=1' : 'is_active = TRUE';
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
  static async findByAgencyMembership(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? '1=1' : 'ol.is_active = TRUE';
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
    const key = accessKey || crypto.randomBytes(16).toString('hex'); // 32 chars
    const [result] = await pool.execute(
      `INSERT INTO office_locations (agency_id, name, timezone, access_key, svg_markup)
       VALUES (?, ?, ?, ?, ?)`,
      [agencyId, name, timezone, key, svgMarkup]
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
    const allowed = ['name', 'timezone', 'svg_markup', 'is_active', 'street_address', 'city', 'state', 'postal_code'];
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

