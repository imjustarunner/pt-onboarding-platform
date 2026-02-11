import pool from '../config/database.js';

class OfficeStandingAssignment {
  static async findById(id) {
    const [rows] = await pool.execute(`SELECT * FROM office_standing_assignments WHERE id = ? LIMIT 1`, [id]);
    return rows?.[0] || null;
  }

  static async create({
    officeLocationId,
    roomId,
    providerId,
    weekday,
    hour,
    assignedFrequency = 'WEEKLY',
    recurrenceGroupId = null,
    createdByUserId
  }) {
    let result;
    try {
      [result] = await pool.execute(
        `INSERT INTO office_standing_assignments
          (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, recurrence_group_id, availability_mode, available_since_date, last_two_week_confirmed_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NOW(), ?)`,
        [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, recurrenceGroupId, createdByUserId]
      );
    } catch (e) {
      // Backward compatible with environments before migration 382.
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      [result] = await pool.execute(
        `INSERT INTO office_standing_assignments
          (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, availability_mode, available_since_date, last_two_week_confirmed_at, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NOW(), ?)`,
        [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, createdByUserId]
      );
    }
    return this.findById(result.insertId);
  }

  static async findActiveBySlot({ officeLocationId, roomId, weekday, hour }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND weekday = ?
         AND hour = ?
         AND is_active = TRUE
       LIMIT 1`,
      [officeLocationId, roomId, weekday, hour]
    );
    return rows?.[0] || null;
  }

  static async listByOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT
         a.*,
         u.first_name AS provider_first_name,
         u.last_name AS provider_last_name
       FROM office_standing_assignments a
       JOIN users u ON a.provider_id = u.id
       WHERE a.office_location_id = ?
         AND a.is_active = TRUE`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async update(id, updates = {}) {
    const allowed = [
      'assigned_frequency',
      'availability_mode',
      'temporary_until_date',
      'available_since_date',
      'last_two_week_confirmed_at',
      'last_six_week_checked_at',
      'recurrence_group_id',
      'is_active'
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
    await pool.execute(`UPDATE office_standing_assignments SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`, values);
    return this.findById(id);
  }
}

export default OfficeStandingAssignment;

