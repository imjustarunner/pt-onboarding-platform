import pool from '../config/database.js';

class OfficeBookingRequest {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_booking_requests WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async create({
    requestType = 'PROVIDER_REQUEST',
    officeLocationId,
    roomId = null,
    requestedProviderId,
    startAt,
    endAt,
    recurrence = 'ONCE',
    openToAlternativeRoom = false,
    requesterNotes = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO office_booking_requests
        (request_type, status, office_location_id, room_id, requested_provider_id, start_at, end_at, recurrence, open_to_alternative_room, requester_notes)
       VALUES (?, 'PENDING', ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        requestType,
        officeLocationId,
        roomId,
        requestedProviderId,
        startAt,
        endAt,
        recurrence,
        openToAlternativeRoom ? 1 : 0,
        requesterNotes
      ]
    );
    return this.findById(result.insertId);
  }

  static async listPendingForAgencies(agencyIds, { officeLocationId = null } = {}) {
    const ids = (agencyIds || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => Number.isInteger(n) && n > 0);
    if (ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const params = [...ids];
    let where = `ola.agency_id IN (${placeholders}) AND r.status = 'PENDING'`;
    if (officeLocationId) {
      where += ' AND r.office_location_id = ?';
      params.push(parseInt(officeLocationId, 10));
    }

    const [rows] = await pool.execute(
      `SELECT DISTINCT
         r.*,
         ol.name AS office_location_name,
         rm.name AS room_name,
         rm.room_number AS room_number,
         rm.label AS room_label,
         u.first_name AS requester_first_name,
         u.last_name AS requester_last_name,
         u.email AS requester_email
       FROM office_booking_requests r
       JOIN office_locations ol ON r.office_location_id = ol.id
       JOIN office_location_agencies ola ON ola.office_location_id = ol.id
       LEFT JOIN office_rooms rm ON r.room_id = rm.id
       JOIN users u ON u.id = r.requested_provider_id
       WHERE ${where}
       ORDER BY r.created_at ASC`,
      params
    );
    return rows || [];
  }

  static async markDecided({ requestId, status, decidedByUserId, approverComment = null }) {
    await pool.execute(
      `UPDATE office_booking_requests
       SET status = ?,
           decided_by_user_id = ?,
           approver_comment = ?,
           decided_at = NOW(),
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [status, decidedByUserId, approverComment, requestId]
    );
    return this.findById(requestId);
  }
}

export default OfficeBookingRequest;

