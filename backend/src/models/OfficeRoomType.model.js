import pool from '../config/database.js';

class OfficeRoomType {
  static async listByOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT * FROM office_room_types
       WHERE office_location_id = ? AND is_active = TRUE
       ORDER BY sort_order ASC, name ASC`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_room_types WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async create({ officeLocationId, name, sortOrder = 0 }) {
    const [result] = await pool.execute(
      `INSERT INTO office_room_types (office_location_id, name, sort_order)
       VALUES (?, ?, ?)`,
      [officeLocationId, name, sortOrder]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const allowed = ['name', 'sort_order', 'is_active'];
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
    await pool.execute(`UPDATE office_room_types SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeRoomType;

