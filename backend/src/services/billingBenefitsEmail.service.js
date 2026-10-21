import pool from '../config/database.js';
import crypto from 'node:crypto';
import {readClientInsurance} from './clientInsurance.service.js';
import {coverageFingerprint} from './coverageVerification.service.js';
import {decryptFamilyBilling} from './familyBillingEncryption.service.js';
import {automaticBenefitFacts,buildBillingBenefitsEmail} from './billingBenefitsEmailContent.js';
import {clientEmailContext,sendClientPortalEmail} from './clientPortalEmail.service.js';
import {requireReadySender} from './familyLedger/senders.js';
import {createPaymentTask} from './familyLedger/tasks.js';
import {requireBillingLink,billingError} from './familyBillingPolicy.service.js';
import {migrationPaymentReady} from './portalMigration.service.js';

export function benefitNoticeFingerprint({insuranceFingerprint,facts}){
 return crypto.createHash('sha256').update(JSON.stringify({version:1,insuranceFingerprint:insuranceFingerprint||null,copayCents:facts?.copayCents??null,coinsuranceBasisPoints:facts?.coinsuranceBasisPoints??null,deductibleCents:facts?.deductibleCents??null,deductibleRemainingCents:facts?.deductibleRemainingCents??null})).digest('hex');
}

export async function activeBillingBenefitRecipient({agencyId,clientId,guardianUserId,expectedEmail},db=pool){
 const [[recipient]]=await db.execute(`SELECT u.id,u.email,u.first_name FROM client_guardians cg JOIN clients c ON c.id=cg.client_id JOIN users u ON u.id=cg.guardian_user_id WHERE c.agency_id=? AND c.id=? AND u.id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP()) AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','SUSPENDED')`,[agencyId,clientId,guardianUserId]);
 if(!recipient||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.email||'')||(expectedEmail&&recipient.email.toLowerCase()!==expectedEmail.toLowerCase()))throw billingError(409,'The recipient account or email changed before delivery');
 await requireBillingLink(guardianUserId,clientId,agencyId,db);
 return recipient;
}

export async function billingBenefitNoticeContext({agencyId,clientId,coverageCheckId},db=pool){
 const [[check]]=await db.execute("SELECT * FROM client_coverage_checks WHERE id=? AND agency_id=? AND client_id=? AND policy_slot='primary' AND status='returned'",[coverageCheckId,agencyId,clientId]);
 if(!check)throw billingError(404,'Returned primary coverage evidence is unavailable');
 const insurance=await readClientInsurance(clientId,agencyId,db),evidence=decryptFamilyBilling(check.evidence_encrypted,`coverage:${agencyId}:${clientId}`);
 const result=automaticBenefitFacts({insurance,result:evidence?.result,serviceDate:check.service_date instanceof Date?check.service_date.toISOString().slice(0,10):check.service_date});
 if(check.insurance_fingerprint!==coverageFingerprint(insurance)){result.ready=false;result.reasons.push('Insurance changed after this check');}
 const [[latest]]=await db.execute('SELECT MAX(id) id FROM client_coverage_checks WHERE agency_id=? AND client_id=?',[agencyId,clientId]);
 if(Number(latest.id)!==Number(check.id)){result.ready=false;result.reasons.push('Newer eligibility evidence exists');}
 const [[client]]=await db.execute(`SELECT c.*,u.email AS provider_email FROM clients c LEFT JOIN users u ON u.id=c.provider_id AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=c.agency_id AND ua.is_active=1) WHERE c.id=? AND c.agency_id=?`,[clientId,agencyId]);
 if(!client||client.is_demo||client.terminated_at||client.status!=='ACTIVE'){result.ready=false;result.reasons.push('Client is not an active non-demo account');}
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(client?.provider_email||'')){result.ready=false;result.reasons.push('Assigned provider email is unavailable');}
 return {...result,client,check};
}
/** Disabled until rollout. Only fully sourced, current facts enter this path;
 * uncertain delivery is never retried automatically. Recipient preferences and
 * sender readiness are rechecked by the shared transport. */
