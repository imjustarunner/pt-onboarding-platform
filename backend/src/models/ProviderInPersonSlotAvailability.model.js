import pool from '../config/database.js';

class ProviderInPersonSlotAvailability {
  static async upsertSlot({
    agencyId,
    providerId,
    officeLocationId = null,
    roomId = null,
    startAt,
    endAt,
    availableForIntake = true,
    availableForSession = false,
    source = 'OFFICE_EVENT',
    sourceEventId = null,
    frequency = 'ONCE', purpose = 'INTAKE', seriesId=null, careTypes=null, database = pool,
    createdByUserId = null
  }) {
    const [result] = await database.execute(
      `INSERT INTO provider_in_person_slot_availability
         (agency_id, provider_id, office_location_id, room_id, start_at, end_at, is_active, available_for_intake, available_for_session, source, source_event_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         office_location_id = VALUES(office_location_id),
         room_id = VALUES(room_id),
         is_active = TRUE,
         available_for_intake = VALUES(available_for_intake),
         available_for_session = VALUES(available_for_session),
         source = VALUES(source),
         source_event_id = VALUES(source_event_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, providerId, officeLocationId, roomId, startAt, endAt, Number(availableForIntake), Number(availableForSession), source, sourceEventId, createdByUserId]
    );
    await database.execute(`UPDATE provider_in_person_slot_availability SET frequency=?,purpose=?,series_id=?,care_types_json=? WHERE agency_id=? AND provider_id=? AND start_at=? AND end_at=?`,[frequency,purpose,seriesId,careTypes===null?null:JSON.stringify(careTypes),agencyId,providerId,startAt,endAt]);
    return result?.insertId || null;
  }

  static async deactivateSlot({ agencyId, providerId, startAt, endAt }) {
    try {
      const [result] = await pool.execute(
        `UPDATE provider_in_person_slot_availability
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE agency_id = ?
           AND provider_id = ?
           AND start_at = ?
           AND end_at = ?`,
        [agencyId, providerId, startAt, endAt]
      );
      return Number(result?.affectedRows || 0);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return 0;
      throw e;
    }
  }

  static async isActiveSlot({ agencyId, providerId, startAt, endAt }) {
    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM provider_in_person_slot_availability
         WHERE agency_id = ?
           AND provider_id = ?
           AND start_at = ?
           AND end_at = ?
           AND is_active = TRUE
         LIMIT 1`,
        [agencyId, providerId, startAt, endAt]
      );
      return Boolean(rows?.[0]?.id);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return false;
      throw e;
    }
  }
}

export default ProviderInPersonSlotAvailability;
