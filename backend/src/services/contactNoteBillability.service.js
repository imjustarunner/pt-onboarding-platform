import clinicalPool from '../config/clinicalDatabase.js';
import { ensureNoteOnlyClinicalRecord } from './billingEncounterClinical.service.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import {assertNarrivaRiskBeforeSignature} from './narrivaRiskAssessment.service.js';
import {assertNoPendingClinicalServiceChange} from '../utils/clinicalServiceChangePolicy.js';

/**
 * After a chart contact note requests insurance billing, create a note-only
 * clinical session + signed clinical note so billing can draft a claim (no ClaimMD auto).
 * Self-pay / pro-bono skip insurance claim creation.
 */
export async function processContactNoteBillingMeta({
  agencyId,
  clientId,
  authorUserId,
  noteMessage,
  meta = {}
} = {}, {database=clinicalPool,ensureRecord=ensureNoteOnlyClinicalRecord,noteModel=ClinicalNote,riskGate=assertNarrivaRiskBeforeSignature} = {}) {
  if (!meta?.billing_enabled) {
    return { handled: false, reason: 'billing_disabled' };
  }

  const disposition = String(meta.billing_disposition || '').toLowerCase();
  if (disposition === 'pro_bono') {
    return { handled: true, disposition, claimCreated: false, reason: 'pro_bono' };
  }
  if (disposition === 'self_pay') {
    return { handled: true, disposition, claimCreated: false, reason: 'self_pay' };
  }
  if (disposition !== 'submit_insurance' && !meta.billing_claim_requested) {
    return { handled: false, reason: 'no_insurance_request' };
  }

  const serviceCode = String(meta.service_code || 'H0023').trim().toUpperCase() || 'H0023';
  const serviceDate = new Date().toISOString().slice(0, 10);
  const minutes = Number(meta.minutes || 0) || null;

  const ensured = await ensureRecord({
    agencyId,
    clientId,
    providerUserId: authorUserId,
    serviceDate,
    title: `Contact (${serviceCode}) ${serviceDate}`,
    actingUserId: authorUserId,
    createStubNote: false
  });
  const sessionId = Number(ensured?.clinicalSessionId || 0);
  if (!sessionId) {
    return { handled: false, reason: 'session_create_failed' };
  }

  async function assertCurrentSessionServiceReady(){
    const [[current]]=await database.execute('SELECT * FROM clinical_sessions WHERE id=? AND agency_id=? AND client_id=?',[sessionId,agencyId,clientId]);
    if(!current)throw Object.assign(new Error('The linked contact encounter is unavailable. Reload before finalizing the note.'),{status:409});
    assertNoPendingClinicalServiceChange(current);
  }
  await assertCurrentSessionServiceReady();

  // A reused note-only encounter may already carry a persisted risk requirement.
  // This gate is deliberately outside the best-effort metadata/signature writes.
  await riskGate({id:null,agency_id:agencyId,client_id:clientId,clinical_session_id:sessionId,metadata_json:{contactMeta:meta}});

  try {
    await database.execute(
      `UPDATE clinical_sessions
       SET service_code = COALESCE(?, service_code),
           metadata_json = JSON_SET(
             COALESCE(metadata_json, JSON_OBJECT()),
             '$.source', 'contact_chart_note',
             '$.contactBillingDisposition', ?,
             '$.durationMinutes', CAST(? AS JSON)
           )
       WHERE id = ?`,
      [serviceCode, disposition || 'submit_insurance', minutes != null ? JSON.stringify(minutes) : 'null', sessionId]
    );
  } catch {
    // best-effort
  }

  const title = `Contact note (${serviceCode}) ${serviceDate}`;
  const note = await noteModel.create({
    clinicalSessionId: sessionId,
    agencyId,
    clientId,
    title,
    notePayload: String(noteMessage || '').trim(),
    metadataJson: {
      generatedBy: 'contact_chart_note',
      aiGenerated: false,
      manualSections: true,
      serviceCode,
      billingAddons: [],
      billingPrimaryUnits: 1,
      contactMeta: meta,
      dateOfService: serviceDate,
      durationMinutes: minutes,
      skipSupervisorCosign: true,
      requiresSupervisorCosign: false,
      source: 'contact_chart_note'
    },
    createdByUserId: authorUserId
  });

  // Recheck the actual newly saved note immediately before applying a signature.
  // A risk requirement discovered while the record was being created must propagate.
  await assertCurrentSessionServiceReady();
  await riskGate({...note,agency_id:agencyId,client_id:clientId,clinical_session_id:sessionId});

  // Mark signed + billable so createMedicalClaim can queue for billing staff.
  try {
    await database.execute(
      `UPDATE clinical_notes
       SET provider_signed_at = UTC_TIMESTAMP(),
           is_billable = 1,
           provider_signed_by_user_id = ?
       WHERE id = ?`,
      [authorUserId, note.id]
    );
  } catch {
    try {
      await database.execute(
        `UPDATE clinical_notes
         SET provider_signed_at = UTC_TIMESTAMP(),
             is_billable = 1
         WHERE id = ?`,
        [note.id]
      );
    } catch {
      // schema variance
    }
  }

  return {
    handled: true,
    disposition: 'submit_insurance',
    clinicalSessionId: sessionId,
    clinicalNoteId: Number(note.id),
    serviceCode,
    claimReady: true
  };
}

export default { processContactNoteBillingMeta };
