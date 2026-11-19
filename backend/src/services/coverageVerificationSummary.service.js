import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import pool from '../config/database.js';
import {coverageInsuranceFingerprint} from '../utils/paperInsuranceReviewGate.js';
export async function latestPayerResponses({agencyId, clientId}, insurance, db=pool) {
  if (!insurance?.primary && !insurance?.secondary) return {};
  const [rows] = await db.execute(`SELECT c.policy_slot,c.status,c.completed_at,c.service_date,c.evidence_encrypted
    FROM client_coverage_checks c JOIN (SELECT MAX(id) AS id FROM client_coverage_checks
    WHERE agency_id=? AND client_id=? AND insurance_fingerprint=? GROUP BY policy_slot) latest ON latest.id=c.id`,
  [agencyId, clientId, coverageInsuranceFingerprint(insurance)]);
  return Object.fromEntries(rows.map(check => {
    const evidence = check.evidence_encrypted ? decryptFamilyBilling(check.evidence_encrypted, `coverage:${agencyId}:${clientId}`) : null;
    const verified = check.status === 'returned' && evidence?.summary?.status === 'active_reported' && evidence.summary.identityMatches === true;
    return [check.policy_slot, {verified, checkedAt:check.completed_at, serviceDate:check.service_date, status:evidence?.summary?.status || check.status}];
  }));
}

/** Nonfinancial chart metadata; source-paste eligibility is never payer verification. */
export async function readCoverageVerificationSummary({agencyId,clientId},insurance,db=pool,now=new Date()) {
 if(!insurance?.primary&&!insurance?.secondary)return null;
 const [[row]]=await db.execute(`SELECT status,service_date,created_at,insurance_fingerprint,
  EXISTS(SELECT 1 FROM client_coverage_checks c WHERE c.agency_id=r.agency_id AND c.client_id=r.client_id AND (c.id>r.through_check_id OR c.completed_at>r.created_at)) AS new_evidence,
  EXISTS(SELECT 1 FROM stedi_insurance_discoveries d WHERE d.agency_id=r.agency_id AND d.client_id=r.client_id AND (d.review_required=1 OR d.status IN ('sending','pending','unknown'))) AS pending_discovery
  FROM client_coverage_reviews r WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 1`,[agencyId,clientId]);
 if(!row||row.status!=='verified')return {current:false,verifiedAt:null,status:row?.status||'not_verified'};
 const age=now-new Date(row.created_at);
 return {verifiedAt:row.created_at,serviceDate:String(row.service_date instanceof Date?row.service_date.toISOString():row.service_date).slice(0,10),
  current:row.insurance_fingerprint===coverageInsuranceFingerprint(insurance)&&!Number(row.new_evidence)&&!Number(row.pending_discovery)&&age>=0&&age<=7*86400000};
}
