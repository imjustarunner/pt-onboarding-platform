import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import ClinicalSession from '../models/clinical/ClinicalSession.model.js';
import ClinicalNote from '../models/clinical/ClinicalNote.model.js';
import ClinicalEligibilityService from './clinicalEligibility.service.js';

function parseIcdTokens(text) {
  return String(text || '')
    .split(/[,;\n|]+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

async function syncDiagnosesFromEncounter({ agencyId, clientId, clinicalSessionId, diagnosisText, actingUserId }) {
  const codes = parseIcdTokens(diagnosisText);
  if (!codes.length || !clinicalSessionId) return;

  for (const code of codes) {
    const icd10 = code.slice(0, 16);
    try {
      const [existing] = await clinicalPool.execute(
        `SELECT id FROM clinical_diagnoses
         WHERE agency_id = ? AND client_id = ? AND icd10_code = ? AND is_active = 1
         LIMIT 1`,
        [agencyId, clientId, icd10]
      );
      if (existing?.[0]?.id) continue;

      await clinicalPool.execute(
        `INSERT INTO clinical_diagnoses
           (agency_id, client_id, clinical_session_id, icd10_code, description, is_primary, is_active, created_by_user_id)
         VALUES (?, ?, ?, ?, ?, 0, 1, ?)`,
        [agencyId, clientId, clinicalSessionId, icd10, code, actingUserId || null]
      );
    } catch {
      // best-effort when clinical DB or table unavailable
    }
  }
}

export async function ensureClinicalSessionForBillingEncounter({
  agencyId,
  billingEncounterId,
  actingUserId = null
}) {
  const aid = Number(agencyId);
  const beId = Number(billingEncounterId);
  if (!aid || !beId) {
    const err = new Error('agencyId and billingEncounterId are required');
    err.status = 400;
    throw err;
  }

  const [rows] = await pool.execute(
    `SELECT be.*, c.client_type
     FROM billing_encounters be
     JOIN clients c ON c.id = be.client_id
     WHERE be.id = ? AND be.agency_id = ?
     LIMIT 1`,
    [beId, aid]
  );
  const encounter = rows?.[0];
  if (!encounter) {
    const err = new Error('Billing encounter not found');
    err.status = 404;
    throw err;
  }
  if (String(encounter.client_type || '').toLowerCase() !== 'clinical') {
    const err = new Error('Clinical sessions require a clinical client');
    err.status = 409;
    throw err;
  }

  await ClinicalEligibilityService.assertAgencyHasClinicalOrg(aid);

  if (Number(encounter.clinical_session_id || 0) > 0) {
    const session = await ClinicalSession.findById(encounter.clinical_session_id);
    if (session) return { session, encounter, created: false };
  }

  const serviceDate = encounter.service_date ? String(encounter.service_date).slice(0, 10) : null;
  const scheduledStart = serviceDate ? `${serviceDate} 12:00:00` : null;

  const session = await ClinicalSession.upsertFromBillingEncounter({
    agencyId: aid,
    clientId: Number(encounter.client_id),
    billingEncounterId: beId,
    providerUserId: Number(encounter.provider_user_id || 0) || null,
    placeOfService: encounter.place_of_service || null,
    serviceCode: encounter.service_code || null,
    scheduledStartAt: scheduledStart,
    scheduledEndAt: scheduledStart,
    metadataJson: {
      source: 'billing_import',
      billingEncounterId: beId,
      missingCalendarAttachment: true
    },
    createdByUserId: actingUserId
  });

  await pool.execute(
    `UPDATE billing_encounters
     SET clinical_session_id = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND agency_id = ?`,
    [session.id, beId, aid]
  );

  await syncDiagnosesFromEncounter({
    agencyId: aid,
    clientId: Number(encounter.client_id),
    clinicalSessionId: session.id,
    diagnosisText: encounter.diagnosis_text,
    actingUserId
  });

  return { session, encounter: { ...encounter, clinical_session_id: session.id }, created: true };
}

export async function enrichEncountersWithNoteSummary(encounters = []) {
  const list = Array.isArray(encounters) ? encounters : [];
  const sessionIds = [...new Set(list.map((e) => Number(e.clinical_session_id || 0)).filter((id) => id > 0))];
  if (!sessionIds.length) {
    return list.map((row) => ({
      ...row,
      clinical_note_id: null,
      note_status: 'none',
      note_title: null
    }));
  }

  const placeholders = sessionIds.map(() => '?').join(', ');
  let notes = [];
  try {
    const [rows] = await clinicalPool.execute(
      `SELECT id, clinical_session_id, title, provider_signed_at, created_at
       FROM clinical_notes
       WHERE clinical_session_id IN (${placeholders}) AND is_deleted = 0
       ORDER BY created_at DESC`,
      sessionIds
    );
    notes = rows || [];
  } catch {
    notes = [];
  }

  const latestBySession = new Map();
  for (const note of notes) {
    const sid = Number(note.clinical_session_id || 0);
    if (!sid || latestBySession.has(sid)) continue;
    latestBySession.set(sid, note);
  }

  return list.map((row) => {
    const sid = Number(row.clinical_session_id || 0);
    const note = sid ? latestBySession.get(sid) : null;
    let noteStatus = 'none';
    if (note?.provider_signed_at) noteStatus = 'signed';
    else if (note?.id) noteStatus = 'draft';
    return {
      ...row,
      clinical_note_id: note?.id ? Number(note.id) : null,
      note_status: noteStatus,
      note_title: note?.title || null
    };
  });
}

/**
 * Note-only billing row (no CPT): create a clinical session + empty note stub
 * without a billing claim / encounter link. PDF content can fill note_payload later.
 */
export async function ensureNoteOnlyClinicalRecord({
  agencyId,
  clientId,
  providerUserId = null,
  serviceDate = null,
  title = 'Clinical note',
  actingUserId = null
}) {
  const aid = Number(agencyId);
  const cid = Number(clientId);
  if (!aid || !cid) return null;

  try {
    await ClinicalEligibilityService.assertAgencyHasClinicalOrg(aid);
  } catch {
    return null;
  }

  const dos = serviceDate ? String(serviceDate).slice(0, 10) : null;
  const scheduledStart = dos ? `${dos} 12:00:00` : null;
  const fingerprint = `note_only|${aid}|${cid}|${dos || 'nodate'}|${providerUserId || 0}|${String(title || '').slice(0, 80)}`;

  let sessionId = null;
  try {
    const [existing] = await clinicalPool.execute(
      `SELECT id FROM clinical_sessions
       WHERE agency_id = ? AND client_id = ?
         AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json, '$.noteOnlyFingerprint')) = ?
       LIMIT 1`,
      [aid, cid, fingerprint]
    );
    sessionId = Number(existing?.[0]?.id || 0);
  } catch {
    sessionId = 0;
  }

  if (!sessionId) {
    try {
      const [result] = await clinicalPool.execute(
        `INSERT INTO clinical_sessions
           (agency_id, client_id, office_event_id, billing_encounter_id, provider_user_id,
            place_of_service, service_code, encounter_status, rendering_provider_user_id,
            scheduled_start_at, scheduled_end_at, metadata_json, created_by_user_id)
         VALUES (?, ?, NULL, NULL, ?, NULL, NULL, 'completed', ?, ?, ?, ?, ?)`,
        [
          aid,
          cid,
          providerUserId || null,
          providerUserId || null,
          scheduledStart,
          scheduledStart,
          JSON.stringify({
            source: 'billing_import_note_only',
            noteOnlyFingerprint: fingerprint,
            missingCalendarAttachment: true
          }),
          actingUserId || null
        ]
      );
      sessionId = Number(result.insertId || 0);
    } catch (e) {
      console.warn('[billingEncounterClinical] note-only session create failed', e?.message || e);
      return null;
    }
  }

  if (!sessionId) return null;

  try {
    const [notes] = await clinicalPool.execute(
      `SELECT id FROM clinical_notes
       WHERE clinical_session_id = ? AND is_deleted = 0
       LIMIT 1`,
      [sessionId]
    );
    if (!notes?.[0]?.id && (actingUserId || providerUserId)) {
      await ClinicalNote.create({
        clinicalSessionId: sessionId,
        agencyId: aid,
        clientId: cid,
        title: String(title || 'Clinical note').slice(0, 255),
        notePayload: null,
        metadataJson: {
          source: 'billing_import_note_only',
          awaitingPdfContent: true
        },
        createdByUserId: actingUserId || providerUserId
      });
    }
  } catch (e) {
    console.warn('[billingEncounterClinical] note stub create failed', e?.message || e);
  }

  return { clinicalSessionId: sessionId };
}

export function stripEncounterFinancials(row) {
  if (!row || typeof row !== 'object') return row;
  const {
    charge_rate: _c,
    patient_amount: _pa,
    patient_balance: _pb,
    insurance_amount: _ia,
    insurance_amount_paid: _iap,
    insurance_outstanding: _io,
    ...rest
  } = row;
  return rest;
}
