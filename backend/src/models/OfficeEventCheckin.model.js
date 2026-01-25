import pool from '../config/database.js';

class OfficeEventCheckin {
  static async findByEventId(eventId) {
    const [rows] = await pool.execute('SELECT * FROM office_event_checkins WHERE event_id = ? LIMIT 1', [eventId]);
    return rows?.[0] || null;
  }

  static async create({ eventId, officeLocationId, roomId, providerId }) {
    // Enforce 1 check-in per event (unique index); return existing if already checked in.
    const existing = await this.findByEventId(eventId);
    if (existing) return existing;

    const [result] = await pool.execute(
      `INSERT INTO office_event_checkins (event_id, office_location_id, room_id, provider_id)
       VALUES (?, ?, ?, ?)`,
      [eventId, officeLocationId, roomId, providerId]
    );
    const [rows] = await pool.execute('SELECT * FROM office_event_checkins WHERE id = ? LIMIT 1', [result.insertId]);
    return rows?.[0] || null;
  }
}

export default OfficeEventCheckin;

