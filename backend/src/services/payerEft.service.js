import pool from '../config/database.js';
import { getClaimMdBillingProfile, listClaimMdBillingProfiles } from './claimMdBillingProfile.service.js';
import { encryptFamilyBilling, decryptFamilyBilling, assertFamilyBillingEncryption } from './familyBillingEncryption.service.js';
import { billingError, auditBilling } from './familyBillingPolicy.service.js';
import { validNpi } from './supervisedBillingPolicy.service.js';
import { taxIdHash } from './claimMdWorkflow.service.js';
import { coverageDate } from './coverageVerification.service.js';

export const EFT_STATUSES=['unverified','not_started','pending','action_required','active_reported','active_verified','suspended'];
export function eftGuide(payerId) {
 return String(payerId).toUpperCase()==='COCHA'
  ? {name:'CCHA / EnrollSafe',url:'https://enrollsafe.payeehub.org/',sourceUrl:'https://www.cchacares.com/Dal/ebM',instructions:'Use the existing CCHA EFT enrollment if deposits are already arriving. EnrollSafe handles enrollment and bank changes; verify ERA routing separately.'}
  : {name:'Payer EFT enrollment',url:null,sourceUrl:null,instructions:'Use the payer’s official provider portal or provider support to confirm its EFT enrollment process for this legal entity, tax ID and billing NPI.'};
}
export function validateEftEvidence(input) {
 if(!EFT_STATUSES.includes(input.status))throw billingError(400,'Choose an EFT status');
 if(!['staff_report','payer_portal','payer_support','bank_deposit'].includes(input.source))throw billingError(400,'Select the evidence source');
 const reference=typeof input.reference==='string'?input.reference.trim():'';
 if(reference.length<5||reference.length>1000)throw billingError(400,'Document the enrollment or payment reference (5–1000 characters); omit bank account and routing numbers');
 if(input.attested!==true)throw billingError(400,'Confirm the evidence belongs to this payer and billing entity');
 const evidenceDate=coverageDate(input.evidenceDate);
 if(evidenceDate>new Date().toISOString().slice(0,10))throw billingError(400,'Evidence cannot be dated in the future');
 if(input.status==='active_verified'&&(input.source!=='bank_deposit'||input.depositMatched!==true))throw billingError(409,'Verify an actual bank deposit against the payer payment reference before marking EFT verified');
 const enrollmentLevel=input.enrollmentLevel||'unknown';
 if(!['unknown','tin','npi'].includes(enrollmentLevel))throw billingError(400,'Select the payer enrollment scope');
 return {enrollmentLevel,source:input.source,reference,evidenceDate,depositMatched:input.status==='active_verified',attested:true};
}
const context=(agencyId,id)=>`payer-eft:${agencyId}:${id}`;
const defaults={db:pool,profile:getClaimMdBillingProfile,offices:listClaimMdBillingProfiles};
function publicRecord(row,current){return {id:row.id,officeId:row.billing_office_location_id,payerId:row.payer_id,payerName:row.payer_name,providerNpi:row.provider_npi,status:row.status,revision:row.revision,updatedAt:row.updated_at,identityCurrent:current,guide:eftGuide(row.payer_id),evidence:decryptFamilyBilling(row.evidence_encrypted,context(row.agency_id,row.id))};}
export async function listPayerEft(agencyId,deps=defaults){
 const offices=await deps.offices(agencyId);
 const [rows]=await deps.db.execute('SELECT * FROM payer_eft_enrollments WHERE agency_id=? ORDER BY updated_at DESC,id DESC LIMIT 201',[agencyId]);
 const identities=rows.length?await Promise.all(offices.map(o=>deps.profile(agencyId,o.id,{requireComplete:false}))):[];
 return {offices,hasMore:rows.length>200,items:rows.slice(0,200).map(r=>publicRecord(r,identities.some(p=>p.billingNpi===r.provider_npi&&/^\d{9}$/.test(String(p.practice.tax_id||'').replace(/\D/g,''))&&taxIdHash(p.practice.tax_id)===r.tax_id_hash)))};
}
export async function savePayerEft(input,deps=defaults){
 const payerId=String(input.payerId||'').trim(),payerName=String(input.payerName||'').trim();
 if(!/^[A-Za-z0-9_-]{1,32}$/.test(payerId)||!payerName||payerName.length>128)throw billingError(400,'Enter the claims payer ID and payer name');
 const evidence=validateEftEvidence(input),profile=await deps.profile(input.agencyId,input.officeId,{requireComplete:false});
 if(!validNpi(profile.billingNpi)||!/^\d{9}$/.test(String(profile.practice.tax_id||'').replace(/\D/g,'')))throw billingError(409,'Configure the billing office NPI and agency tax ID to identify the EFT enrollment');
 if(!Number.isSafeInteger(input.revision)||input.revision<0)throw billingError(400,'Refresh the EFT record before saving');
 assertFamilyBillingEncryption();const hash=taxIdHash(profile.practice.tax_id),db=await deps.db.getConnection();
 try{
  await db.beginTransaction();
  // Serialize new identity creation; offices sharing a group NPI/TIN share EFT tracking.
  const [[agency]]=await db.execute('SELECT id FROM agencies WHERE id=? FOR UPDATE',[input.agencyId]);
  if(!agency)throw billingError(404,'Agency not found');
  const [[previous]]=await db.execute('SELECT * FROM payer_eft_enrollments WHERE agency_id=? AND payer_id=? AND provider_npi=? AND tax_id_hash=? FOR UPDATE',[input.agencyId,payerId,profile.billingNpi,hash]);
  if((previous?.revision||0)!==input.revision)throw billingError(409,'EFT tracking changed or already exists for this payer and group. Refresh before saving');
  let id=previous?.id;const revision=input.revision+1;
  if(!id){const [r]=await db.execute('INSERT INTO payer_eft_enrollments (agency_id,billing_office_location_id,payer_id,payer_name,provider_npi,tax_id_hash,status,evidence_encrypted,updated_by_user_id) VALUES (?,?,?,?,?,?,?, ?,?)',[input.agencyId,profile.officeId,payerId,payerName,profile.billingNpi,hash,input.status,'pending-encryption',input.actorUserId]);id=r.insertId;}
  const encrypted=encryptFamilyBilling(evidence,context(input.agencyId,id));
  await db.execute('UPDATE payer_eft_enrollments SET billing_office_location_id=?,payer_name=?,status=?,evidence_encrypted=?,revision=?,updated_by_user_id=?,updated_at=CURRENT_TIMESTAMP(6) WHERE id=? AND agency_id=?',[profile.officeId,payerName,input.status,encrypted,revision,input.actorUserId,id,input.agencyId]);
  await db.execute('INSERT INTO payer_eft_events (enrollment_id,agency_id,revision,status,evidence_encrypted,created_by_user_id) VALUES (?,?,?,?,?,?)',[id,input.agencyId,revision,input.status,encrypted,input.actorUserId]);
  await auditBilling({agencyId:input.agencyId,userId:input.actorUserId,action:'payer_eft_status_recorded',objectId:id},db);
  await db.commit();return {id,revision,status:input.status,bankInstructionsChanged:false,enrollmentSubmitted:false};
 }catch(e){await db.rollback();throw e;}finally{db.release();}
}
export async function payerEftHistory(agencyId,id,db=pool){
 const [rows]=await db.execute('SELECT revision,status,evidence_encrypted,created_by_user_id,created_at FROM payer_eft_events WHERE agency_id=? AND enrollment_id=? ORDER BY revision DESC LIMIT 100',[agencyId,id]);
 return rows.map(r=>({revision:r.revision,status:r.status,actorUserId:r.created_by_user_id,at:r.created_at,evidence:decryptFamilyBilling(r.evidence_encrypted,context(agencyId,id))}));
}
