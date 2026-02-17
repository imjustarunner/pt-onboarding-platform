import pool from '../config/database.js';

class ClinicalRecordRef {
  static async upsert({
    agencyId,
    clientId,
    officeEventId,
    clinicalSessionId,
    recordType,
    clinicalRecordId
  }) {
    await pool.execute(
      `INSERT INTO clinical_record_refs
        (agency_id, client_id, office_event_id, clinical_session_id, record_type, clinical_record_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         agency_id = VALUES(agency_id),
         client_id = VALUES(client_id),
         office_event_id = VALUES(office_event_id),
         clinical_session_id = VALUES(clinical_session_id),
         updated_at = CURRENT_TIMESTAMP`,
      [agencyId, clientId, officeEventId, clinicalSessionId, recordType, clinicalRecordId]
    );
  }

  static async listForSession({ officeEventId, clientId, agencyId }) {
    const [rows] = await pool.execute(
      `SELECT *
       FROM clinical_record_refs
       WHERE office_event_id = ?
         AND client_id = ?
         AND agency_id = ?
       ORDER BY created_at DESC`,
      [officeEventId, clientId, agencyId]
    );
    return rows || [];
  }
}

export default ClinicalRecordRef;

