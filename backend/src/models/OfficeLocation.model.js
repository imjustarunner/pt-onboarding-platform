import pool from '../config/database.js';
import crypto from 'crypto';

class OfficeLocation {
  static async findByAgency(agencyId, { includeInactive = false } = {}) {
    const where = includeInactive ? 'agency_id = ?' : 'agency_id = ? AND is_active = TRUE';
    const [rows] = await pool.execute(
      `SELECT * FROM office_locations WHERE ${where} ORDER BY name ASC`,
      [agencyId]
    );
    return rows;
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
    return this.findById(result.insertId);
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