export async function sendAutomaticBillingBenefits(input){
 if(process.env.AUTOMATIC_BENEFIT_EMAILS_ENABLED!=='true')return {status:'staged'};
 const {agencyId,clientId,coverageCheckId}=input,context=await billingBenefitNoticeContext(input);
 const fingerprint=benefitNoticeFingerprint({insuranceFingerprint:context.check.insurance_fingerprint,facts:context.facts});
 const [guardians]=await pool.execute("SELECT u.id,u.email,u.first_name FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP()) AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','SUSPENDED')",[clientId]);
 const results=[];
 for(const g of guardians){
  try{await requireBillingLink(g.id,clientId,agencyId);}catch(e){if(e.status===403)continue;throw e;}
  const [insert]=await pool.execute('INSERT IGNORE INTO family_benefit_email_deliveries (agency_id,client_id,coverage_check_id,guardian_user_id,status,reason,benefit_fingerprint) VALUES (?,?,?,?,?,?,?)',[agencyId,clientId,coverageCheckId,g.id,context.ready?'pending':'held',context.reasons.join('; ').slice(0,500)||null,fingerprint]);
  if(!insert.affectedRows){results.push({guardianUserId:g.id,status:'already_recorded'});continue;}
  const id=insert.insertId;if(!context.ready){results.push({guardianUserId:g.id,status:'held'});continue;}
  try{
   // Recheck the source immediately before creating a task or sending.
   const current=await billingBenefitNoticeContext(input);if(!current.ready)throw billingError(409,'Coverage facts changed before delivery');
   await activeBillingBenefitRecipient({agencyId,clientId,guardianUserId:g.id,expectedEmail:g.email});
   const sender=await requireReadySender(agencyId,'billing');
   const [[consent]]=await pool.execute("SELECT id FROM guardian_billing_consents WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND purpose='responsible_payer' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",[agencyId,clientId,g.id]);
   const paymentReady=await migrationPaymentReady({agencyId,userId:g.id});
   if(!consent){const [[pending]]=await pool.execute("SELECT id FROM family_billing_tasks WHERE agency_id=? AND guardian_user_id=? AND status='pending' AND expires_at>UTC_TIMESTAMP() AND JSON_CONTAINS(client_ids_json,CAST(? AS JSON)) LIMIT 1",[agencyId,g.id,JSON.stringify(Number(clientId))]);if(!pending)await createPaymentTask({agencyId,guardianUserId:g.id,clientIds:[clientId],actorUserId:input.actorUserId,requireCard:!paymentReady});}
   const mail=await clientEmailContext({agencyId,clientId});
   const built=buildBillingBenefitsEmail({firstName:g.first_name,agencyName:mail.tenant.name,client:current.client,facts:current.facts,url:mail.url('guardian?panel=billing'),billingEmail:sender.from_email,paymentReady,authorizationReady:!!consent,school:current.client.client_type==='school',providerCopied:true});
   const cc=[...new Set([current.client.provider_email,sender.from_email])].filter(v=>v.toLowerCase()!==g.email.toLowerCase());
   await activeBillingBenefitRecipient({agencyId,clientId,guardianUserId:g.id,expectedEmail:g.email});
   await pool.execute("UPDATE family_benefit_email_deliveries SET status='sending' WHERE id=?",[id]);
   const sent=await sendClientPortalEmail({agencyId,clientId,context:mail,billing:true,to:g.email,cc,userId:g.id,...built,source:'auto',templateType:'family_benefits_update'});
   const status=sent?.id&&!sent.queued&&!sent.blocked&&!sent.skipped?'sent':'held';
   await pool.execute('UPDATE family_benefit_email_deliveries SET status=?,communication_id=?,reason=? WHERE id=?',[status,sent?.communicationId||null,sent?.reason||null,id]);results.push({guardianUserId:g.id,status});
  }catch(error){await pool.execute("UPDATE family_benefit_email_deliveries SET status=IF(status='sending','unknown','held'),reason=? WHERE id=?",[String(error.status?'Required billing setup or source evidence needs review':'Delivery needs review; do not retry without checking sent mail'),id]);results.push({guardianUserId:g.id,status:'needs_review'});}
 }
 return {results};
}
