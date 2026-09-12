import pool from '../config/database.js';
import { billingError,positiveId } from './familyBillingPolicy.service.js';
import { encryptFamilyBilling } from './familyBillingEncryption.service.js';
import { parseJson,dateOnly,today,transaction } from './familyLedger/policy.js';
export const CLINICAL_SCOPES=['treatment_plan','approve_goals','session_frequency','safety_plan','clinical_documents','clinical_messages'];
export function ageOn(dob,asOf=today()){if(!dob)return null;const date=dateOnly(dob);return Number(asOf.slice(0,4))-Number(date.slice(0,4))-(asOf.slice(5)<date.slice(5)?1:0);}
export function effectiveClinicalAccess({grant,link,dob,asOf=today()}){
  const denied={level:'payer_only',scopes:[],reviewRequired:true};
  const permissions=parseJson(link?.permissions_json,{});
  if(!link||Number(link.access_enabled)!==1||permissions.noView||permissions.noViewOtherGuardian)return denied;
  if(link.relationship_type==='self')return {level:'self',scopes:[...CLINICAL_SCOPES],reviewRequired:false};
  if(!grant||grant.revoked_at||!grant.medical_rights_verified||!dob)return denied;
  const age=ageOn(dob,asOf);if(age===null||age<0)return denied;
  if(grant.review_due_date&&dateOnly(grant.review_due_date)<=asOf)return denied;
  if(age>=18&&grant.consent_basis!=='client_authorization')return denied;
  // An age-12 review is a privacy safeguard, not a claim that Colorado
  // automatically removes every parent's rights on that birthday.
  if(age>=12&&grant.access_level==='full'&&grant.consent_basis==='legal_representative'&&!grant.review_due_date)return denied;
  let scopes=parseJson(grant.scopes_json,[]).filter(s=>CLINICAL_SCOPES.includes(s));
  if(grant.access_level==='payer_only')scopes=[];
  if(grant.access_level==='limited')scopes=scopes.filter(s=>!['treatment_plan','approve_goals','session_frequency'].includes(s));
  return {level:grant.access_level==='full'&&scopes.length<CLINICAL_SCOPES.length?'restricted':grant.access_level,scopes,reviewRequired:false,reviewDueDate:grant.review_due_date};
}
export async function clinicalAccess({agencyId,clientId,userId},db=pool){
  const [rows]=await db.execute('SELECT cg.*,c.date_of_birth,c.agency_id FROM client_guardians cg JOIN clients c ON c.id=cg.client_id WHERE cg.client_id=? AND cg.guardian_user_id=? AND c.agency_id=?',[clientId,userId,agencyId]);
  const [grants]=await db.execute('SELECT * FROM guardian_clinical_grants WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,userId]);
  return effectiveClinicalAccess({grant:grants[0],link:rows[0],dob:rows[0]?.date_of_birth});
}
export async function requireClinicalScope({agencyId,clientId,userId,scope}){const access=await clinicalAccess({agencyId,clientId,userId});if(!access.scopes.includes(scope))throw billingError(403,'This clinical information is not authorized for this relationship. Contact the care team for an access review.');return access;}
export async function requireClinicalAccessManager(user,agencyId){
 const [members]=await pool.execute('SELECT user_id FROM user_agencies WHERE user_id=? AND agency_id=?',[user.id,agencyId]);
 if(user.role==='super_admin')return;
 if(!members.length||!['admin','agency_admin','clinical_practice_assistant'].includes(user.role))throw billingError(403,'Clinical access review requires an authorized care-team member');
 // Provider roles must also have a client assignment in the route's existing
 // clinical access guard when used outside the agency administration screen.
}
export async function setClinicalGrant({agencyId,clientId,guardianUserId,accessLevel,medicalRightsVerified,consentBasis,scopes,reviewDueDate,reason,actorUserId}){
 if(!['full','limited','payer_only'].includes(accessLevel)||!['legal_representative','minor_independent_consent','client_authorization','payer_only'].includes(consentBasis)||!String(reason||'').trim())throw billingError(400,'Record the access level, verified consent basis and supporting authority');
 return transaction(async db=>{
  const [links]=await db.execute('SELECT cg.*,c.date_of_birth FROM client_guardians cg JOIN clients c ON c.id=cg.client_id WHERE c.id=? AND c.agency_id=? AND cg.guardian_user_id=? AND cg.access_enabled=1 FOR UPDATE',[clientId,agencyId,guardianUserId]);const link=links[0];if(!link||link.relationship_type==='self')throw billingError(400,'Select an active guardian relationship');
  const age=ageOn(link.date_of_birth);if(accessLevel!=='payer_only'&&(!medicalRightsVerified||age===null))throw billingError(400,'Verify medical rights and date of birth before granting clinical access');
  if(age>=18&&accessLevel!=='payer_only'&&consentBasis!=='client_authorization')throw billingError(400,'An adult client’s authorization is required');
  if(accessLevel!=='payer_only'&&!reviewDueDate)throw billingError(400,'Set the next clinical access review date');
  let due=reviewDueDate?dateOnly(reviewDueDate):null;if(due&&due<=today())throw billingError(400,'Review date must be in the future');
  if(accessLevel!=='payer_only'&&age<18){const birth=dateOnly(link.date_of_birth),birthday=`${Number(birth.slice(0,4))+(age<12?12:18)}${birth.slice(4)}`;if(!due||due>birthday)due=birthday;}
  let allowed=accessLevel==='full'?CLINICAL_SCOPES:accessLevel==='payer_only'?[]:(scopes||[]).filter(s=>CLINICAL_SCOPES.includes(s)&&!['treatment_plan','approve_goals','session_frequency'].includes(s));
  const evidence={reason:String(reason).slice(0,8000),consentBasis,medicalRightsVerified:medicalRightsVerified===true,accessLevel,scopes:allowed,reviewDueDate:due};
  await db.execute('INSERT INTO guardian_clinical_grants (agency_id,client_id,guardian_user_id,access_level,medical_rights_verified,consent_basis,scopes_json,evidence_encrypted,reviewed_by_user_id,review_due_date) VALUES (?,?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE access_level=VALUES(access_level),medical_rights_verified=VALUES(medical_rights_verified),consent_basis=VALUES(consent_basis),scopes_json=VALUES(scopes_json),evidence_encrypted=VALUES(evidence_encrypted),reviewed_by_user_id=VALUES(reviewed_by_user_id),review_due_date=VALUES(review_due_date),reviewed_at=NOW(),revoked_at=NULL',[agencyId,clientId,guardianUserId,accessLevel,medicalRightsVerified?1:0,consentBasis,JSON.stringify(allowed),encryptFamilyBilling(evidence,`clinical-grant:${agencyId}:${clientId}:${guardianUserId}`),actorUserId,due]);
  await db.execute("INSERT INTO guardian_clinical_access_events (agency_id,client_id,guardian_user_id,actor_user_id,action,evidence_encrypted) VALUES (?,?,?,?,'grant_reviewed',?)",[agencyId,clientId,guardianUserId,actorUserId,encryptFamilyBilling(evidence,`clinical-grant:${agencyId}:${clientId}:${guardianUserId}`)]);
  return {accessLevel,scopes:allowed,reviewDueDate:due};
 });
}
export async function revokeClinicalGrant({agencyId,clientId,guardianUserId,userId,reason,scopes}){
 return transaction(async db=>{
  const [links]=await db.execute('SELECT cg.*,c.date_of_birth FROM client_guardians cg JOIN clients c ON c.id=cg.client_id WHERE c.id=? AND c.agency_id=? AND cg.guardian_user_id=? AND cg.access_enabled=1',[clientId,agencyId,userId]);const link=links[0];
  if(!link||link.relationship_type!=='self'||ageOn(link.date_of_birth)<12||ageOn(link.date_of_birth)===null)throw billingError(403,'Only this client’s account can request this privacy restriction');
  const removed=Array.isArray(scopes)?scopes.filter(s=>CLINICAL_SCOPES.includes(s)):CLINICAL_SCOPES;
  if(!removed.length)throw billingError(400,'Select the clinical disclosures to restrict');
  const evidence={reason:String(reason||'Client requested restriction').slice(0,4000),scopes:removed,requiresClinicalReview:true};
  // Restrict immediately while staff review the applicable consent and law.
  const [grants]=await db.execute('SELECT scopes_json FROM guardian_clinical_grants WHERE agency_id=? AND client_id=? AND guardian_user_id=? FOR UPDATE',[agencyId,clientId,guardianUserId]);
  const remaining=parseJson(grants[0]?.scopes_json,[]).filter(s=>!removed.includes(s));
  await db.execute('UPDATE guardian_clinical_grants SET scopes_json=?,revoked_at=? WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[JSON.stringify(remaining),remaining.length?null:new Date(),agencyId,clientId,guardianUserId]);
  await db.execute("INSERT INTO guardian_clinical_access_events (agency_id,client_id,guardian_user_id,actor_user_id,action,evidence_encrypted) VALUES (?,?,?,?,'client_restriction_requested',?)",[agencyId,clientId,guardianUserId,userId,encryptFamilyBilling(evidence,`clinical-grant:${agencyId}:${clientId}:${guardianUserId}`)]);
  return {restricted:true,reviewRequired:true};
 });
}

export async function requireGuardianThreadDisclosure(userId,threadId){
 const [rows]=await pool.execute("SELECT c.id,c.agency_id FROM clients c JOIN client_guardians cg ON cg.client_id=c.id JOIN chat_threads t ON t.agency_id=c.agency_id WHERE t.id=? AND cg.guardian_user_id=? AND cg.access_enabled=1 AND c.client_type IN ('clinical','mental_health')",[threadId,userId]);
 for(const row of rows)await requireClinicalScope({agencyId:row.agency_id,clientId:row.id,userId,scope:'clinical_messages'});
}
