import pool from '../config/database.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint, summarizeEligibility } from './coverageVerification.service.js';
import { auditBilling } from './familyBillingPolicy.service.js';

const list = value => Array.isArray(value) ? value : value ? [value] : [];
export const otherInsuranceBenefit = (benefit, payerId) =>
  String(benefit.benefit_coverage_code) === 'R'
  || (payerId === 'SKCO0' && String(benefit.benefit_coverage_code) === 'U')
  || ['PRP', 'SEP', 'TTP'].includes(String(benefit.entity_code));

/** Preserve every returned field. Unknown fields remain payer evidence, never
 * guessed member IDs, billing routes, or primary/secondary assignments. */
export function eligibilityProfileRecord(check, evidence) {
  const entries = list(evidence?.result?.elig || evidence?.result?.result?.elig);
  const summary = evidence?.result ? summarizeEligibility(evidence.result, { payerId: evidence.eligibilityPayerId }) : evidence?.summary;
  return {
    id: check.id, slot: check.policy_slot, serviceDate: check.service_date,
    checkedAt: check.completed_at || check.created_at, payerId: evidence?.eligibilityPayerId || '',
    status: summary?.status || check.status, identityMatches: evidence?.summary?.identityMatches ?? null,
    otherCoverageReported: !!(summary?.otherCoverageReported || evidence?.summary?.otherCoverageReported),
    otherInsurers: entries.flatMap(entry => list(entry.benefit).filter(benefit => otherInsuranceBenefit(benefit, evidence?.eligibilityPayerId))),
    // Include the complete response, including carrier-specific fields and errors.
    response: evidence?.result || null, reference: summary?.reference || null
  };
}

export async function readEligibilityProfile({ agencyId, clientId }, db = pool) {
  const [checks] = await db.execute('SELECT id,policy_slot,service_date,status,created_at,completed_at,evidence_encrypted FROM client_coverage_checks WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 100', [agencyId, clientId]);
  return checks.map(check => eligibilityProfileRecord(check, decryptFamilyBilling(check.evidence_encrypted, `coverage:${agencyId}:${clientId}`)));
}

function date(value) {
  const raw = String(value || '').replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  return /^\d{4}-\d{2}-\d{2}$/.test(raw) && Number.isFinite(Date.parse(raw)) && new Date(raw).toISOString().slice(0,10) === raw ? raw : '';
}
export function enrichInsuranceFromEligibility(insurance, results) {
  const next = structuredClone(insurance);
  for (const { slot, result } of results) {
    if (!['primary', 'secondary'].includes(slot) || result.summary?.status !== 'active_reported' || result.summary?.identityMatches !== true) continue;
    const entries = list(result.result?.elig || result.result?.result?.elig);
    if (entries.length !== 1 || list(entries[0].error).length) continue;
    const entry = entries[0], previous = next[slot] || {};
    if(previous.memberId && String(previous.memberId).trim()!==String(entry.ins_number||'').trim())continue;
    const fields = { memberId: entry.ins_number, groupNumber: entry.group_number,
      subscriberFirstName: entry.ins_name_f, subscriberLastName: entry.ins_name_l,
      subscriberDob: date(entry.ins_dob), subscriberSex: entry.ins_sex,
      subscriberAddressLine1: entry.ins_addr_1, subscriberCity: entry.ins_city,
      subscriberState: entry.ins_state, subscriberPostalCode: entry.ins_zip };
    // Ranged or ambiguous dates are retained in the response, not reinterpreted.
    fields.effectiveDate = date(entry.plan_begin_date);
    fields.terminationDate = date(entry.plan_end_date);
    const policy = { ...previous };
    for (const [key, value] of Object.entries(fields)) if (!policy[key] && typeof value === 'string' && value.trim() && value.length <= 255) policy[key] = value.trim();
    if (result.eligibilityPayerId === 'SKCO0') {
      policy.eligibilityPayerId = 'SKCO0';
      policy.isMedicaid = true;
      if (!policy.insurerName) policy.insurerName = 'Colorado Medicaid';
      if (!policy.planType) policy.planType = 'Medicaid';
      if (!policy.relationshipToSubscriber) policy.relationshipToSubscriber = 'self';
    }
    const self=policy.relationshipToSubscriber==='self',prefix=self?'ins':'pat';
    const patientFields={firstName:entry[`${prefix}_name_f`],lastName:entry[`${prefix}_name_l`],dateOfBirth:date(entry[`${prefix}_dob`]),sex:entry[`${prefix}_sex`],addressLine1:entry[`${prefix}_addr_1`],city:entry[`${prefix}_city`],state:entry[`${prefix}_state`],postalCode:entry[`${prefix}_zip`]};
    next.patient ||= {};
    for(const [key,value] of Object.entries(patientFields))if(!next.patient[key] && typeof value==='string' && value.trim() && value.length<=255)next.patient[key]=value.trim();
    next[slot] = policy;
  }
  return next;
}

/** Import all checked slots together, under the same client lock. Never overwrite
 * a staff edit made while a payer request was in flight. No new payer inquiry. */
export async function applyEligibilityProfileResults({ agencyId, clientId, expectedFingerprint, results, actorUserId }, deps = {}) {
  const db = await (deps.db || pool).getConnection();
  try {
    await db.beginTransaction();
    const [[client]] = await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    if (!client) { await db.rollback(); return false; }
    const insurance = await (deps.readInsurance || readClientInsurance)(clientId, agencyId, db);
    if (!insurance || coverageFingerprint(insurance) !== expectedFingerprint) { await db.rollback(); return false; }
    const enriched = enrichInsuranceFromEligibility(insurance, results);
    if (coverageFingerprint(enriched) === expectedFingerprint) { await db.rollback(); return false; }
    const saved=await (deps.writeInsurance || writeClientInsurance)({ ...enriched, agencyId, clientId, verifiedForClaims: false, queueEligibility: false }, db);
    // These fields came from these exact responses. Keep that evidence usable
    // after importing it; do not spend another inquiry merely to verify the import.
    // The original request fingerprint remains in the immutable encrypted evidence.
    const importedFingerprint=coverageFingerprint(saved || enriched);
    for(const {slot,result} of results) if(result.id && result.summary?.identityMatches===true) {
      await db.execute("UPDATE client_coverage_checks SET insurance_fingerprint=? WHERE id=? AND agency_id=? AND client_id=? AND policy_slot=? AND insurance_fingerprint=? AND status='returned'",[importedFingerprint,result.id,agencyId,clientId,slot,expectedFingerprint]);
    }
    await auditBilling({ agencyId, clientId, userId: actorUserId, action: 'insurance_fields_from_eligibility', objectId: results[0]?.result?.id }, db);
    await db.commit(); return true;
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}
