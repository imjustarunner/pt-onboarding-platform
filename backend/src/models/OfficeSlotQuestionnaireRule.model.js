import pool from '../config/database.js';

class OfficeSlotQuestionnaireRule {
  /**
   * Find questionnaire modules that apply to a given event (room, start time).
   * @param {Object} opts - { officeLocationId, roomId, startAt (Date or ISO string) }
   * @returns {Promise<Array>} Matching rules with module info
   */
  static async findForEvent({ officeLocationId, roomId, startAt }) {
    const start = startAt instanceof Date ? startAt : new Date(startAt);
    const dayOfWeek = start.getDay();
    const hour = start.getHours();

    const roomCondition = roomId == null
      ? 'osqr.room_id IS NULL'
      : '(osqr.room_id IS NULL OR osqr.room_id = ?)';
    const params = [officeLocationId];
    if (roomId != null) params.push(roomId);
    params.push(dayOfWeek, hour, hour);

    const [rows] = await pool.execute(
      `SELECT osqr.*, m.title AS module_title, m.description AS module_description
       FROM office_slot_questionnaire_rules osqr
       JOIN modules m ON m.id = osqr.module_id
       WHERE osqr.office_location_id = ?
         AND osqr.is_active = TRUE
         AND ${roomCondition}
         AND (osqr.day_of_week IS NULL OR osqr.day_of_week = ?)
         AND (osqr.hour_start IS NULL OR osqr.hour_start <= ?)
         AND (osqr.hour_end IS NULL OR osqr.hour_end >= ?)
       ORDER BY osqr.room_id IS NOT NULL DESC, osqr.day_of_week IS NOT NULL DESC`,
      params
    );

    return rows || [];
  }

  static async listForOffice(officeLocationId) {
    const [rows] = await pool.execute(
      `SELECT osqr.*, m.title AS module_title, r.name AS room_name
       FROM office_slot_questionnaire_rules osqr
       JOIN modules m ON m.id = osqr.module_id
       LEFT JOIN office_rooms r ON r.id = osqr.room_id
       WHERE osqr.office_location_id = ? AND osqr.is_active = TRUE
       ORDER BY r.name, osqr.day_of_week, osqr.hour_start`,
      [officeLocationId]
    );
    return rows || [];
  }

  static async create({ officeLocationId, roomId = null, dayOfWeek = null, hourStart = null, hourEnd = null, moduleId }) {
    const end = hourEnd != null ? hourEnd : hourStart;
    const [result] = await pool.execute(
      `INSERT INTO office_slot_questionnaire_rules (office_location_id, room_id, day_of_week, hour_start, hour_end, module_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [officeLocationId, roomId, dayOfWeek, hourStart, end, moduleId]
    );
    return result.insertId;
  }

  static async findById(id) {
    const [rows] = await pool.execute('SELECT * FROM office_slot_questionnaire_rules WHERE id = ? LIMIT 1', [id]);
    return rows?.[0] || null;
  }

  static async delete(id) {
    const [result] = await pool.execute('DELETE FROM office_slot_questionnaire_rules WHERE id = ?', [id]);
    return result.affectedRows > 0;
  }
}

export default OfficeSlotQuestionnaireRule;
