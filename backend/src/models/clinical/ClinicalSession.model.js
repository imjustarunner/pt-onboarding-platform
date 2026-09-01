import clinicalPool from '../../config/clinicalDatabase.js';

class ClinicalSession {
  static async findById(id) {
    const sid = Number(id || 0);
    if (!sid) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT *
       FROM clinical_sessions
       WHERE id = ?
       LIMIT 1`,
      [sid]
    );
    return rows?.[0] || null;
  }

  static async findByOfficeEventAndClient({ officeEventId, clientId }) {
    const eid = Number(officeEventId || 0);
    const cid = Number(clientId || 0);
    if (!eid || !cid) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT *
       FROM clinical_sessions
       WHERE office_event_id = ?
         AND client_id = ?
       LIMIT 1`,
      [eid, cid]
    );
    return rows?.[0] || null;
  }

  static async findByBillingEncounterId(billingEncounterId) {
    const beId = Number(billingEncounterId || 0);
    if (!beId) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT *
       FROM clinical_sessions
       WHERE billing_encounter_id = ?
       LIMIT 1`,
      [beId]
    );
    return rows?.[0] || null;
  }

  static async findUnbilledByClientDateCode({ agencyId, clientId, serviceDate, serviceCode }) {
    const aid = Number(agencyId || 0);
    const cid = Number(clientId || 0);
    const date = String(serviceDate || '').slice(0, 10);
    const code = String(serviceCode || '').trim();
    if (!aid || !cid || !date || !code) return null;
    const [rows] = await clinicalPool.execute(
      `SELECT *
       FROM clinical_sessions
       WHERE agency_id = ?
         AND client_id = ?
         AND billing_encounter_id IS NULL
         AND DATE(scheduled_start_at) = ?
         AND (
           service_code = ?
           OR TRIM(COALESCE(service_code, '')) = ''
         )
       ORDER BY office_event_id IS NULL ASC, id ASC
       LIMIT 1`,
      [aid, cid, date, code]
    );
    return rows?.[0] || null;
  }

  static async attachBillingEncounter({ sessionId, billingEncounterId, serviceCode = null, providerUserId = null }) {
    const sid = Number(sessionId || 0);
    const beId = Number(billingEncounterId || 0);
    if (!sid || !beId) return null;
    await clinicalPool.execute(
      `UPDATE clinical_sessions
       SET billing_encounter_id = ?,
           service_code = COALESCE(NULLIF(?, ''), service_code),
           rendering_provider_user_id = COALESCE(?, rendering_provider_user_id),
           encounter_status = 'completed',
           updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [beId, serviceCode || null, providerUserId || null, sid]
    );
    return this.findById(sid);
  }

  static async upsertFromBillingEncounter({
    agencyId,
    clientId,
    billingEncounterId,
    providerUserId = null,
    placeOfService = null,
    serviceCode = null,
    scheduledStartAt = null,
    scheduledEndAt = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const existing = await this.findByBillingEncounterId(billingEncounterId);
    if (existing?.id) {
      await clinicalPool.execute(
        `UPDATE clinical_sessions
         SET agency_id = ?,
             client_id = ?,
             provider_user_id = ?,
             place_of_service = ?,
             service_code = ?,
             scheduled_start_at = ?,
             scheduled_end_at = ?,
             metadata_json = ?,
             encounter_status = 'completed',
             rendering_provider_user_id = COALESCE(?, rendering_provider_user_id),
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          agencyId,
          clientId,
          providerUserId,
          placeOfService,
          serviceCode,
          scheduledStartAt,
          scheduledEndAt,
          metadataJson ? JSON.stringify(metadataJson) : null,
          providerUserId,
          existing.id
        ]
      );
      return this.findById(existing.id);
    }

    const [result] = await clinicalPool.execute(
      `INSERT INTO clinical_sessions
         (agency_id, client_id, office_event_id, billing_encounter_id, provider_user_id,
          place_of_service, service_code, encounter_status, rendering_provider_user_id,
          scheduled_start_at, scheduled_end_at, metadata_json, created_by_user_id)
       VALUES (?, ?, NULL, ?, ?, ?, ?, 'completed', ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        billingEncounterId,
        providerUserId,
        placeOfService,
        serviceCode,
        providerUserId,
        scheduledStartAt,
        scheduledEndAt,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }

  static async upsert({
    agencyId,
    clientId,
    officeEventId,
    providerUserId = null,
    sourceTimezone = null,
    scheduledStartAt = null,
    scheduledEndAt = null,
    metadataJson = null,
    createdByUserId = null
  }) {
    const existing = await this.findByOfficeEventAndClient({ officeEventId, clientId });
    if (existing?.id) {
      await clinicalPool.execute(
        `UPDATE clinical_sessions
         SET agency_id = ?,
             provider_user_id = ?,
             source_timezone = ?,
             scheduled_start_at = ?,
             scheduled_end_at = ?,
             metadata_json = ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [
          agencyId,
          providerUserId,
          sourceTimezone,
          scheduledStartAt,
          scheduledEndAt,
          metadataJson ? JSON.stringify(metadataJson) : null,
          existing.id
        ]
      );
      return this.findById(existing.id);
    }

    const [result] = await clinicalPool.execute(
      `INSERT INTO clinical_sessions
       (agency_id, client_id, office_event_id, provider_user_id, source_timezone, scheduled_start_at, scheduled_end_at, metadata_json, created_by_user_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        agencyId,
        clientId,
        officeEventId,
        providerUserId,
        sourceTimezone,
        scheduledStartAt,
        scheduledEndAt,
        metadataJson ? JSON.stringify(metadataJson) : null,
        createdByUserId
      ]
    );
    return this.findById(result.insertId);
  }
}

export default ClinicalSession;

