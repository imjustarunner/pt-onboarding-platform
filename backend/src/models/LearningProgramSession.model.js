import pool from '../config/database.js';

class LearningProgramSession {
  static async create({
    agencyId,
    organizationId = null,
    officeEventId = null,
    clientId,
    guardianUserId = null,
    assignedProviderId = null,
    learningServiceId = null,
    paymentMode = 'PAY_PER_EVENT',
    sessionStatus = 'SCHEDULED',
    scheduledStartAt,
    scheduledEndAt,
    sourceTimezone = 'America/New_York',
    startAtUtc = null,
    endAtUtc = null,
    notes = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const [result] = await pool.execute(
      `INSERT INTO learning_program_sessions
         (agency_id, organization_id, office_event_id, client_id, guardian_user_id, assigned_provider_id, learning_service_id,
          payment_mode, session_status, scheduled_start_at, scheduled_end_at, source_timezone, start_at_utc, end_at_utc,
          notes, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        organizationId,
        officeEventId,
        clientId,
        guardianUserId,
        assignedProviderId,
        learningServiceId,
        paymentMode,
        sessionStatus,
        scheduledStartAt,
        scheduledEndAt,
        sourceTimezone,
        startAtUtc,
        endAtUtc,
        notes,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return await this.findById(result.insertId);
  }

  static async findById(id) {
    const sid = Number(id || 0);
    if (!sid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_program_sessions
       WHERE id = ?
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async findByOfficeEventId(officeEventId) {
    const eid = Number(officeEventId || 0);
    if (!eid) return null;
    const [rows] = await pool.execute(
      `SELECT *
       FROM learning_program_sessions
       WHERE office_event_id = ?
       LIMIT 1`,
      [eid]
    );
    return rows?.[0] || null;
  }

  static async listForClient({ agencyId, clientId, limit = 100 }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    if (!aid || !cid) return [];
    const lim = Math.min(Math.max(Number(limit || 100), 1), 500);
    const [rows] = await pool.execute(
      `SELECT s.*, ls.name AS service_name
       FROM learning_program_sessions s
       LEFT JOIN learning_services ls ON ls.id = s.learning_service_id
       WHERE s.agency_id = ?
         AND s.client_id = ?
       ORDER BY s.scheduled_start_at DESC
       LIMIT ${lim}`,
      [aid, cid]
    );
    return rows || [];
  }
}

export default LearningProgramSession;
