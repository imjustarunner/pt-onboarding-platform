import pool from '../config/database.js';

class OfficeRoomRequest {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_room_requests WHERE id = ?', [id]);
    return rows[0] || null;
  }

  static async create({ userId, locationId, roomId, requestType = 'ONE_TIME', startAt, endAt, notes = null }) {
    const [result] = await pool.execute(
      `INSERT INTO office_room_requests
       (user_id, location_id, room_id, request_type, status, start_at, end_at, notes)
       VALUES (?, ?, ?, ?, 'PENDING', ?, ?, ?)`,
      [userId, locationId, roomId, requestType, startAt, endAt, notes]
    );
    return this.findById(result.insertId);
  }

  static async listPendingForAgency(agencyId, { locationId = null } = {}) {
    const params = [agencyId];
    // Multi-agency: pending visibility is based on office_location_agencies membership.
    let where = "ola.agency_id = ? AND r.status = 'PENDING'";

    if (locationId) {
      where += ' AND r.location_id = ?';
      params.push(locationId);
    }

    const [rows] = await pool.execute(
      `SELECT
         r.*,
         ol.name AS location_name,
         rm.name AS room_name,
         u.first_name AS user_first_name,
         u.last_name AS user_last_name,
         u.email AS user_email
       FROM office_room_requests r
       JOIN office_locations ol ON r.location_id = ol.id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       JOIN office_rooms rm ON r.room_id = rm.id
       JOIN users u ON r.user_id = u.id
       WHERE ${where}
       ORDER BY r.created_at ASC`,
      params
    );
    return rows;
  }

  static async listPendingForLocation(locationId) {
    const [rows] = await pool.execute(
      `SELECT
         r.*,
         ol.name AS location_name,
         rm.name AS room_name,
         u.first_name AS user_first_name,
         u.last_name AS user_last_name,
         u.email AS user_email
       FROM office_room_requests r
       JOIN office_locations ol ON r.location_id = ol.id
       JOIN office_rooms rm ON r.room_id = rm.id
       JOIN users u ON r.user_id = u.id
       WHERE r.location_id = ?
         AND r.status = 'PENDING'
       ORDER BY r.created_at ASC`,
      [locationId]
    );
    return rows;
  }

  static async listPendingForAgencies(agencyIds, { locationId = null } = {}) {
    const ids = (agencyIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const params = [...ids];
    let where = `ola.agency_id IN (${placeholders}) AND r.status = 'PENDING'`;
    if (locationId) {
      where += ' AND r.location_id = ?';
      params.push(parseInt(locationId, 10));
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         r.*,
         ol.name AS location_name,
         rm.name AS room_name,
         u.first_name AS user_first_name,
         u.last_name AS user_last_name,
         u.email AS user_email
       FROM office_room_requests r
       JOIN office_locations ol ON r.location_id = ol.id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       JOIN office_rooms rm ON r.room_id = rm.id
       JOIN users u ON r.user_id = u.id
       WHERE ${where}
       ORDER BY r.created_at ASC`,
      params
    );
    return rows;
  }

  static async markDecided({ requestId, status, decidedByUserId }) {
    await pool.execute(
      `UPDATE office_room_requests
       SET status = ?, decided_by_user_id = ?, decided_at = NOW()
       WHERE id = ?`,
      [status, decidedByUserId, requestId]
    );
    return this.findById(requestId);
  }
}

export default OfficeRoomRequest;

