import {readChartRecord} from './clientChartRecordRead.service.js';
import {readClientInsurance} from './clientInsurance.service.js';
import { intakeDiagnoses } from './intakeDraftReview.service.js';
import { scheduleFromIntake } from '../utils/clientExchangeSchedule.js';
import pool from '../config/database.js';
import clinicalPool from '../config/clinicalDatabase.js';
import { summaryItems } from '../utils/clientExchangeSummary.js';
import { explicitRecordedSex, intakeNotePresentingProblems, intakePresentingProblems, intakeRecordedSex, latestPresentingProblem, parseSummaryJson } from '../utils/clientCareSummary.js';
import { listBillingDiagnosesForClient } from './billingReportIngest.service.js';
import { decryptIntakeSubmissionRows } from './intakeResponsesEncryption.service.js';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';
import { screeningPresentingProblem } from './h0002ReviewDetails.js';
import { clientAge, exchangeInsuranceLabel } from '../utils/clientExchangeMatching.js';
import { exchangeSafeText } from '../utils/clientExchangePrivacy.js';
import { resolveExchangeLocation } from '../../../frontend/src/navigation/clientExchangeLocation.js';

async function optionalClinicalQuery(sql, params) {
  try { const [rows] = await clinicalPool.execute(sql, params); return rows; }
  catch (error) { if (error.code === 'ER_NO_SUCH_TABLE') return []; throw error; }
}

async function intakeConcerns(clientId) {
  const [rows] = await pool.execute(`SELECT s.id, s.client_id, s.intake_data, s.submitted_at, s.created_at,
      s.payload_encrypted, s.payload_iv_b64, s.payload_auth_tag_b64, s.payload_key_id,
      l.intake_fields, l.intake_steps
    FROM intake_submissions s
    JOIN (
      SELECT direct.id FROM intake_submissions direct WHERE direct.client_id=? AND direct.submitted_at IS NOT NULL
      UNION
      SELECT linked.id FROM intake_submission_clients isc JOIN intake_submissions linked ON linked.id=isc.intake_submission_id
        WHERE isc.client_id=? AND linked.submitted_at IS NOT NULL
    ) client_submissions ON client_submissions.id=s.id
    LEFT JOIN intake_links l ON l.id=s.intake_link_id
    ORDER BY s.submitted_at DESC`, [clientId, clientId]);
  if (!rows.length) return [];
  decryptIntakeSubmissionRows(rows);
  const ids = rows.map(row => row.id);
  const [associations] = await pool.execute(`SELECT intake_submission_id, client_id FROM intake_submission_clients
    WHERE intake_submission_id IN (${ids.map(() => '?').join(',')}) ORDER BY id ASC`, ids);
  return rows.map(row => {
    const clientIds = associations.filter(a => Number(a.intake_submission_id) === Number(row.id)).map(a => a.client_id);
    return {
      values: intakePresentingProblems({ row, clientId, clientIds }),
      sex: intakeRecordedSex({ row, clientId, clientIds }),
      recordedAt: row.submitted_at || row.created_at
    };
  });
}

async function importedIntakeConcerns(clientId, agencyId) {
  const [rows] = await pool.execute(`SELECT note_sections_json_enc, session_context_enc, suggested_dx_json, confirmed_dx_json, diagnosis_action, status, finalized_at, updated_at, created_at
    FROM client_intake_note_drafts WHERE client_id = ? AND agency_id = ? AND status IN ('final', 'diagnosis_pending','draft','ready')
    ORDER BY COALESCE(finalized_at, updated_at, created_at) DESC`, [clientId, agencyId]);
  return rows.filter(row => row.status === 'final' ||
    ['client_creation_record_import','client_records_import'].includes(parseSummaryJson(maybeDecryptNotePayload(row.session_context_enc)).source)).map(row => {
    const suggested = parseSummaryJson(row.suggested_dx_json);
    const reviewed = row.status === 'final' || (['confirmed','updated'].includes(row.diagnosis_action) && intakeDiagnoses(row.confirmed_dx_json).length > 0);
    const confirmed = parseSummaryJson(row.confirmed_dx_json || row.suggested_dx_json);
    return {
      reviewedDiagnosisCodes: reviewed ? summaryItems(confirmed.diagnoses || confirmed.primary || confirmed).map(item => item.split(' — ')[0]) : [],
      importedDiagnoses: reviewed ? [] : summaryItems(suggested.diagnoses || suggested.primary || (suggested.code ? suggested : null)),
      source: row.status === 'final' ? 'Intake' : 'Intake (review pending)',
      values: intakeNotePresentingProblems(parseSummaryJson(maybeDecryptNotePayload(row.note_sections_json_enc))),
      recordedAt: row.finalized_at || row.updated_at || row.created_at
    };
  });
}

