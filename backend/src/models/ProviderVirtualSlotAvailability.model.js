import pool from '../config/database.js';

function deriveSessionType({ availableForIntake, availableForSession, sessionType }) {
  if (availableForIntake != null || availableForSession != null) {
    const intake = availableForIntake === true || availableForIntake === 1 || availableForIntake === '1';
    const session = availableForSession === true || availableForSession === 1 || availableForSession === '1';
    if (intake && session) return 'BOTH';
    if (intake) return 'INTAKE';
    if (session) return 'REGULAR';
    return 'INTAKE';
  }
  const st = String(sessionType || 'INTAKE').trim().toUpperCase();
  return ['INTAKE', 'REGULAR', 'BOTH'].includes(st) ? st : 'INTAKE';
}

function flagsFromSessionType(sessionType) {
  const st = String(sessionType || 'INTAKE').toUpperCase();
  return {
    availableForIntake: st === 'INTAKE' || st === 'BOTH',
    availableForSession: st === 'REGULAR' || st === 'BOTH'
  };
}

class ProviderVirtualSlotAvailability {
  static async upsertSlot({
    agencyId,
    providerId,
    officeLocationId = null,
    roomId = null,
    startAt,
    endAt,
    sessionType = 'INTAKE',
    availableForIntake = null,
    availableForSession = null,
    source = 'OFFICE_EVENT',
    sourceEventId = null,
    createdByUserId = null
  }) {
    const normalizedSessionType = deriveSessionType({
      availableForIntake,
      availableForSession,
      sessionType
    });
    const flags = flagsFromSessionType(normalizedSessionType);
    try {
      const [result] = await pool.execute(
        `INSERT INTO provider_virtual_slot_availability
           (agency_id, provider_id, office_location_id, room_id, start_at, end_at, session_type,
            available_for_intake, available_for_session, is_active, source, source_event_id, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           office_location_id = VALUES(office_location_id),
           room_id = VALUES(room_id),
           session_type = VALUES(session_type),
           available_for_intake = VALUES(available_for_intake),
           available_for_session = VALUES(available_for_session),
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
          flags.availableForIntake ? 1 : 0,
          flags.availableForSession ? 1 : 0,
          source,
          sourceEventId,
          createdByUserId
        ]
      );
      return result?.insertId || null;
    } catch (e) {
      if (e?.code !== 'ER_BAD_FIELD_ERROR') throw e;
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

  static async isActiveSlot({ agencyId, providerId, startAt, endAt }) {
    try {
      const [rows] = await pool.execute(
        `SELECT id
         FROM provider_virtual_slot_availability
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

  static async isActiveIntakeSlot({ agencyId, providerId, startAt, endAt }) {
    try {
      try {
        const [rows] = await pool.execute(
          `SELECT id
           FROM provider_virtual_slot_availability
           WHERE agency_id = ?
             AND provider_id = ?
             AND start_at = ?
             AND end_at = ?
             AND is_active = TRUE
             AND (
               available_for_intake = 1
               OR (available_for_intake IS NULL AND session_type IN ('INTAKE', 'BOTH'))
             )
           LIMIT 1`,
          [agencyId, providerId, startAt, endAt]
        );
        return Boolean(rows?.[0]?.id);
      } catch (colErr) {
        if (!String(colErr?.message || '').includes('available_for_intake')) throw colErr;
        const [rows] = await pool.execute(
          `SELECT id
           FROM provider_virtual_slot_availability
           WHERE agency_id = ?
             AND provider_id = ?
             AND start_at = ?
             AND end_at = ?
             AND is_active = TRUE
             AND session_type IN ('INTAKE', 'BOTH')
           LIMIT 1`,
          [agencyId, providerId, startAt, endAt]
        );
        return Boolean(rows?.[0]?.id);
      }
    } catch (e) {
      if (e?.code === 'ER_NO_SUCH_TABLE') return false;
      throw e;
    }
  }
}

export default ProviderVirtualSlotAvailability;
