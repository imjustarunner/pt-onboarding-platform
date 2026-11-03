import { createHash } from 'node:crypto';
import { maybeDecryptNotePayload } from './clinicalNoteCrypto.service.js';

export function intakeDraftContext(row) {
  const raw = maybeDecryptNotePayload(row?.session_context_enc);
  try { const value = JSON.parse(raw || '{}'); return value && typeof value === 'object' && !Array.isArray(value) ? value : { originalContext: value }; }
  catch { return raw ? { originalContext: raw } : {}; }
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
  if (!review.sourceText || !keys.length || request?.fingerprint !== review.fingerprint
    || request?.sourceCompared !== true || request?.unsupportedClaimsRemoved !== true
    || request?.appointmentReviewed !== true || keys.some(key => !selected.has(key))) {
    throw Object.assign(new Error('Open the intake note in the client chart and review every section against its source before finalizing. Remove unsupported observations, denials, risk findings and diagnoses; check the appointment link. Editing or regenerating the draft requires a new review.'), { status: 409, code: 'INTAKE_SOURCE_REVIEW_REQUIRED' });
  }
  return review;
}
