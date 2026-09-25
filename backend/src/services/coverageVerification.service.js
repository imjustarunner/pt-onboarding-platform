import crypto from 'node:crypto';
import pool from '../config/database.js';
import { readClientInsurance } from './clientInsurance.service.js';
import { encryptFamilyBilling, decryptFamilyBilling, assertFamilyBillingEncryption } from './familyBillingEncryption.service.js';
import { requestEligibilityJson } from './claimMd.service.js';
import { hasMedicaidCoverage, policyIsMedicaid } from '../utils/insurancePaymentPolicy.js';
import { billingError, auditBilling } from './familyBillingPolicy.service.js';
import { validNpi } from './supervisedBillingPolicy.service.js';

const canonical = value => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object' ? Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])) : value;
export const coverageFingerprint = insurance => crypto.createHash('sha256').update(JSON.stringify(canonical({primary:insurance?.primary||null,secondary:insurance?.secondary||null,patient:insurance?.patient||null}))).digest('hex');
export function coverageDate(value) {
 const s=(value instanceof Date?value.toISOString():String(value||'')).slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s)||!Number.isFinite(Date.parse(s))||new Date(s).toISOString().slice(0,10)!==s)throw billingError(400,'Choose a valid date of service');
 return s;
}
export function buildEligibilityRequest({insurance,slot,serviceDate,profile}) {
 if(!['primary','secondary'].includes(slot))throw billingError(400,'Choose primary or secondary coverage');
 const policy=insurance?.[slot],patient=insurance?.patient;
 if(!(policy?.eligibilityPayerId||policy?.payerId)||!policy.memberId||!policy.subscriberFirstName||!policy.subscriberLastName||!policy.subscriberDob)throw billingError(409,'Save the payer ID, member ID and subscriber identity before checking eligibility');
 const self=policy.relationshipToSubscriber==='self';
 if(!['self','child','spouse','other'].includes(policy.relationshipToSubscriber)||(!self&&(!patient?.firstName||!patient.lastName||!patient.dateOfBirth)))throw billingError(409,'Save the relationship and dependent identity before checking eligibility');
 const taxId=String(profile.practice.tax_id||'').replace(/\D/g,'');
 if(!validNpi(profile.billingNpi)||!/^\d{9}$/.test(taxId))throw billingError(409,'Configure the agency tax ID and billing-office NPI before checking eligibility');
 const compact=v=>coverageDate(v).replaceAll('-','');
 return {payerid:policy.eligibilityPayerId||policy.payerId,ins_number:policy.memberId,ins_name_f:policy.subscriberFirstName,ins_name_l:policy.subscriberLastName,ins_dob:compact(policy.subscriberDob),
  ...(['M','F'].includes(policy.subscriberSex)?{ins_sex:policy.subscriberSex}:{}),pat_rel:self?'18':'G8',
  ...(!self?{pat_name_f:patient.firstName,pat_name_l:patient.lastName,pat_dob:compact(patient.dateOfBirth),...(['M','F'].includes(patient.sex)?{pat_sex:patient.sex}:{})}:{}),
  fdos:compact(serviceDate),service_code:'30,MH',prov_npi:profile.billingNpi,prov_taxid:taxId,prov_taxid_type:profile.practice.tax_id_type==='ssn'?'S':'E',prov_name_l:profile.practice.name};
}
const asList=v=>Array.isArray(v)?v:v?[v]:[];
export function summarizeEligibility(result) {
 const elig=result?.elig||result?.result?.elig;
 const benefits=asList(elig).flatMap(e=>asList(e.benefit));
 const plan=benefits.filter(b=>String(b.benefit_code)==='30');
 const active=plan.some(b=>['1','2','3','4','5'].includes(String(b.benefit_coverage_code)));
 const inactive=plan.some(b=>['6','7','8'].includes(String(b.benefit_coverage_code)));
 return {status:active&&!inactive?'active_reported':inactive&&!active?'inactive_reported':'review_required',
  otherCoverageReported:benefits.some(b=>String(b.benefit_coverage_code)==='R'||['PRP','SEP','TTP'].includes(String(b.entity_code))),
  benefits,reference:asList(elig)[0]?.eligid||null,
  warning:'Eligibility is not a payment guarantee. An absent other-payer record does not establish that no other coverage exists.'};
}
const context=(agencyId,clientId)=>`coverage:${agencyId}:${clientId}`;
export async function listCoverageEvidence({agencyId,clientId,serviceDate},db=pool) {
 const date=coverageDate(serviceDate);
 const [checks]=await db.execute('SELECT * FROM client_coverage_checks WHERE agency_id=? AND client_id=? AND service_date=? ORDER BY id DESC LIMIT 100',[agencyId,clientId,date]);
 const [[review]]=await db.execute('SELECT r.*,EXISTS(SELECT 1 FROM client_coverage_checks c WHERE c.agency_id=r.agency_id AND c.client_id=r.client_id AND (c.id>r.through_check_id OR c.completed_at>r.created_at)) AS has_new_evidence FROM client_coverage_reviews r WHERE agency_id=? AND client_id=? AND service_date=? ORDER BY id DESC LIMIT 1',[agencyId,clientId,date]);
 const [[latest]]=await db.execute('SELECT COALESCE(MAX(id),0) AS latest_check_id FROM client_coverage_checks WHERE agency_id=? AND client_id=?',[agencyId,clientId]);
 const [[latestReview]]=await db.execute('SELECT id,status FROM client_coverage_reviews WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 1',[agencyId,clientId]);
 return {latestReview,latestCheckId:Number(latest.latest_check_id),checks:checks.map(row=>({...row,evidence:decryptFamilyBilling(row.evidence_encrypted,context(agencyId,clientId)),evidence_encrypted:undefined})),review:review?{...review,evidence:decryptFamilyBilling(review.evidence_encrypted,context(agencyId,clientId)),evidence_encrypted:undefined}:null};
}
export async function runCoverageCheck({agencyId,clientId,slot,serviceDate,requestKey,actorUserId,profile,accountKey},deps={}) {
 const db=deps.db||pool,date=coverageDate(serviceDate),insurance=await (deps.readInsurance||readClientInsurance)(clientId,agencyId,db);
 const payload=buildEligibilityRequest({insurance,slot,serviceDate:date,profile}),fingerprint=coverageFingerprint(insurance);
 if(!/^[a-zA-Z0-9:_-]{8,100}$/.test(requestKey||''))throw billingError(400,'An eligibility request key is required');
 assertFamilyBillingEncryption();
 let id;
 try {const [r]=await db.execute('INSERT INTO client_coverage_checks (agency_id,client_id,policy_slot,service_date,insurance_fingerprint,request_key,created_by_user_id) VALUES (?,?,?,?,?,?,?)',[agencyId,clientId,slot,date,fingerprint,requestKey,actorUserId]);id=r.insertId;}
 catch(e){if(e.code!=='ER_DUP_ENTRY')throw e;throw billingError(409,'This eligibility request was already started. Refresh its recorded result before starting another request');}
 try {
  const result=await (deps.request||requestEligibilityJson)({accountKey,payload});
  const evidence={result,summary:summarizeEligibility(result),billingOfficeId:profile.officeId,billingNpi:profile.billingNpi};
  await db.execute("UPDATE client_coverage_checks SET status='returned',completed_at=CURRENT_TIMESTAMP(6),evidence_encrypted=? WHERE id=? AND agency_id=? AND client_id=?",[encryptFamilyBilling(evidence,context(agencyId,clientId)),id,agencyId,clientId]);
  await auditBilling({agencyId,clientId,userId:actorUserId,action:'insurance_eligibility_checked',objectId:id},db);
  return {id,status:'returned',...evidence};
 }catch(e){await db.execute("UPDATE client_coverage_checks SET status='error',completed_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=? AND client_id=?",[id,agencyId,clientId]);throw billingError(502,'Eligibility could not be confirmed. Review payer enrollment or use the payer portal; coverage remains unverified');}
}
export function validateCoverageReview(input,insurance) {
 if(!['verified','unresolved','inactive'].includes(input.status)||!['payer_portal','claimmd','payer_phone'].includes(input.source)||typeof input.reference!=='string'||input.reference.trim().length<5||input.reference.length>2000)throw billingError(400,'Record the coverage outcome, verification source and dated evidence/reference');
 if(input.status==='verified') {
  if(input.primaryChecked!==true||(insurance?.secondary&&input.secondaryChecked!==true)||input.otherCoverageChecked!==true||input.orderConfirmed!==true)throw billingError(409,'Verify each recorded policy, check for other coverage and confirm payer order');
  if(hasMedicaidCoverage(insurance)&&input.medicaidTplChecked!==true)throw billingError(409,'Review Colorado Medicaid Other Insurance/TPL records and resolve any discrepancies first');
  if(policyIsMedicaid(insurance?.primary)&&insurance?.secondary&&!policyIsMedicaid(insurance.secondary))throw billingError(409,'Commercial coverage is recorded after Medicaid. Resolve payer order before verification');
 }
}
export async function saveCoverageReview(input) {
 const date=coverageDate(input.serviceDate),db=await pool.getConnection();
 try{
  await db.beginTransaction();await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE',[input.clientId,input.agencyId]);
  const insurance=await readClientInsurance(input.clientId,input.agencyId,db);validateCoverageReview(input,insurance);
  if(!insurance?.primary?.memberId)throw billingError(409,'Save this client’s insurance first');
  const {checks,latestCheckId}=await listCoverageEvidence({...input,serviceDate:date},db);
  if(input.source==='claimmd'&&input.status==='verified')for(const slot of insurance.secondary?['primary','secondary']:['primary']) {
   const check=checks.find(c=>c.policy_slot===slot);
   if(!check||check.status!=='returned'||check.insurance_fingerprint!==coverageFingerprint(insurance)||check.evidence?.summary?.status!=='active_reported')throw billingError(409,'Check each current policy or document payer-portal/phone verification');
  }
  const evidence={source:input.source,reference:input.reference.trim(),primaryChecked:input.primaryChecked===true,secondaryChecked:input.secondaryChecked===true,otherCoverageChecked:input.otherCoverageChecked===true,orderConfirmed:input.orderConfirmed===true,medicaidTplChecked:input.medicaidTplChecked===true};
  const [row]=await db.execute('INSERT INTO client_coverage_reviews (agency_id,client_id,service_date,insurance_fingerprint,status,through_check_id,evidence_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?,?,?)',[input.agencyId,input.clientId,date,coverageFingerprint(insurance),input.status,latestCheckId,encryptFamilyBilling(evidence,context(input.agencyId,input.clientId)),input.actorUserId]);
  await auditBilling({agencyId:input.agencyId,clientId:input.clientId,userId:input.actorUserId,action:'insurance_coordination_reviewed',objectId:row.insertId},db);
  await db.commit();return {id:row.insertId,status:input.status};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export function coverageReviewBlockers({insurance,review,latestReview=null,checks=[],latestCheckId=checks[0]?.id||0,now=new Date()}) {
 if(latestReview?.status==='unresolved'&&Number(latestReview.id)>Number(review?.id||0))return ['Resolve the latest other-coverage investigation before submission'];
 if(!review||review.status!=='verified')return ['Verify insurance and coordination of benefits for this date of service'];
 if(review.insurance_fingerprint!==coverageFingerprint(insurance))return ['Insurance or client identity changed; repeat coverage review'];
 if(Number(review.has_new_evidence)||Number(latestCheckId)>Number(review.through_check_id))return ['New eligibility evidence requires billing review'];
 const age=now-new Date(review.created_at);
 if(!Number.isFinite(age)||age<0||age>7*86400000)return ['Coverage review is expired or undated; recheck before submission'];
 return [];
}
export async function assertCoverageCollectionSafe(agencyId,clientId,db=pool) {
 const [[latest]]=await db.execute('SELECT COALESCE(MAX(id),0) AS latest_check_id FROM client_coverage_checks WHERE agency_id=? AND client_id=?',[agencyId,clientId]);
 const [[review]]=await db.execute('SELECT r.status,r.through_check_id,EXISTS(SELECT 1 FROM client_coverage_checks c WHERE c.agency_id=r.agency_id AND c.client_id=r.client_id AND (c.id>r.through_check_id OR c.completed_at>r.created_at)) AS has_new_evidence FROM client_coverage_reviews r WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 1',[agencyId,clientId]);
 if((review&&(review.status!=='verified'||Number(review.has_new_evidence)))||Number(latest.latest_check_id)>Number(review?.through_check_id||0))throw billingError(409,'Resolve new eligibility or other-coverage findings before collecting from the client');
}
