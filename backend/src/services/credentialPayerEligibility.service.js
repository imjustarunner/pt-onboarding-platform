import pool from '../config/database.js';
import { superviseeBillingAllowed } from '../utils/superviseePayerEligibility.js';

// The billing catalog owns electronic routes. A credential can retain its
// contract name while explicitly linking to the agency's verified billing payer.
export async function credentialPayerRows(userId, agencyId = null, db = pool) {
  const [rows] = await db.execute(`SELECT uic.*, icd.id AS insurance_definition_id,
    icd.name, icd.name AS insurance_name, icd.logo_path, icd.logo_path AS insurance_logo_path,
    icd.parent_id AS insurance_parent_id, parent.name AS parent_name, link.payer_id AS billing_payer_id,
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
    WHERE uic.user_id=?${agencyId == null ? '' : ' AND icd.agency_id=?'}
    ORDER BY icd.sort_order,icd.name`, agencyId == null ? [userId] : [userId, agencyId]);
  return rows;
}

export function evaluateCredentialPayerEligibility(rows, payerId) {
  const matches = rows.filter(row => row.billing_payer_name && String(row.billing_payer_id).toUpperCase() === String(payerId || '').trim().toUpperCase());
  if (!matches.length) return { allowed: false, credentialIds: [], reason: 'Link the billing supervisor’s payer credential to this verified billing payer in Credentialing Management before billing a supervisee.' };
  // Contradictory duplicate mappings require review rather than selecting a permissive record.
  const allowed = matches.every(superviseeBillingAllowed);
  return { allowed, credentialIds: matches.map(row => row.id), reason: allowed ? null : 'This supervisor’s payer credential is not enabled for supervisee billing. Review the credential’s supervisee billing setting.' };
}

export async function checkSuperviseePayerEligibility({ agencyId, supervisorId, payerId }, db = pool) {
  return evaluateCredentialPayerEligibility(await credentialPayerRows(supervisorId, agencyId, db), payerId);
}
