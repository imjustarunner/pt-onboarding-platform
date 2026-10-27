import { scheduleFromIntake } from '../utils/clientExchangeSchedule.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { summaryItems } from '../utils/clientExchangeSummary.js';
import { intakeNotePresentingProblems, intakePresentingProblems, latestPresentingProblem, parseSummaryJson } from '../utils/clientCareSummary.js';
import { listBillingDiagnosesForClient } from './billingReportIngest.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { screeningPresentingProblem } from './h0002ReviewDetails.js';
import { clientAge, exchangeInsuranceLabel } from '../utils/clientExchangeMatching.js';

async function optionalClinicalQuery(sql, params) {
  try { const [rows] = await clinicalPool.execute(sql, params); return rows; }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; }
}

async function intakeConcerns(clientId) {
  const [rows] = await pool.execute(`SELECT s.id, s.client_id, s.intake_data, s.submitted_at, s.created_at,
      s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
      l.intake_fields, l.intake_steps
    FROM intake_submissions s LEFT JOIN intake_links l ON l.id = s.intake_link_id
    WHERE s.submitted_at IS NOT NULL AND (s.client_id = ? OR EXISTS
      (SELECT 1 FROM intake_submission_clients isc WHERE isc.intake_submission_id = s.id AND isc.client_id = ?))
    ORDER BY s.submitted_at DESC`, [clientId, clientId]);
  if (!rows.length) return [];
  decryptIntakeSubmissionRows(rows);
  const ids = rows.map(row => row.id);
  const [associations] = await pool.execute(`SELECT intake_submission_id, client_id FROM intake_submission_clients
    WHERE intake_submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`, ids);
  return rows.map(row => ({
    values: intakePresentingProblems({ row, clientId, clientIds: associations.filter(a => Number(a.intake_submission_id) === Number(row.id)).map(a => a.client_id) }),
    recordedAt: row.submitted_at || row.created_at
  }));
}

async function importedIntakeConcerns(clientId, agencyId) {
  const [rows] = await pool.execute(`SELECT note_sections_json_enc, session_context_enc, status, finalized_at, updated_at, created_at
    FROM client_intake_note_drafts WHERE client_id = ? AND agency_id = ? AND status IN ('final', 'diagnosis_pending')
    ORDER BY COALESCE(finalized_at, updated_at, created_at) DESC`, [clientId, agencyId]);
  return rows.filter(row => row.status === 'final' ||
    parseSummaryJson(maybeDecryptNotePayload(row.session_context_enc)).source === 'client_creation_record_import').map(row => ({
    source: row.status === 'final' ? 'Intake' : 'Intake (review pending)',
    values: intakeNotePresentingProblems(parseSummaryJson(maybeDecryptNotePayload(row.note_sections_json_enc))),
    recordedAt: row.finalized_at || row.updated_at || row.created_at
  }));
}

/** A single current summary for the chart overview, exchange, and match email. */
export async function loadClientExchangeSummary({ client, agencyId = client.agency_id }) {
  const params = [Number(agencyId), Number(client.id)];
  const [diagnoses, plans, intakes, intakeNotes, screenings] = await Promise.all([
    optionalClinicalQuery(`SELECT icd10_code, description FROM clinical_diagnoses
      WHERE agency_id = ? AND client_id = ? AND (is_active IS NULL OR is_active = 1)
      ORDER BY is_primary DESC, created_at DESC`, params),
    optionalClinicalQuery(`SELECT * FROM clinical_treatment_plans WHERE agency_id = ? AND client_id = ?
      AND (status = 'active' OR (status = 'draft' AND source_tool_id = 'client_creation_record_import')) ORDER BY updated_at DESC, created_at DESC`, params),
    intakeConcerns(Number(client.id)),
    importedIntakeConcerns(Number(client.id), Number(agencyId)),
    optionalClinicalQuery(`SELECT metadata_json,provider_signed_at,updated_at FROM clinical_notes
      WHERE agency_id=? AND client_id=? AND is_deleted=0
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.source'))='h0002_digital_screening'
      ORDER BY updated_at DESC`, params)
  ]);
  const billing = diagnoses.length ? [] : await listBillingDiagnosesForClient({ agencyId, clientId: client.id });
  const intake = parseSummaryJson(client.intake_preferences_json);
  const age = clientAge(client);
  const referral = intake.exchangeReferral || {};
  const screeningProblems = screenings.map(row => {
    const meta = parseSummaryJson(row.metadata_json);
    const draft = meta.screeningDraftEnc ? parseSummaryJson(maybeDecryptNotePayload(meta.screeningDraftEnc)) : {};
    const text = row.provider_signed_at && meta.screeningPresentingProblemEnc ? maybeDecryptNotePayload(meta.screeningPresentingProblemEnc) : screeningPresentingProblem(draft);
    return { values: text ? [text] : [], source: row.provider_signed_at ? 'Screening' : 'Screening (draft)', recordedAt: row.updated_at };
  });
  const problem = latestPresentingProblem({ plans, intakes: [...intakes, ...intakeNotes, ...screeningProblems], preferences: intake });
  if (!problem.presentingProblems.length && referral.presentingProblem) { problem.presentingProblems = [referral.presentingProblem]; problem.presentingProblemSource = 'Referral'; }
  return {
    demographics: { ...(age == null ? (referral.age == null ? {} : { ageBand: String(referral.age) }) : { ageBand: String(age) }), ...(client.gender ? { gender: client.gender } : {}) },
    diagnoses: summaryItems(diagnoses.length ? diagnoses : billing.length ? billing : referral.diagnoses),
    ...problem,
    preferences: { insurance: exchangeInsuranceLabel(client.insurance_type_label, intake.insurance), matchingPreferences: intake.matchingPreferences || null, modality: intake.preferredModality ? String(intake.preferredModality).toLowerCase() : null, serviceLocation: intake.serviceLocation || intake.preferred_service_location || referral.serviceLocation || null, schedule: scheduleFromIntake(intake, client.timezone), providerGender: intake.preferredProviderGender || null }
  };
}
