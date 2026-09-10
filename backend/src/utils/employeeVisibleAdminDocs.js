/**
 * Employee-visible application / hire document copies (from user_admin_docs).
 * Staff retain full admin docs; candidates see their own receipts and signed waivers.
 */

export const EMPLOYEE_VISIBLE_ADMIN_DOC_TYPES = [
  'application_receipt',
  'reference_release',
  'resume',
  'cover_letter',
  'application_material',
  'job_description_ack',
  'job_description_acknowledgement',
  'background_check_authorization',
  'company_document_signed'
];

export function isEmployeeVisibleAdminDocType(docType) {
  return EMPLOYEE_VISIBLE_ADMIN_DOC_TYPES.includes(String(docType || '').trim().toLowerCase());
}

/** Blank forms / assignments staff attach to the hire file — not candidate submissions. */
export const STAFF_TEMPLATE_ADMIN_DOC_TYPES = [
  'prehire_upload',
  'job_description_assignment'
];

const CANDIDATE_COMPLETED_COPY_TYPES = [
  ...EMPLOYEE_VISIBLE_ADMIN_DOC_TYPES,
  'prehire_company_document_ack',
  'job_description_acknowledgement'
];

/**
 * Materials the candidate actually submitted (resume, cover letter, signed copies).
 * Staff-attached blank templates stay off this list until the candidate uploads their copy.
 */
export function isCandidateSubmissionAdminDoc(doc, candidateUserId) {
  const type = String(doc?.doc_type || doc?.docType || '').trim().toLowerCase();
  const createdBy = Number(doc?.created_by_user_id || doc?.createdByUserId || 0);
  const uid = Number(candidateUserId || 0);
  if (type === 'prehire_upload') {
    return !!uid && createdBy === uid;
  }
  if (STAFF_TEMPLATE_ADMIN_DOC_TYPES.includes(type)) return false;
  if (!type) return !!doc?.storage_path;
  return CANDIDATE_COMPLETED_COPY_TYPES.includes(type);
}
