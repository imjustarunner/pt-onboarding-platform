import pool from '../config/database.js';
import crypto from 'node:crypto';
import ClientGuardian from '../models/ClientGuardian.model.js';
import GuardianPaymentCard from '../models/GuardianPaymentCard.model.js';
import {guardianDemographics} from './guardianDemographics.service.js';
import {guardianPlanProgress} from './guardianPlanProgress.service.js';
import {readClientInsurance} from './clientInsurance.service.js';
import {getReadiness} from './familyLedger/readiness.js';
import {requireBillingLink,linkAllowsBillingView,billingError,auditBilling} from './familyBillingPolicy.service.js';
import {migrationChecklist} from './portalMigrationContent.js';
import {previewClientPortalInvites} from './clientPortalInvites.service.js';
import {sendHubPortalInvitation} from './messagesHub.service.js';
import {decodeInsuranceProfile} from '../models/GuardianInsuranceProfile.model.js';
import {cardProgress} from './insuranceCards/policy.js';
import {familyNotificationDeliveryGate} from './familyNotificationChoices.service.js';

export function usableMigrationCard(card,now=new Date(),connectedAccountId=null){
 return !!card?.stripe_payment_method_id&&!!card.connected_account_id&&!card.legacyRequiresReview&&Number(card.is_active)===1
 &&(!connectedAccountId||card.connected_account_id===connectedAccountId)
 &&Number(card.card_exp_month)>=1&&Number(card.card_exp_month)<=12&&(Number(card.card_exp_year)>now.getUTCFullYear()||(Number(card.card_exp_year)===now.getUTCFullYear()&&Number(card.card_exp_month)>=now.getUTCMonth()+1));
}
export async function migrationPaymentReady({agencyId,userId},db=pool){
 const [[account]]=await db.execute("SELECT stripe_connect_account_id FROM agency_billing_accounts WHERE agency_id=? AND stripe_connect_status='active'",[agencyId]);
 if(!account?.stripe_connect_account_id)return false;
 const cards=await GuardianPaymentCard.findActiveByGuardian(userId,agencyId,db);
 return cards.some(card=>usableMigrationCard(card,new Date(),account.stripe_connect_account_id));
}
async function migrationAccess({user,agencyId,clientId},db=pool){
 if(!['client','client_guardian'].includes(user.role))throw billingError(403,'Your own portal account is required');
 const links=await ClientGuardian.listClientsForGuardian({guardianUserId:user.id});
 const link=links.find(c=>Number(c.client_id)===Number(clientId)&&Number(c.agency_id)===Number(agencyId));
 if(!link||!linkAllowsBillingView({...link,access_enabled:1}))throw billingError(403,'This profile is not available to your account');
 const [[enrollment]]=await db.execute('SELECT * FROM family_portal_migration_enrollments WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,user.id]);
 return {link,enrollment};
}
export async function portalMigrationOverview(input){
 const {link,enrollment}=await migrationAccess(input);if(!enrollment)return {enrolled:false};
 const {agencyId,clientId,user}=input;
 let demographic=null,plan=null,billingAllowed=false;
 try{demographic=await guardianDemographics.read({user,clientId});}catch(e){if(e.status!==403)throw e;}
 try{plan=await guardianPlanProgress({userId:user.id,clientId,agencyId});}catch(e){if(e.status!==403)throw e;}
 try{await requireBillingLink(user.id,clientId,agencyId);billingAllowed=true;}catch(e){if(e.status!==403)throw e;}
 const insurance=billingAllowed?await readClientInsurance(clientId,agencyId):null;
 const readiness=billingAllowed?await getReadiness(agencyId,clientId):{};
 const paymentReady=billingAllowed?await migrationPaymentReady({agencyId,userId:user.id}):false;
 const [[consent]]=billingAllowed?await pool.execute("SELECT id FROM guardian_billing_consents WHERE agency_id=? AND client_id=? AND guardian_user_id=? AND purpose='responsible_payer' AND revoked_at IS NULL ORDER BY id DESC LIMIT 1",[agencyId,clientId,user.id]):[[]];
 let insuranceCardMissing=billingAllowed&&!!insurance;
 if(billingAllowed&&insurance?.profileId){const [[row]]=await pool.execute('SELECT * FROM guardian_insurance_profiles WHERE id=? AND agency_id=?',[insurance.profileId,agencyId]);if(row)insuranceCardMissing=cardProgress(decodeInsuranceProfile(row),{}).missingSlots.length>0;}
 const [[choices]]=await pool.execute('SELECT updated_at FROM family_notification_choices WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[agencyId,clientId,user.id]);
 const [providers]=await pool.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name,u.title FROM users u WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND (u.id=(SELECT provider_id FROM clients WHERE id=? AND agency_id=?) OR u.id IN (SELECT provider_user_id FROM client_provider_assignments WHERE client_id=? AND is_active=1))`,[clientId,agencyId,clientId]);
 const items=migrationChecklist({self:link.relationship_type==='self',notificationsConfirmed:!!choices&&new Date(choices.updated_at)>=new Date(enrollment.created_at),insurance,coverageKnown:billingAllowed&&(!!insurance?.primary?.memberId||readiness.coverage_mode==='self_pay'),paymentReady,authorizationReady:!!consent,insuranceCardMissing,demographicsConfirmed:!!demographic&&enrollment.information_revision===demographic.revision,planAvailable:!!plan?.hasActivePlan,planAcknowledged:!!plan?.acknowledgments?.some(a=>a.status==='signed')});
 return {enrolled:true,profile:{name:link.full_name||link.initials,relationship:link.relationship_type,agencyName:link.agency_name,agencyLogo:link.agency_logo_url,school:link.organization_type==='school'?{name:link.organization_name,logo:link.organization_logo_url}:null,providers:providers.map(p=>({id:p.id,name:[p.first_name,p.last_name].filter(Boolean).join(' '),title:p.title||null}))},cohort:enrollment.cohort_label,informationRevision:demographic?.revision||null,items:items.filter(i=>(i.key!=='information'||demographic)&&(i.key!=='plan'||plan)),historyNotice:'Payment cards and earlier billing history do not transfer automatically. Request prior receipts or balances in Billing.'};
}
export async function confirmMigrationInformation(input){
 const {enrollment}=await migrationAccess(input);if(!enrollment)throw billingError(404,'Portal onboarding is not assigned');
 if(input.confirmed!==true)throw billingError(400,'Confirm you reviewed your information');
 const current=await guardianDemographics.read({user:input.user,clientId:input.clientId});
 if(input.revision!==current.revision)throw billingError(409,'Your information changed. Review it again before confirming');
 await pool.execute('UPDATE family_portal_migration_enrollments SET information_revision=?,information_confirmed_at=UTC_TIMESTAMP() WHERE agency_id=? AND client_id=? AND guardian_user_id=?',[current.revision,input.agencyId,input.clientId,input.user.id]);
 await auditBilling({agencyId:input.agencyId,clientId:input.clientId,userId:input.user.id,action:'portal_migration_information_confirmed'});return {confirmed:true};
}
export async function prepareMigrationCohort({actor,agencyId,clientIds,cohortLabel}){
 if(!String(cohortLabel||'').trim()||String(cohortLabel).length>120)throw billingError(400,'Name this provider cohort');
 if(!Number.isSafeInteger(Number(agencyId))||Number(agencyId)<1)throw billingError(400,'Select an agency for this cohort');
 const preview=await previewClientPortalInvites({actor,clientIds});
 if(preview.recipients.some(recipient=>Number(recipient.agencyId)!==Number(agencyId)))throw billingError(403,'Every client in a migration cohort must belong to the selected agency');
 const recipients=[],skipped=[...(preview.skipped||[])];
 for(const recipient of preview.recipients){
  const [rows]=await pool.execute(`SELECT cg.client_id,cg.permissions_json,u.email FROM client_guardians cg JOIN clients c ON c.id=cg.client_id JOIN users u ON u.id=cg.guardian_user_id WHERE c.agency_id=? AND cg.guardian_user_id=? AND cg.access_enabled=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP()) AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','SUSPENDED')`,[agencyId,recipient.guardianUserId]);
  const allowed=new Set(rows.filter(row=>linkAllowsBillingView({...row,access_enabled:1})&&String(row.email).toLowerCase()===String(recipient.email).toLowerCase()).map(row=>Number(row.client_id)));
  const clients=[];
  for(const client of recipient.clients.filter(client=>allowed.has(Number(client.clientId)))){
   const gate=await familyNotificationDeliveryGate({agencyId,clientId:client.clientId,to:recipient.email,templateType:'portal_migration_invite'});
   if(gate.allowed)clients.push(client);
   else skipped.push({clientId:client.clientId,label:client.label,reason:'Portal welcome held by this recipient’s email preferences.'});
  }
  if(clients.length)recipients.push({...recipient,clients});
 }
 return {...preview,recipients,skipped,cohortLabel:String(cohortLabel).trim(),launchEnabled:process.env.PORTAL_MIGRATION_INVITES_ENABLED==='true'};
}
export async function inviteMigrationFamily(input){
 if(process.env.PORTAL_MIGRATION_INVITES_ENABLED!=='true')throw billingError(409,'Portal migration invitations are staged. Enable the rollout only after launch approval.');
 const preview=await prepareMigrationCohort(input),recipient=preview.recipients.find(r=>r.key===input.recipientKey);
 if(!recipient)throw billingError(409,'Refresh the selected family before sending');
 const cohortFingerprint=crypto.createHash('sha256').update(preview.cohortLabel.normalize('NFKC').toLowerCase()).digest('hex');
 // Claim before changing enrollment or calling transport. Pending, queued and
 // unknown outcomes remain reserved for review instead of silently resending.
 const [claim]=await pool.execute('INSERT IGNORE INTO family_portal_migration_deliveries (agency_id,guardian_user_id,cohort_label,cohort_fingerprint,created_by_user_id) VALUES (?,?,?,?,?)',[recipient.agencyId,recipient.guardianUserId,preview.cohortLabel,cohortFingerprint,input.actor.id]);
 if(!claim.affectedRows){
  const [[prior]]=await pool.execute('SELECT status FROM family_portal_migration_deliveries WHERE agency_id=? AND guardian_user_id=? AND cohort_fingerprint=?',[recipient.agencyId,recipient.guardianUserId,cohortFingerprint]);
  return {key:recipient.key,delivery:{alreadyRecorded:true,status:prior?.status||'unknown',blocked:prior?.status!=='sent',reason:'This cohort invitation was already processed. Review its communication history before any manual resend.'}};
 }
 try{
  for(const client of recipient.clients){
   await pool.execute('UPDATE clients SET guardian_portal_enabled=1 WHERE id=? AND agency_id=?',[client.clientId,recipient.agencyId]);
   await pool.execute('INSERT INTO family_portal_migration_enrollments (agency_id,client_id,guardian_user_id,cohort_label,created_by_user_id) VALUES (?,?,?,?,?) ON DUPLICATE KEY UPDATE cohort_label=VALUES(cohort_label)',[recipient.agencyId,client.clientId,recipient.guardianUserId,preview.cohortLabel,input.actor.id]);
  }
  await pool.execute("UPDATE family_portal_migration_deliveries SET status='sending' WHERE id=?",[claim.insertId]);
  const result=await sendHubPortalInvitation({agencyId:recipient.agencyId,actorUserId:input.actor.id,clientId:recipient.clients[0].clientId,guardianUserId:recipient.guardianUserId,existingLinkOnly:true,migration:true,migrationClientIds:recipient.clients.map(client=>client.clientId)});
  const delivery=result?.delivery,status=delivery?.id&&!delivery.queued&&!delivery.blocked&&!delivery.skipped?'sent':'held';
  await pool.execute('UPDATE family_portal_migration_deliveries SET status=?,reason=? WHERE id=?',[status,delivery?.reason||null,claim.insertId]);
  return {key:recipient.key,delivery};
 }catch(error){
  await pool.execute("UPDATE family_portal_migration_deliveries SET status=IF(status='sending','unknown','held'),reason=? WHERE id=?",['This invitation needs review before any manual resend.',claim.insertId]);
  throw error;
 }
}

export async function migrationNotificationSettings(input) {
  await migrationAccess(input);
  const {createFamilyNotificationInvitation}=await import('./familyNotificationChoices.service.js');
  const invitation=await createFamilyNotificationInvitation({agencyId:input.agencyId,clientId:input.clientId,guardianUserId:input.user.id,actorUserId:input.user.id,forAccountSettings:true});
  return {url:invitation.url};
}
