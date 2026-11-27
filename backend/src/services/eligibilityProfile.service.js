import pool from '../config/database.js';
import {paperInsuranceIsReviewed} from '../utils/paperInsuranceReviewGate.js';
import { decryptFamilyBilling } from './familyBillingEncryption.service.js';
import { readClientInsurance, writeClientInsurance } from './clientInsurance.service.js';
import { coverageFingerprint, summarizeEligibility, eligibilityIdentityMatches } from './coverageVerification.service.js';
import { medicaidMemberIdNeedsDiscovery, clientSubscriber } from '../../../frontend/src/navigation/paperInsuranceReview.js';
import { auditBilling } from './familyBillingPolicy.service.js';
import {eligibilityPolicyFields,eligibilityPolicyDetails,otherInsuranceBenefit} from '../utils/eligibilityPolicyDetails.js';
export {otherInsuranceBenefit} from '../utils/eligibilityPolicyDetails.js';

const list = value => Array.isArray(value) ? value : value ? [value] : [];

/** Preserve every returned field. Unknown fields remain payer evidence, never
 * guessed member IDs, billing routes, or primary/secondary assignments. */
export function eligibilityProfileRecord(check, evidence, fingerprint=null) {
  const entries = list(evidence?.result?.elig || evidence?.result?.result?.elig);
  const summary = evidence?.result ? summarizeEligibility(evidence.result, { payerId: evidence.eligibilityPayerId,serviceDate:check.service_date }) : evidence?.summary;
  return {
    id: check.id, slot: check.policy_slot, serviceDate: check.service_date,isCurrent:fingerprint?check.insurance_fingerprint===fingerprint:null,
    checkedAt: check.completed_at || check.created_at, payerId: evidence?.eligibilityPayerId || '',
    status: summary?.status || check.status, identityMatches: evidence?.summary?.identityMatches ?? null,
    otherCoverageReported: !!(summary?.otherCoverageReported || evidence?.summary?.otherCoverageReported),
    details:eligibilityPolicyDetails(evidence?.result,{payerId:evidence?.eligibilityPayerId,serviceDate:check.service_date}),
    otherInsurers: entries.flatMap(entry => list(entry.benefit).filter(benefit => otherInsuranceBenefit(benefit, evidence?.eligibilityPayerId))),
    // Include the complete response, including carrier-specific fields and errors.
    response: evidence?.result || null, reference: summary?.reference || null
  };
}

export async function readEligibilityProfile({ agencyId, clientId, fingerprint=null }, db = pool) {
  const [checks] = await db.execute('SELECT id,policy_slot,service_date,status,created_at,completed_at,insurance_fingerprint,evidence_encrypted FROM client_coverage_checks WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 100', [agencyId, clientId]);
  return checks.map(check => eligibilityProfileRecord(check, decryptFamilyBilling(check.evidence_encrypted, `coverage:${agencyId}:${clientId}`),fingerprint));
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
    const child=next.patient;
    const childDiscovery=result.eligibilityPayerId==='SKCO0'&&result.lookupMode==='demographics'
      &&medicaidMemberIdNeedsDiscovery(previous,child)&&/^[A-Z]\d{6}$/i.test(String(entry.ins_number||''))
      &&!!child?.firstName&&!!child?.lastName&&!!child?.dateOfBirth
      &&eligibilityIdentityMatches({payerid:'SKCO0',ins_name_f:child.firstName,ins_name_l:child.lastName,ins_dob:child.dateOfBirth.replaceAll('-','')},result.result)===true;
    if(previous.memberId && String(previous.memberId).trim()!==String(entry.ins_number||'').trim()&&!childDiscovery)continue;
    const fields = eligibilityPolicyFields(entry,result.eligibilityPayerId);
    // Ranged or ambiguous dates are retained in the response, not reinterpreted.
    const policy = { ...previous };
    if(childDiscovery) {
      policy.paperReportedMemberId ||= previous.memberId || '';
      policy.paperSubscriberName ||= previous.subscriberName || [previous.subscriberFirstName,previous.subscriberLastName].filter(Boolean).join(' ');
      policy.memberId=String(entry.ins_number).trim();
      Object.assign(policy,clientSubscriber(child));
      policy.subscriberName=[child.firstName,child.lastName].join(' ');
    }
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
    if(!paperInsuranceIsReviewed(insurance)){await db.rollback();return false;}
    if (!insurance || coverageFingerprint(insurance) !== expectedFingerprint) { await db.rollback(); return false; }
    const enriched = enrichInsuranceFromEligibility(insurance, results);
    if (coverageFingerprint(enriched) === expectedFingerprint) { await db.rollback(); return false; }
    const sources=eligibilityImportSources(insurance,enriched,results);
    const saved=await (deps.writeInsurance || writeClientInsurance)({ ...enriched, agencyId, clientId, verifiedForClaims: false, queueEligibility: false, preservePaperReview:true }, db,{eligibilityFieldSources:sources});
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

export function eligibilityImportSources(previous,next,results) {
 const sources={};
 for(const {slot,result} of results) {
  if(!result.id||result.summary?.identityMatches!==true)continue;
  for(const [field,value] of Object.entries(next[slot]||{}))if(value&&value!==previous?.[slot]?.[field]) {
   (sources[slot]||={})[field]={checkId:Number(result.id),serviceDate:result.serviceDate||null,checkedAt:result.checkedAt||null,source:'Claim.MD',value};
  }
 }
 return sources;
}
