import pool from '../config/database.js';
import { superviseeBillingAllowed } from '../utils/superviseePayerEligibility.js';

const clinicalDay = value => value instanceof Date ? Number.isFinite(value.getTime()) ? value.toISOString().slice(0, 10) : 'invalid' : String(value || '').slice(0, 10);
const validClinicalDay = value => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
export function isActiveCredentialPayerRow(row, { asOfDate, requireVerifiedPayer = true } = {}) {
  const today = clinicalDay(asOfDate || new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Denver' }).format(new Date()));
  const status = row?.credential_status ?? row?.credentialStatus ?? row?.status;
  const effective = clinicalDay(row.effective_date ?? row.effectiveDate);
  const revalidation = clinicalDay(row.revalidation_due ?? row.revalidationDue);
  if (!validClinicalDay(today) || !validClinicalDay(effective) || revalidation && !validClinicalDay(revalidation)) return false;
  if (requireVerifiedPayer && (!row?.billing_payer_id || !row?.billing_payer_name)) return false;
  // Existing credential records predate workflow tracking. Their recorded
  // effective date remains evidence; adding tracking must not silently remove
  // every established credential. An explicit later status always wins.
  if (status ? status !== 'active' : !effective) return false;
  return (!effective || effective <= today) && (!revalidation || revalidation >= today);
}

// The billing catalog owns electronic routes. A credential can retain its
// contract name while explicitly linking to the agency's verified billing payer.
export async function credentialPayerRows(userId, agencyId = null, db = pool) {
  const [rows] = await db.execute(`SELECT uic.*, icd.id AS insurance_definition_id,
    icd.name, icd.name AS insurance_name, icd.logo_path, icd.logo_path AS insurance_logo_path,
    icd.parent_id AS insurance_parent_id, parent.name AS parent_name, link.payer_id AS billing_payer_id,
    tracking.status AS credential_status, tracking.revalidation_due,
    (SELECT MAX(r.payer_name) FROM medical_payer_setup_requests r
      JOIN medical_payer_setup_details d ON d.request_id=r.id
      WHERE r.agency_id=icd.agency_id AND d.claimmd_payer_id=link.payer_id AND d.directory_status='id_match') AS billing_payer_name,
    (SELECT MAX(d.directory_name) FROM medical_payer_setup_requests r
      JOIN medical_payer_setup_details d ON d.request_id=r.id
      WHERE r.agency_id=icd.agency_id AND d.claimmd_payer_id=link.payer_id AND d.directory_status='id_match') AS directory_name
    FROM user_insurance_credentialing uic
    JOIN insurance_credentialing_definitions icd ON icd.id=uic.insurance_credentialing_definition_id
    LEFT JOIN insurance_credentialing_definitions parent ON parent.id=icd.parent_id AND parent.agency_id=icd.agency_id
    LEFT JOIN credentialing_payer_links link ON link.insurance_definition_id=icd.id AND link.agency_id=icd.agency_id
    LEFT JOIN credentialing_workflow_tracking tracking ON tracking.agency_id=icd.agency_id
      AND tracking.subject_type='provider' AND tracking.credential_id=uic.id
    WHERE uic.user_id=?${agencyId == null ? '' : ' AND icd.agency_id=?'}
    ORDER BY icd.sort_order,icd.name`, agencyId == null ? [userId] : [userId, agencyId]);
  return rows;
}

export function evaluateCredentialPayerEligibility(rows, payerId) {
  const matches = rows.filter(row => row.billing_payer_name && String(row.billing_payer_id).toUpperCase() === String(payerId || '').trim().toUpperCase());
  if (!matches.length) return { allowed: false, credentialIds: [], reason: 'Link the billing supervisor’s payer credential to this verified billing payer in Credentialing Management before billing a supervisee.' };
  if (!matches.every(row => isActiveCredentialPayerRow(row))) return { allowed: false, credentialIds: matches.map(row => row.id), reason: 'Confirm an active, current payer credential in Credentialing Management before billing a supervisee.' };
  // Contradictory duplicate mappings require review rather than selecting a permissive record.
  const allowed = matches.every(superviseeBillingAllowed);
  return { allowed, credentialIds: matches.map(row => row.id), reason: allowed ? null : 'This supervisor’s payer credential is not enabled for supervisee billing. Review the credential’s supervisee billing setting.' };
}

export async function checkSuperviseePayerEligibility({ agencyId, supervisorId, payerId }, db = pool) {
  return evaluateCredentialPayerEligibility(await credentialPayerRows(supervisorId, agencyId, db), payerId);
}
