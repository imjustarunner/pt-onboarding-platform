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
