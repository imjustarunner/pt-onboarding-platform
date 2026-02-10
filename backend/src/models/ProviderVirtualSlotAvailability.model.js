import pool from '../config/database.js';

class ProviderVirtualSlotAvailability {
  static async upsertSlot({
    agencyId,
    providerId,
    officeLocationId = null,
    roomId = null,
    startAt,
    endAt,
    sessionType = 'INTAKE',
    source = 'OFFICE_EVENT',
    sourceEventId = null,
    createdByUserId = null
  }) {
    const st = String(sessionType || 'INTAKE').trim().toUpperCase();
    const normalizedSessionType = ['INTAKE', 'REGULAR', 'BOTH'].includes(st) ? st : 'INTAKE';
    const [result] = await pool.execute(
      `INSERT INTO provider_virtual_slot_availability
         (agency_id, provider_id, office_location_id, room_id, start_at, end_at, session_type, is_active, source, source_event_id, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         office_location_id = VALUES(office_location_id),
         room_id = VALUES(room_id),
         session_type = VALUES(session_type),
         is_active = TRUE,
         source = VALUES(source),
         source_event_id = VALUES(source_event_id),
         updated_at = CURRENT_TIMESTAMP`,
      [
        agencyId,
        providerId,
        officeLocationId,
        roomId,
        startAt,
        endAt,
        normalizedSessionType,
        source,
        sourceEventId,
        createdByUserId
      ]
    );
    return result?.insertId || null;
  }

  static async deactivateSlot({ agencyId, providerId, startAt, endAt }) {
    try {
      const [result] = await pool.execute(
        `UPDATE provider_virtual_slot_availability
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

  static async deactivateBySourceEventId(sourceEventId) {
    try {
      const [result] = await pool.execute(
        `UPDATE provider_virtual_slot_availability
         SET is_active = FALSE, updated_at = CURRENT_TIMESTAMP
         WHERE source = 'OFFICE_EVENT'
           AND source_event_id = ?`,
        [sourceEventId]
      );
      return Number(result?.affectedRows || 0);
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return 0;
      throw e;
    }
  }
}

export default ProviderVirtualSlotAvailability;
