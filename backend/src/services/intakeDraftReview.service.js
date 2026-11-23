import { importedClinicalSourceDate } from '../utils/importedClinicalSourceDate.js';
import { createHash } from 'node:crypto';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

export function intakeDraftContext(row) {
  const raw = maybeDecryptNotePayload(row?.session_context_enc);
  try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : { originalContext: value }; }
  catch { return raw ? { originalContext: raw } : {}; }
}

export const isImportedIntake = context => ['client_records_import', 'client_creation_record_import'].includes(context?.source);

export function intakeDiagnoses(value) {
  let data = value;
  try { if (typeof data === 'string') data = JSON.parse(data); } catch { return []; }
  const rows = Array.isArray(data?.diagnoses) && data.diagnoses.length ? data.diagnoses : [data?.primary || data];
  return rows.filter(row => String(row?.code || row?.icd10Code || '').trim()).map(row => ({
    ...row, code: String(row.code || row.icd10Code).trim()
  }));
}

/** Chart metadata only: document timestamps never establish a date of service. */
export function intakeDraftChartSummary(row, sessions = []) {
  const context = intakeDraftContext(row);
  const imported = isImportedIntake(context);
  const session = !imported && sessions.find(s => Number(s.id) === Number(context.clinicalSessionId)
    && Number(s.agency_id) === Number(row.agency_id)
    && String(s.service_code || '').toUpperCase() === String(row.service_code || '').toUpperCase());
  return {
    id: row.id, status: row.status, service_code: row.service_code,
    records_import: imported, non_billable: imported || context.nonBillable === true,
    created_at: row.created_at, updated_at: row.updated_at, finalized_at: row.finalized_at || null,
    clinical_session_id: session?.id || null,
    scheduled_start_at: session?.scheduled_start_at || null,
    date_of_service: /^\d{4}-\d{2}-\d{2}$/.test(context.dateOfService || '') ? context.dateOfService : imported ? importedClinicalSourceDate(maybeDecryptNotePayload(row.scrubbed_input_enc)) : null
  };
}

/** Bind a clinician's review to the actual source, generated text and diagnosis, not a 'ready' label. */
export function intakeDraftReview(row, sections) {
  const sourceText = String(maybeDecryptNotePayload(row?.scrubbed_input_enc) || '').trim();
  const fingerprint = createHash('sha256').update(JSON.stringify([
    row?.id, row?.client_id, row?.agency_id, row?.provider_user_id, row?.service_code,
    sourceText, maybeDecryptNotePayload(row?.note_body_enc), sections,
    row?.suggested_dx_json, row?.confirmed_dx_json, row?.diagnosis_action
  ])).digest('hex');
  const saved = intakeDraftContext(row).sourceReview;
  return {
    fingerprint,
    sourceText,
    required: row?.status !== 'final',
    reviewedAt: saved?.fingerprint === fingerprint ? saved.reviewedAt : null,
    reviewedByUserId: saved?.fingerprint === fingerprint ? saved.reviewedByUserId : null,
    clinicalSessionId: intakeDraftContext(row).clinicalSessionId || null,
    appointmentId: intakeDraftContext(row).appointmentId || null
  };
}

export function validateIntakeDraftReview(row, sections, request) {
  const review = intakeDraftReview(row, sections);
  const keys = sections.map(section => section.key);
  const selected = new Set(Array.isArray(request?.sectionKeys) ? request.sectionKeys : []);
  const imported = isImportedIntake(intakeDraftContext(row));
  const reviewedSections = request?.allSectionsReviewed === true || keys.every(key => selected.has(key));
  if (!review.sourceText || !keys.length || request?.fingerprint !== review.fingerprint
    || request?.sourceCompared !== true || request?.unsupportedClaimsRemoved !== true
    || (!imported && request?.appointmentReviewed !== true) || !reviewedSections) {
    throw Object.assign(new Error('Open the intake note in the client chart and review the complete note against its source before finalizing. If the note is linked to a service, review its appointment. Changes to the note or diagnosis require a fresh review.'), { status: 409, code: 'INTAKE_SOURCE_REVIEW_REQUIRED' });
  }
  return review;
}
