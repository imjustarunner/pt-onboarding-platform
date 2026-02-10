import pool from '../config/database.js';

class OfficeEvent {
  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_events WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async create({
    officeLocationId,
    roomId,
    startAt,
    endAt,
    status,
    assignedProviderId = null,
    bookedProviderId = null,
    source,
    recurrenceGroupId = null,
    notes = null,
    createdByUserId,
    approvedByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO office_events
       (office_location_id, room_id, start_at, end_at, status, assigned_provider_id, booked_provider_id, source, recurrence_group_id, notes, created_by_user_id, approved_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        officeLocationId,
        roomId,
        startAt,
        endAt,
        status,
        assignedProviderId,
        bookedProviderId,
        source,
        recurrenceGroupId,
        notes,
        createdByUserId,
        approvedByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async listForOfficeWindow({ officeLocationId, startAt, endAt }) {
    const [rows] = await pool.execute(
      `SELECT
         e.*,
         r.name AS room_name,
         r.room_number AS room_number,
         r.label AS room_label,
         bu.first_name AS booked_provider_first_name,
         bu.last_name AS booked_provider_last_name,
         au.first_name AS assigned_provider_first_name,
         au.last_name AS assigned_provider_last_name
       FROM office_events e
       JOIN office_rooms r ON e.room_id = r.id
       LEFT JOIN users bu ON e.booked_provider_id = bu.id
       LEFT JOIN users au ON e.assigned_provider_id = au.id
       WHERE e.office_location_id = ?
         AND e.start_at < ?
         AND e.end_at > ?
         AND (e.status IS NULL OR UPPER(e.status) <> 'CANCELLED')`,
      [officeLocationId, endAt, startAt]
    );
    return rows || [];
  }

  static async findByRoomAndStart(roomId, startAt) {
    const [rows] = await pool.execute(
      `SELECT * FROM office_events WHERE room_id = ? AND start_at = ? LIMIT 1`,
      [roomId, startAt]
    );
    return rows?.[0] || null;
  }

  static async upsertSlotState({
    officeLocationId,
    roomId,
    startAt,
    endAt,
    slotState,
    standingAssignmentId = null,
    bookingPlanId = null,
    assignedProviderId = null,
    bookedProviderId = null,
    createdByUserId
  }) {
    // Keep legacy `status` aligned for older code paths.
    const legacyStatus = slotState === 'ASSIGNED_BOOKED' ? 'BOOKED' : 'RELEASED';

    const existing = await this.findByRoomAndStart(roomId, startAt);
    if (existing?.id) {
      await pool.execute(
        `UPDATE office_events
         SET office_location_id = ?,
             room_id = ?,
             start_at = ?,
             end_at = ?,
             status = ?,
             slot_state = ?,
             standing_assignment_id = ?,
             booking_plan_id = ?,
             assigned_provider_id = ?,
             booked_provider_id = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          officeLocationId,
          roomId,
          startAt,
          endAt,
          legacyStatus,
          slotState,
          standingAssignmentId,
          bookingPlanId,
          assignedProviderId,
          bookedProviderId,
          existing.id
        ]
      );
      return await this.findById(existing.id);
    }

    // Minimal create (source will be refined once workflows are wired)
    return await this.create({
      officeLocationId,
      roomId,
      startAt,
      endAt,
      status: legacyStatus,
      assignedProviderId,
      bookedProviderId,
      source: 'ADMIN_OVERRIDE',
      recurrenceGroupId: null,
      notes: null,
      createdByUserId,
      approvedByUserId: null
    });
  }

  static async markBooked({ eventId, bookedProviderId }) {
    await pool.execute(
      `UPDATE office_events
       SET status = 'BOOKED',
           slot_state = 'ASSIGNED_BOOKED',
           booked_provider_id = ?,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [bookedProviderId, eventId]
    );
    return await this.findById(eventId);
  }

  static async markAvailable({ eventId }) {
    await pool.execute(
      `UPDATE office_events
       SET status = 'RELEASED',
           slot_state = 'ASSIGNED_AVAILABLE',
           booked_provider_id = NULL,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [eventId]
    );
    return await this.findById(eventId);
  }

  static async listBookedForOfficeDate({ officeLocationId, date }) {
    // date: YYYY-MM-DD
    const day = String(date || '').slice(0, 10);
    if (!officeLocationId || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return [];

    const startAt = `${day} 00:00:00`;
    const endAt = `${day} 23:59:59`;

    const [rows] = await pool.execute(
      `SELECT
         e.*,
         r.name AS room_name,
         r.svg_room_id AS room_svg_room_id,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_events e
       JOIN office_rooms r ON e.room_id = r.id
       LEFT JOIN users u ON e.booked_provider_id = u.id
       WHERE e.office_location_id = ?
         AND e.status = 'BOOKED'
         AND e.start_at >= ?
         AND e.start_at <= ?
       ORDER BY e.start_at ASC, r.sort_order ASC, r.name ASC`,
      [officeLocationId, startAt, endAt]
    );
    return rows || [];
  }

  static async cancelOccurrence({ eventId }) {
    await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [eventId]
    );
    return await this.findById(eventId);
  }

  static async cancelFutureByStandingAssignment({ standingAssignmentId, startAt }) {
    const [result] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP
       WHERE standing_assignment_id = ?
         AND start_at >= ?`,
      [standingAssignmentId, startAt]
    );
    return Number(result?.affectedRows || 0);
  }

  static async cancelFutureByRecurrenceGroup({ recurrenceGroupId, startAt }) {
    const [result] = await pool.execute(
      `UPDATE office_events
       SET status = 'CANCELLED',
           updated_at = CURRENT_TIMESTAMP
       WHERE recurrence_group_id = ?
         AND start_at >= ?`,
      [recurrenceGroupId, startAt]
    );
    return Number(result?.affectedRows || 0);
  }
}

export default OfficeEvent;

