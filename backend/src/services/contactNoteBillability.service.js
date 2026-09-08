import clinicalPool from '../config/clinicalDatabase.js';
import { ensureNoteOnlyClinicalRecord } from './billingEncounterClinical.service.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';

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
} = {}) {
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

  const ensured = await ensureNoteOnlyClinicalRecord({
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

  try {
    await clinicalPool.execute(
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
  const note = await ClinicalNote.create({
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

  // Mark signed + billable so createMedicalClaim can queue for billing staff.
  try {
    await clinicalPool.execute(
      `UPDATE clinical_notes
       SET provider_signed_at = UTC_TIMESTAMP(),
           is_billable = 1,
           provider_signed_by_user_id = ?
       WHERE id = ?`,
      [authorUserId, note.id]
    );
  } catch {
    try {
      await clinicalPool.execute(
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
