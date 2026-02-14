import pool from '../config/database.js';

class OfficeQuestionnaireResponse {
  static async create({
    officeLocationId,
    roomId,
    eventId,
    providerId,
    moduleId = null,
    intakeLinkId = null,
    answers,
    typicalDayTime,
    appendToSlotHistory,
    slotHistoryKey
  }) {
    const [result] = await pool.execute(
      `INSERT INTO office_questionnaire_responses
       (office_location_id, room_id, event_id, provider_id, module_id, intake_link_id, answers, typical_day_time, append_to_slot_history, slot_history_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        officeLocationId,
        roomId,
        eventId,
        providerId,
        moduleId,
        intakeLinkId,
        JSON.stringify(answers || {}),
        typicalDayTime ? 1 : 0,
        appendToSlotHistory ? 1 : 0,
        slotHistoryKey || null
      ]
    );
    const [rows] = await pool.execute('SELECT * FROM office_questionnaire_responses WHERE id = ? LIMIT 1', [result.insertId]);
    return rows?.[0] || null;
  }
}

export default OfficeQuestionnaireResponse;

