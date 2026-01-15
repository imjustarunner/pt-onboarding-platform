import pool from '../config/database.js';

class OfficeRoom {
  static async findByLocation(locationId) {
    const [rows] = await pool.execute(
      `SELECT * FROM office_rooms
       WHERE location_id = ? AND is_active = TRUE
       ORDER BY sort_order ASC, name ASC`,
      [locationId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_rooms WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create({ locationId, name, svgRoomId = null, sortOrder = 0 }) {
    const [result] = await pool.execute(
      `INSERT INTO office_rooms (location_id, name, svg_room_id, sort_order)
       VALUES (?, ?, ?, ?)`,
      [locationId, name, svgRoomId, sortOrder]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const allowed = ['name', 'svg_room_id', 'sort_order', 'is_active'];
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
    await pool.execute(`UPDATE office_rooms SET ${fields.join(', ')} WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeRoom;

