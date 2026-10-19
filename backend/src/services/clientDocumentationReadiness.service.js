import crypto from 'node:crypto';
import pool from '../config/database.js';
import { billingError, auditBilling, positiveId } from './familyBillingPolicy.service.js';
import { encryptFamilyBilling, decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { coverageDate } from './coverageVerification.service.js';

const parse = value => typeof value === 'string' ? JSON.parse(value || '{}') : value || {};
const canonical = value => value instanceof Date ? value.toISOString() : Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const context = (agencyId, clientId) => `client-documentation:${agencyId}:${clientId}`;
export function documentationScope(serviceCodes = []) {
  return serviceCodes.length && serviceCodes.every(code => String(code).trim().toUpperCase() === 'H0002') ? 'screening' : 'treatment';
}
function validScope(scope) {
  if (!['screening', 'treatment'].includes(scope)) throw billingError(400, 'Choose screening or treatment documentation');
  return scope;
}
export const documentationSourceHash = source => crypto.createHash('sha256').update(JSON.stringify(canonical(source))).digest('hex');

/** Only document metadata is read here. Receipt counts never become an attestation.
 * Assignment, insurance and clinical note edits do not alter this snapshot. */
export async function documentationSnapshot({ agencyId, clientId }, db = pool) {
  const [[client]] = await db.execute(`SELECT id,agency_id,source,document_status,onboarding_docs_json,roi_expires_at,paperwork_received_at
    FROM clients WHERE id=? AND agency_id=?`, [clientId, agencyId]);
  if (!client) throw billingError(404, 'Client not found');
  client.onboarding_docs_json = parse(client.onboarding_docs_json);
  const [files] = await db.execute(`SELECT id,updated_at,removed_at,expires_at FROM client_phi_documents
    WHERE client_id=? AND agency_id=? ORDER BY id`, [clientId, agencyId]);
  const [forms] = await db.execute(`SELECT d.id,d.document_template_id,d.signed_at,d.pdf_hash,d.updated_at,
    (d.signed_pdf_path IS NOT NULL AND d.signed_pdf_path<>'') AS file_available
    FROM intake_submission_documents d JOIN intake_submissions s ON s.id=d.intake_submission_id
    WHERE d.client_id=? OR (d.client_id IS NULL AND s.client_id=?
      AND NOT EXISTS(SELECT 1 FROM intake_submission_clients siblings WHERE siblings.intake_submission_id=s.id AND siblings.client_id<>?))
    ORDER BY d.id`, [clientId, clientId, clientId]);
  const [paperwork] = await db.execute(`SELECT p.id,p.status_key,p.label,p.updated_at AS requirement_updated_at,
    i.is_needed,i.received_at,i.received_by_user_id,i.updated_at
    FROM paperwork_statuses p LEFT JOIN client_paperwork_items i ON i.paperwork_status_id=p.id AND i.client_id=?
    WHERE p.agency_id=? AND p.is_active=1 ORDER BY p.id`, [clientId, agencyId]);
  return { sourceHash: documentationSourceHash({ client, files, forms, paperwork }),
    evidence: { uploadedFiles: files.filter(file => !file.removed_at).length,
      signedForms: forms.filter(form => form.signed_at && form.file_available).length,
      paperwork: paperwork.map(item => ({ key: item.status_key, label: item.label, status: item.is_needed == null ? 'not_reviewed' : Number(item.is_needed) ? 'needed' : 'received' })),
      roiExpiresAt: client.roi_expires_at || null } };
}

export function documentationReviewState({ scope, sourceHash, review, serviceDate }) {
  validScope(scope);
  const date = coverageDate(serviceDate), label = scope === 'screening' ? 'screening' : 'treatment intake';
  let status = 'not_reviewed', blocker = `Review and verify the applicable ${label} documentation before claim submission`;
  if (review) {
    if (review.review_scope !== scope || review.source_hash !== sourceHash) { status = 'changed'; blocker = 'Client documents or requirements changed; repeat documentation review'; }
    else if (review.status !== 'verified') { status = 'incomplete'; blocker = `Resolve the outstanding ${label} documentation`; }
    else if (coverageDate(review.effective_from) > date || review.effective_through && coverageDate(review.effective_through) < date) { status = 'outside_dates'; blocker = 'Documentation review does not cover this service date'; }
    else { status = 'verified'; blocker = null; }
  }
  return { scope, status, ready: !blocker, blockers: blocker ? [blocker] : [], sourceHash,
    reviewId: review?.id || null, effectiveFrom: review?.effective_from || null, effectiveThrough: review?.effective_through || null,
    reviewedAt: review?.created_at || null, reviewedByUserId: review?.created_by_user_id || null };
}

export async function getClientDocumentationReadiness({ agencyId, clientId, scope = 'treatment', serviceDate }, db = pool) {
  validScope(scope);
  const snapshot = await documentationSnapshot({ agencyId, clientId }, db);
  const [[review]] = await db.execute('SELECT * FROM client_documentation_reviews WHERE agency_id=? AND client_id=? AND review_scope=? ORDER BY id DESC LIMIT 1', [agencyId, clientId, scope]);
  return { ...documentationReviewState({ scope, sourceHash: snapshot.sourceHash, review, serviceDate }), evidence: snapshot.evidence,
    review: review ? decryptFamilyBilling(review.evidence_encrypted, context(agencyId, clientId)) : null };
}

export async function saveClientDocumentationReview(input, deps = {}) {
  const agencyId = positiveId(input.agencyId), clientId = positiveId(input.clientId), actorUserId = positiveId(input.actorUserId), scope = validScope(input.scope);
  const effectiveFrom = coverageDate(input.effectiveFrom), effectiveThrough = input.effectiveThrough ? coverageDate(input.effectiveThrough) : null;
  if (effectiveThrough && effectiveThrough < effectiveFrom) throw billingError(400, 'The documentation end date must follow its start date');
  const reference = String(input.reference || '').trim();
  if (!['verified','incomplete'].includes(input.status) || reference.length < 10 || reference.length > 2000) throw billingError(400, 'Record the documentation outcome and supporting document references or missing items');
  if (input.status === 'verified' && (input.authorityReviewed !== true || input.requiredDocumentsReviewed !== true)) throw billingError(409, 'Review consent/authority and all documents applicable to this service stage');
  const db = await (deps.pool || pool).getConnection();
  try {
    await db.beginTransaction();
    const [[client]] = await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    if (!client) throw billingError(404, 'Client not found');
    const snapshot = await (deps.snapshot || documentationSnapshot)({ agencyId, clientId }, db);
    const [[latest]] = await db.execute('SELECT id FROM client_documentation_reviews WHERE agency_id=? AND client_id=? AND review_scope=? ORDER BY id DESC LIMIT 1 FOR UPDATE', [agencyId, clientId, scope]);
    if (input.sourceHash !== snapshot.sourceHash || Number(input.previousReviewId || 0) !== Number(latest?.id || 0)) throw billingError(409, 'Documentation or its review changed; refresh before saving');
    const evidence = { reference, authorityReviewed: input.authorityReviewed === true, requiredDocumentsReviewed: input.requiredDocumentsReviewed === true };
    const [row] = await db.execute(`INSERT INTO client_documentation_reviews
      (agency_id,client_id,review_scope,status,effective_from,effective_through,source_hash,evidence_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?,?,?,?)`,
    [agencyId, clientId, scope, input.status, effectiveFrom, effectiveThrough, snapshot.sourceHash, encryptFamilyBilling(evidence, context(agencyId, clientId)), actorUserId]);
    await auditBilling({ agencyId, clientId, userId: actorUserId, action: 'client_documentation_reviewed', objectId: row.insertId }, db);
    await db.commit(); return { id: row.insertId, status: input.status };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
