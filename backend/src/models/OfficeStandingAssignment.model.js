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
      return this.findById(result.insertId);
    } catch (e) {
      if (e?.code === 'ER_DUP_ENTRY' || e?.errno === 1062) {
        // An inactive row already exists for this exact slot (same room/provider/weekday/hour/frequency).
        // Reactivate it with fresh settings rather than failing.
        const [[existing]] = await pool.execute(
          `SELECT id FROM office_standing_assignments
           WHERE room_id = ? AND provider_id = ? AND weekday = ? AND hour = ? AND assigned_frequency = ?
           LIMIT 1`,
          [roomId, providerId, weekday, hour, assignedFrequency]
        );
        if (!existing?.id) throw e;
        await pool.execute(
          `UPDATE office_standing_assignments
           SET is_active                  = TRUE,
               office_location_id         = ?,
               recurrence_group_id        = COALESCE(?, recurrence_group_id),
               availability_mode          = 'AVAILABLE',
               available_since_date       = CURDATE(),
               last_two_week_confirmed_at = NOW(),
               last_forfeit_warning_at    = NULL,
               created_by_user_id         = ?,
               updated_at                 = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [officeLocationId, recurrenceGroupId, createdByUserId, existing.id]
        );
        return this.findById(existing.id);
      }
      // Backward compatible with environments before migration 382.
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
      try {
        [result] = await pool.execute(
          `INSERT INTO office_standing_assignments
            (office_location_id, room_id, provider_id, weekday, hour, assigned_frequency, availability_mode, available_since_date, last_two_week_confirmed_at, created_by_user_id)
           VALUES (?, ?, ?, ?, ?, ?, 'AVAILABLE', CURDATE(), NOW(), ?)`,
          [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency, createdByUserId]
        );
      } catch (insErr) {
        if (insErr?.code === 'ER_DUP_ENTRY' || insErr?.errno === 1062) {
          const [[existing]] = await pool.execute(
            `SELECT id FROM office_standing_assignments
             WHERE room_id = ? AND provider_id = ? AND weekday = ? AND hour = ? AND assigned_frequency = ?
             LIMIT 1`,
            [roomId, providerId, weekday, hour, assignedFrequency]
          );
          if (!existing?.id) throw insErr;
          await pool.execute(
            `UPDATE office_standing_assignments
             SET is_active = TRUE, office_location_id = ?, availability_mode = 'AVAILABLE',
                 available_since_date = CURDATE(), last_two_week_confirmed_at = NOW(),
                 last_forfeit_warning_at = NULL, created_by_user_id = ?,
                 updated_at = CURRENT_TIMESTAMP
             WHERE id = ?`,
            [officeLocationId, createdByUserId, existing.id]
          );
          return this.findById(existing.id);
        }
        throw insErr;
      }
      return this.findById(result.insertId);
    }
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

  static async findAnyBySlotProviderFrequency({
    officeLocationId,
    roomId,
    providerId,
    weekday,
    hour,
    assignedFrequency = 'WEEKLY'
  }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM office_standing_assignments
       WHERE office_location_id = ?
         AND room_id = ?
         AND provider_id = ?
         AND weekday = ?
         AND hour = ?
         AND assigned_frequency = ?
       ORDER BY is_active DESC, id DESC
       LIMIT 1`,
      [officeLocationId, roomId, providerId, weekday, hour, assignedFrequency]
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
      'room_id',
      'weekday',
      'hour',
      'assigned_frequency',
      'availability_mode',
      'temporary_until_date',
      'temporary_extension_count',
      'available_since_date',
      'last_two_week_confirmed_at',
      'last_six_week_checked_at',
      'last_forfeit_warning_at',
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

