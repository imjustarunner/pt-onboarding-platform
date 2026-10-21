import pool from '../config/database.js';

class OfficeRoom {
  static async findByLocation(locationId) {
    const [rows] = await pool.execute(
      `SELECT office_rooms.*,(SELECT GROUP_CONCAT(t.name ORDER BY t.sort_order,t.name SEPARATOR ' · ') FROM office_room_type_links k JOIN office_room_types t ON t.id=k.room_type_id AND t.is_active=1 WHERE k.room_id=office_rooms.id) AS room_type
       FROM office_rooms WHERE location_id = ? AND is_active = TRUE
       ORDER BY
         (room_number IS NULL) ASC,
         room_number ASC,
         sort_order ASC,
         COALESCE(NULLIF(TRIM(label), ''), name) ASC`,
      [locationId]
    );
    return rows;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_rooms WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create({ locationId, name, svgRoomId = null, sortOrder = 0, roomNumber = null, label = null, googleResourceEmail = null }) {
    const [result] = await pool.execute(
      `INSERT INTO office_rooms (location_id, room_number, label, name, svg_room_id, google_resource_email, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [locationId, roomNumber, label, name, svgRoomId, googleResourceEmail, sortOrder]
    );
    return this.findById(result.insertId);
  }

  static async update(id, updates = {}) {
    const allowed = ['room_number', 'label', 'name', 'svg_room_id', 'google_resource_email', 'sort_order', 'is_active', 'photo_url'];
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

