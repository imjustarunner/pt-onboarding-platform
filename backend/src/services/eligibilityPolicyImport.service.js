import pool from '../config/database.js';
import {billingError,auditBilling} from './familyBillingPolicy.service.js';
import {readClientInsurance,writeClientInsurance} from './clientInsurance.service.js';
import {decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {coverageInsuranceFingerprint,paperInsuranceIsReviewed} from '../utils/paperInsuranceReviewGate.js';
import {eligibilityPolicyDetails} from '../utils/eligibilityPolicyDetails.js';
import {enrichInsuranceFromEligibility,eligibilityImportSources} from './eligibilityProfile.service.js';

// Reuse one retained response. This path has no clearinghouse credentials and
// cannot send another paid eligibility inquiry.
export async function importSavedEligibilityPolicy({agencyId,clientId,checkId,mode='fill_missing',slot,candidateId,expectedFingerprint,actorUserId},deps={}) {
 if(!Number.isSafeInteger(checkId)||checkId<=0||!['fill_missing','reported_coverage'].includes(mode)||!/^[a-f0-9]{64}$/.test(expectedFingerprint||''))throw billingError(400,'Choose a saved verification and reload the current insurance details');
 if(mode==='reported_coverage'&&(!['primary','secondary'].includes(slot)||!/^\d+:\d+:\d+$/.test(candidateId||'')))throw billingError(400,'Choose a reported insurer and a primary or secondary draft position');
 const db=await (deps.pool||pool).getConnection();
 try {
  await db.beginTransaction();
  const [[client]]=await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[clientId,agencyId]);
  if(!client)throw billingError(404,'Client not found');
  const insurance=await (deps.readInsurance||readClientInsurance)(clientId,agencyId,db),fingerprint=coverageInsuranceFingerprint(insurance);
  if(fingerprint!==expectedFingerprint||!paperInsuranceIsReviewed(insurance))throw billingError(409,'Insurance or its source review changed. Reload the current insurance before importing this response');
  const [[check]]=await db.execute('SELECT id,policy_slot,service_date,completed_at,created_at,status,insurance_fingerprint,evidence_encrypted FROM client_coverage_checks WHERE id=? AND agency_id=? AND client_id=?',[checkId,agencyId,clientId]);
  if(!check)throw billingError(404,'Saved verification not found for this client');
  if(check.status!=='returned'||check.insurance_fingerprint!==fingerprint)throw billingError(409,'This verification is historical or does not match the current insurance. Reconcile the current policy before importing');
  const evidence=decryptFamilyBilling(check.evidence_encrypted,`coverage:${agencyId}:${clientId}`);
  if(evidence?.summary?.identityMatches!==true||!evidence.result)throw billingError(409,'Confirm the returned client identity before importing policy details');
  const result={...evidence,id:check.id,serviceDate:check.service_date,checkedAt:check.completed_at||check.created_at};
  let next,targetSlot=check.policy_slot;
  if(mode==='fill_missing') {
   if(evidence.summary.status!=='active_reported')throw billingError(409,'This response needs coverage review before filling the saved policy');
   next=enrichInsuranceFromEligibility(insurance,[{slot:targetSlot,result}]);
  }else{
   targetSlot=slot;
   if(Object.values(insurance?.[slot]||{}).some(value=>value===true||typeof value==='string'&&value.trim()))throw billingError(409,'This position already contains coverage. Reconcile or swap the existing policies before adding another insurer');
   const candidate=eligibilityPolicyDetails(evidence.result,{payerId:evidence.eligibilityPayerId}).otherInsurance.find(item=>item.id===candidateId);
   if(!candidate?.canDraft)throw billingError(409,'This response does not identify an insurer that can be copied into a policy draft');
   next={...insurance,[slot]:candidate.policy};
  }
  if(coverageInsuranceFingerprint(next)===fingerprint){await db.rollback();return {importedFields:[],message:'The saved policy already contains these details. Existing entries were preserved.'};}
  const sources=eligibilityImportSources(insurance,next,[{slot:targetSlot,result}]);
  const importedFields=Object.keys(sources[targetSlot]||{});
  const saved=await (deps.writeInsurance||writeClientInsurance)({...next,clientId,agencyId,confirmedBy:actorUserId,verifiedForClaims:false,queueEligibility:false,preservePaperReview:mode==='fill_missing'},db,{eligibilityFieldSources:sources});
  if(mode==='fill_missing')await db.execute("UPDATE client_coverage_checks SET insurance_fingerprint=? WHERE id=? AND agency_id=? AND client_id=? AND insurance_fingerprint=? AND status='returned'",[coverageInsuranceFingerprint(saved||next),checkId,agencyId,clientId,fingerprint]);
  await (deps.audit||auditBilling)({agencyId,clientId,userId:actorUserId,action:mode==='fill_missing'?'insurance_fields_from_eligibility':'insurance_reported_policy_draft',objectId:checkId},db);
  await db.commit();
  return {importedFields,sourceCheckId:checkId,message:mode==='fill_missing'?'Missing policy details filled from the saved verification. Existing entries were preserved.':`Reported insurer saved as a ${targetSlot} draft. Confirm its member/subscriber details, Claim.MD payer route, coverage dates and billing order before verification.`};
 }catch(error){await db.rollback();throw error;}finally{db.release();}
}
