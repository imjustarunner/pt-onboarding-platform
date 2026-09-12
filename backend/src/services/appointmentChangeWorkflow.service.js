import pool from '../config/database.js';
import Appointment from '../models/Appointment.model.js';
import { queueAppointmentWaiver } from './appointmentWaiver.service.js';
import ClinicalRecordRef from '../models/ClinicalRecordRef.model.js';
import { assertAppointmentChangeDocumentation, blockAppointmentChangeClaims, attachAppointmentChangeNotes } from './appointmentChangeNote.service.js';
import { ensureAppointmentClinicalLink } from './appointmentClinicalLink.service.js';

const parse = (v) => typeof v === 'string' ? JSON.parse(v) : v;
const fail = (message, status = 409) => { throw Object.assign(new Error(message), { status }); };

export async function getAppointmentChangeWorkflow(appointmentId, db = pool) {
  const [rows] = await db.execute('SELECT * FROM appointment_change_workflows WHERE appointment_id = ?', [appointmentId]);
  const row = rows[0];
  return row ? { ...row, facts: parse(row.facts_json), preview: parse(row.preview_json), result: parse(row.result_json),
    facts_json: undefined, preview_json: undefined, result_json: undefined } : null;
}

async function withLock(id, action) {
  const conn = await pool.getConnection();
  let locked = false;
  try {
    const [rows] = await conn.execute('SELECT GET_LOCK(?, 10) AS acquired', [`appointment_change:${id}`]);
    locked = Number(rows[0]?.acquired) === 1;
    if (!locked) fail('This appointment change is being saved. Try again.');
    return await action(conn);
  } finally {
    if (locked) await conn.execute('SELECT RELEASE_LOCK(?)', [`appointment_change:${id}`]);
    conn.release();
  }
}

export async function saveAppointmentChangeDraft(appointmentId, facts, actorUserId) {
  return withLock(appointmentId, async (conn) => {
    const existing = await getAppointmentChangeWorkflow(appointmentId, conn);
    if (existing && existing.status !== 'draft') fail('This change has already been signed or is completing.');
    const appointment = await Appointment.findById(appointmentId);
    await conn.execute(
      `INSERT INTO appointment_change_workflows (appointment_id, agency_id, facts_json, updated_by_user_id)
       VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE facts_json = VALUES(facts_json), updated_by_user_id = VALUES(updated_by_user_id)`,
      [appointmentId, appointment.agencyId, JSON.stringify(facts), actorUserId]
    );
    return getAppointmentChangeWorkflow(appointmentId, conn);
  });
}

export async function runSignedAppointmentChange(appointmentId, facts, actor, { previewChange, applyChange }) {
  if (facts.signatureConfirmed !== true) fail('Review the generated note and confirm your signature.', 400);
  return withLock(appointmentId, async (conn) => {
    let workflow = await getAppointmentChangeWorkflow(appointmentId, conn);
    if (workflow?.status === 'completed') return workflow.result;
    if (workflow && workflow.status !== 'draft' && Number(workflow.signed_by_user_id) !== Number(actor.actorUserId)) {
      fail('The signing user must finish this appointment change.');
    }
    const appointment = await Appointment.findById(appointmentId);
    if (!workflow || workflow.status === 'draft') {
      if (!['draft', 'scheduled', 'confirmed', 'client_confirmed', 'reschedule_requested', 'checked_in'].includes(appointment.status)) {
        fail('This appointment already has a final outcome. Review its existing documentation before correcting it.');
      }
      await ensureAppointmentClinicalLink(appointmentId, actor.actorUserId);
      const preview = await previewChange(appointmentId, facts, actor);
      await assertAppointmentChangeDocumentation(await Appointment.findById(appointmentId));
      const signedAt = new Date().toISOString().slice(0, 19).replace('T', ' ');
      await conn.execute(
        `INSERT INTO appointment_change_workflows (appointment_id, agency_id, status, facts_json, preview_json,
         signed_at, signed_by_user_id, updated_by_user_id) VALUES (?, ?, 'completing', ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE status = 'completing', facts_json = VALUES(facts_json), preview_json = VALUES(preview_json),
         signed_at = VALUES(signed_at), signed_by_user_id = VALUES(signed_by_user_id), updated_by_user_id = VALUES(updated_by_user_id)`,
        [appointmentId, appointment.agencyId, JSON.stringify(facts), JSON.stringify(preview), signedAt, actor.actorUserId, actor.actorUserId]
      );
      workflow = await getAppointmentChangeWorkflow(appointmentId, conn);
    }
    // Persist the decision before side effects. Retries finish the same decision and signature.
    const linked = await Appointment.findById(appointmentId);
    await blockAppointmentChangeClaims(linked, workflow.facts.eventType);
    let result = workflow.result;
    if (!result) {
      result = await applyChange(appointmentId, workflow.facts, actor, workflow.preview);
      await conn.execute('UPDATE appointment_change_workflows SET result_json = ?, narrative = ? WHERE appointment_id = ?',
        [JSON.stringify(result), result.narrative, appointmentId]);
    }
    const notes = await attachAppointmentChangeNotes({ appointment: linked, narrative: result.narrative,
      eventType: workflow.facts.eventType, actorUserId: workflow.signed_by_user_id, signedAt: workflow.signed_at });
    if (linked.officeEventId) {
      for (const note of notes) await ClinicalRecordRef.upsert({ agencyId: linked.agencyId, clientId: note.clientId,
        officeEventId: linked.officeEventId, clinicalSessionId: note.clinicalSessionId, recordType: 'note', clinicalRecordId: note.id });
    }
    result = { ...result, ok: true, noteId: notes[0]?.id || null, sessionNotes: notes,
      sessionNote: { appointmentId, narrative: result.narrative, signedAt: workflow.signed_at,
        signedByUserId: workflow.signed_by_user_id, isBillable: false } };
    await queueAppointmentWaiver({ appointmentId, agencyId: linked.agencyId, facts: workflow.facts, actorUserId: workflow.signed_by_user_id }, conn);
    await conn.execute("UPDATE appointment_change_workflows SET status = 'completed', result_json = ?, narrative = ? WHERE appointment_id = ?",
      [JSON.stringify(result), result.narrative, appointmentId]);
    return result;
  });
}
