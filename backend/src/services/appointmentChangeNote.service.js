import { createHash } from 'node:crypto';
import clinicalPool from '../config/clinicalDatabase.js';
import { maybeEncryptNotePayload } from './clinicalNoteCrypto.service.js';

export const APPOINTMENT_CHANGE_CLAIM_BLOCK = 'Appointment did not occur — nonbillable appointment change';

// Include every client in a group appointment, plus older office-only session links.
export async function assertAppointmentChangeDocumentation(appointment) {
  const [signed] = await clinicalPool.execute(
    `SELECT n.id FROM clinical_notes n JOIN clinical_sessions s ON s.id = n.clinical_session_id
     WHERE s.agency_id = ? AND (s.appointment_id = ? OR s.id = ? OR s.office_event_id = ?)
       AND n.is_deleted = 0 AND n.provider_signed_at IS NOT NULL
       AND (n.note_type IS NULL OR n.note_type NOT IN ('APPOINTMENT_CHANGE', 'APPOINTMENT_WAIVER')) LIMIT 1`,
    [appointment.agencyId, appointment.id, appointment.clinicalSessionId || null, appointment.officeEventId || null]
  );
  if (signed.length) throw Object.assign(new Error('This session already has signed clinical documentation. Review it before recording a non-occurring appointment.'), { status: 409 });
}

export async function blockAppointmentChangeClaims(appointment, eventType) {
  await assertAppointmentChangeDocumentation(appointment);
  await clinicalPool.execute(
    `UPDATE clinical_sessions SET encounter_status = ?, claim_blocked_reason = ?, updated_at = CURRENT_TIMESTAMP
     WHERE agency_id = ? AND (appointment_id = ? OR id = ? OR office_event_id = ?)`,
    [eventType === 'no_show' ? 'no_show' : 'cancelled', APPOINTMENT_CHANGE_CLAIM_BLOCK,
      appointment.agencyId, appointment.id, appointment.clinicalSessionId || null, appointment.officeEventId || null]
  );
}

// Caller holds the appointment workflow lock. Clinical transaction makes signature,
// nonbillable flag and content inseparable; retry looks up the original signed note.
export async function attachAppointmentChangeNotes({ appointment, narrative, eventType, actorUserId, signedAt, kind = 'change' }) {
  const noteType = kind === 'waiver' ? 'APPOINTMENT_WAIVER' : 'APPOINTMENT_CHANGE';
  const conn = await clinicalPool.getConnection();
  try {
    await conn.beginTransaction();
    const [sessions] = await conn.execute(
      `SELECT id, client_id FROM clinical_sessions WHERE agency_id = ?
       AND (appointment_id = ? OR id = ? OR office_event_id = ?) FOR UPDATE`,
      [appointment.agencyId, appointment.id, appointment.clinicalSessionId || null, appointment.officeEventId || null]
    );
    const notes = [];
    for (const session of sessions) {
      const [existing] = await conn.execute(
        `SELECT id FROM clinical_notes WHERE clinical_session_id = ? AND agency_id = ?
         AND note_type = '${noteType}' AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.appointmentId')) = ? LIMIT 1`,
        [session.id, appointment.agencyId, String(appointment.id)]
      );
      let id = existing[0]?.id;
      if (!id) {
        const payload = maybeEncryptNotePayload(narrative);
        const metadata = { payloadEncrypted: payload !== narrative, source: 'appointment_change', appointmentId: appointment.id, eventType,
          noteType, nonBillable: true, requiresSupervisorCosign: false,
          signedByUserId: actorUserId, signedAt };
        const [created] = await conn.execute(
          `INSERT INTO clinical_notes (clinical_session_id, agency_id, client_id, title, note_payload,
           metadata_json, created_by_user_id, note_type, content_hash, provider_signed_at,
           provider_signed_by_user_id, is_billable)
           VALUES (?, ?, ?, ?, ?, ?, ?, '${noteType}', ?, ?, ?, 0)`,
          [session.id, appointment.agencyId, session.client_id, kind === 'waiver' ? 'Appointment waiver addendum — nonbillable' : 'Appointment change — nonbillable', payload,
            JSON.stringify(metadata), actorUserId, createHash('sha256').update(narrative).digest('hex'), signedAt, actorUserId]
        );
        id = created.insertId;
      }
      notes.push({ id, clinicalSessionId: session.id, clientId: session.client_id });
    }
    await conn.commit();
    return notes;
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally { conn.release(); }
}