/** A single current summary for the chart overview, exchange, and match email. */
export async function loadClientExchangeSummary({ client, agencyId = client.agency_id, includePlanSharing = false }) {
  const params = [Number(agencyId), Number(client.id)];
  const [diagnoses, plans, intakes, intakeNotes, screenings] = await Promise.all([
    optionalClinicalQuery(`SELECT icd10_code, description FROM clinical_diagnoses
      WHERE agency_id = ? AND client_id = ? AND (is_active IS NULL OR is_active = 1)
      ORDER BY is_primary DESC, created_at DESC`, params),
    optionalClinicalQuery(`SELECT * FROM clinical_treatment_plans WHERE agency_id = ? AND client_id = ?
      AND (status = 'active' OR (status = 'draft' AND (source_tool_id = 'client_creation_record_import' OR source_tool_id LIKE 'client_records_import:%'))) ORDER BY updated_at DESC, created_at DESC`, params),
    intakeConcerns(Number(client.id)),
    importedIntakeConcerns(Number(client.id), Number(agencyId)),
    optionalClinicalQuery(`SELECT metadata_json,provider_signed_at,updated_at FROM clinical_notes
      WHERE agency_id=? AND client_id=? AND is_deleted=0
        AND JSON_UNQUOTE(JSON_EXTRACT(metadata_json,'$.source'))='h0002_digital_screening'
      ORDER BY updated_at DESC`, params)
  ]);
  const activePlan = plans.find(plan => plan.status === 'active');
  let treatmentPlanShared = null;
  if (includePlanSharing && activePlan) {
    const [deliveries] = await pool.execute(`SELECT 1 FROM treatment_plan_ack_links
      WHERE agency_id=? AND client_id=? AND treatment_plan_id=? AND status NOT IN ('cancelled','expired')
        AND (dashboard_visible=1 OR sent_at IS NOT NULL OR signed_at IS NOT NULL)
      LIMIT 1`, [...params, activePlan.id]);
    treatmentPlanShared = deliveries.length > 0;
  }
  const sourcePlan=plans.find(plan=>plan.status==='draft'&&String(plan.source_tool_id||'').startsWith('client_records_import:'));
  const importedPlan=sourcePlan?await readChartRecord({agencyId:Number(agencyId),clientId:Number(client.id)},`plan_source_${sourcePlan.id}`,0):null;
  const reviewedCodes = new Set((intakeNotes[0]?.reviewedDiagnosisCodes || []).map(code => String(code).toUpperCase()));
  const importedPlanDiagnoses = (importedPlan?.value?.parsed?.diagnoses || []).map(d => ({
    code: d.icd10Code || d.icd10_code || d.code,
    description: d.description
  })).filter(item => !reviewedCodes.has(String(item.code).toUpperCase()) &&
    !diagnoses.some(diagnosis=>String(diagnosis.icd10_code).toUpperCase()===String(item.code).toUpperCase()));
  const importedDiagnoses = summaryItems([...(intakeNotes[0]?.importedDiagnoses || []), ...importedPlanDiagnoses]);
  const billing = diagnoses.length ? [] : await listBillingDiagnosesForClient({ agencyId, clientId: client.id });
  const intake = parseSummaryJson(client.intake_preferences_json);
  const insuranceRecord=await readClientInsurance(client.id,agencyId);
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
  const sharedConcern = exchangeSafeText(intake.exchangeMatchingConcern, client);
  if (sharedConcern) {
    problem.presentingProblems = [sharedConcern];
    problem.presentingProblemSource = 'Matching concern';
    problem.presentingProblemUpdatedAt = intake.exchangeMatchingConcernUpdatedAt || null;
  }
  return {
    demographics: { ...(age == null ? (referral.age == null ? {} : { ageBand: String(referral.age) }) : { ageBand: String(age) }), ...((explicitRecordedSex(client.gender) || intakes.find(row => row.sex)?.sex) ? { gender: explicitRecordedSex(client.gender) || intakes.find(row => row.sex).sex } : {}) },
    importedDiagnoses,
    intakeDiagnosisPending: Boolean(intakeNotes[0]?.importedDiagnoses?.length),
    planDiagnosisPending: Boolean(importedPlanDiagnoses.length),
    intakeReviewStatus: intakeNotes[0]?.source === 'Intake (review pending)'
      ? 'draft' : intakeNotes.some(note => note.source === 'Intake') || intakes.length ? 'complete' : 'missing',
    treatmentPlanOnFile: !!activePlan,
    ...(includePlanSharing ? { treatmentPlanShared } : {}),
    diagnoses: summaryItems(diagnoses.length ? diagnoses : billing.length ? billing : referral.diagnoses),
    ...problem,
    preferences: {
      sharedMatchingConcern: sharedConcern || null,
      sharedSchedulingNotes: Object.hasOwn(intake, 'exchangeMatchingScheduleNotes') ? exchangeSafeText(intake.exchangeMatchingScheduleNotes, client) : null,
      insurance: exchangeInsuranceLabel(client.insurance_type_label, intake.insurance, intake.insuranceOrPayment, insuranceRecord?.primary?.insurerName),
      matchingPreferences: intake.matchingPreferences || null,
      modality: intake.preferredModality ? String(intake.preferredModality).toLowerCase() : null,
      ...resolveExchangeLocation(client, intake),
      schedule: scheduleFromIntake(intake, client.timezone), providerGender: intake.preferredProviderGender || null,
      providerQualification: Object.hasOwn(intake, 'providerQualification') ? intake.providerQualification : referral.providerQualification || null
    }
  };
}
