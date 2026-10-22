import crypto from 'node:crypto';
import { cardFollowupEligible, hasCompletedCardEnrollment } from './scope.js';
import pool from '../../config/database.js';
import {decodeInsuranceProfile} from '../../models/GuardianInsuranceProfile.model.js';
import {billingError,positiveId,requireInsuranceLink,auditBilling} from '../familyBillingPolicy.service.js';
import {readClientInsurance} from '../clientInsurance.service.js';
import {encryptFamilyBilling,decryptFamilyBilling} from '../familyBillingEncryption.service.js';
import {coverageFingerprint} from '../coverageVerification.service.js';
import StorageService from '../storage.service.js';
import DocumentEncryptionService from '../documentEncryption.service.js';
import {CARD_SLOTS,cardUrlKey,cardCycle,cardProgress,encouragedCardSlots,cardCoverageVerified,parse,validCardFile} from './policy.js';

export async function cardContext({agencyId,profileId,userId,staff=false},db=pool) {
  const [[row]]=await db.execute(`SELECT p.*,a.name AS agency_name,a.slug,a.portal_url,u.email,u.first_name,u.last_name,u.status AS user_status,u.is_active AS user_is_active,u.is_archived AS user_is_archived,u.is_demo AS user_is_demo FROM guardian_insurance_profiles p JOIN agencies a ON a.id=p.agency_id JOIN users u ON u.id=p.guardian_user_id WHERE p.id=? AND p.agency_id=? AND a.is_active=1 AND COALESCE(a.is_archived,0)=0`,[positiveId(profileId),positiveId(agencyId)]);
  if(!row || (!staff&&Number(row.guardian_user_id)!==Number(userId)))throw billingError(404,'Insurance record is not available to this account');
  const profile=decodeInsuranceProfile(row);
  const [links]=await db.execute(`SELECT DISTINCT c.id,c.full_name,c.initials,c.client_type,c.primary_insurer_name,it.insurance_key,it.label AS insurance_label,g.profile_id AS assigned_profile_id FROM clients c LEFT JOIN insurance_types it ON it.id=c.insurance_type_id LEFT JOIN guardian_insurance_clients g ON g.client_id=c.id AND g.agency_id=c.agency_id AND g.profile_id=? WHERE c.agency_id=? AND (c.id=? OR g.profile_id IS NOT NULL) AND c.status NOT IN ('ARCHIVED','INACTIVE','TERMINATED') AND c.compliance_archived_at IS NULL`,[profileId,agencyId,profile.client_id||0]);
  const clients=[];
  for(const c of links) {
    try{await requireInsuranceLink(profile.guardian_user_id,c.id,agencyId,db);}catch(e){if(e.status===403)continue;throw e;}
    const coverage=await readClientInsurance(c.id,agencyId,db);
    const currentCoverage=Number(coverage?.profileId)===Number(profileId)&&cardCycle(coverage)===cardCycle(profile);
    // Another parent's policy remains their private submission while staff
    // coordinates primary/secondary coverage. They can still upload its cards.
    const additionalCoverage=Number(c.assigned_profile_id)===Number(profileId);
    if(currentCoverage||additionalCoverage) {
      let verified=false;
      if(currentCoverage) {
        const [[review]]=await db.execute('SELECT status,insurance_fingerprint,through_check_id FROM client_coverage_reviews WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 1',[agencyId,c.id]);
        const [checks]=await db.execute('SELECT id,status,policy_slot,insurance_fingerprint,evidence_encrypted FROM client_coverage_checks WHERE agency_id=? AND client_id=? ORDER BY id DESC LIMIT 20',[agencyId,c.id]);
        verified=cardCoverageVerified({fingerprint:coverageFingerprint(coverage),hasSecondary:!!coverage.secondary,review,checks:checks.map(check=>({...check,evidence:decryptFamilyBilling(check.evidence_encrypted,`coverage:${agencyId}:${c.id}`)}))});
      }
      clients.push({...c,coverageVerified:verified,
        enrolledInApp:await hasCompletedCardEnrollment(profile,c,db),
        hasRecordedCoverage:!!coverage?.primary?.insurerName});
    }
  }
  if(!clients.length)throw billingError(404,'This policy is no longer assigned to an accessible client');
  return {profile,clients,coverageVerified:clients.every(c=>c.coverageVerified),followupEligible:cardFollowupEligible({profile,clients})};
}
export async function refreshCardFollowup(context,db=pool,{locked=false}={}) {
  // Serialize review, replacement uploads and policy changes on the same profile.
  if(!locked) {
    const connection=db===pool?await pool.getConnection():db;
    try {
      await connection.beginTransaction();
      await connection.execute('SELECT id FROM guardian_insurance_profiles WHERE id=? FOR UPDATE',[context.profile.id]);
      const current=await cardContext({agencyId:context.profile.agency_id,profileId:context.profile.id,staff:true},connection);
      const result=await refreshCardFollowup(current,connection,{locked:true});
      await connection.commit();return result;
    }catch(e){await connection.rollback();throw e;}finally{if(db===pool)connection.release();}
  }
  const {profile}=context,cycle=cardCycle(profile);
  await db.execute('INSERT IGNORE INTO insurance_card_followups (profile_id,agency_id) VALUES (?,?)',[profile.id,profile.agency_id]);
  const [[old]]=await db.execute('SELECT * FROM insurance_card_followups WHERE profile_id=? AND agency_id=?',[profile.id,profile.agency_id]);
  const changed=old.cycle_hash!==cycle,progress=cardProgress(profile,old,new Date(),context.coverageVerified===true,context.followupEligible===true);
  await db.execute(`UPDATE insurance_card_followups SET cycle_hash=?,state=?,missing_slots_json=?,first_requested_at=IF(?,UTC_TIMESTAMP(),first_requested_at),rejected_slots_json=IF(?,NULL,rejected_slots_json),review_encrypted=IF(?,NULL,review_encrypted),snoozed_until=IF(?,NULL,snoozed_until) WHERE profile_id=? AND agency_id=?`,[cycle,progress.state,JSON.stringify(progress.missingSlots),changed,changed,changed,changed,profile.id,profile.agency_id]);
  return {...old,...progress,cycle_hash:cycle,first_requested_at:changed?new Date():old.first_requested_at,snoozed_until:changed?null:old.snoozed_until};
}
export async function listCardTasks({agencyId,userId,clientId=null}) {
  const [rows]=await pool.execute('SELECT id FROM guardian_insurance_profiles WHERE guardian_user_id=? AND agency_id=? ORDER BY id DESC',[userId,agencyId]);
  const tasks=[];
  for(const row of rows) {
    try {
      const context=await cardContext({agencyId,userId,profileId:row.id});
      if(clientId&&!context.clients.some(c=>Number(c.id)===Number(clientId)))continue;
      const progress=await refreshCardFollowup(context);
      tasks.push({profileId:row.id,uploadSlots:encouragedCardSlots(context.profile),cycle:progress.cycle_hash,clients:context.clients.map(c=>({id:c.id,name:c.full_name||c.initials})),state:progress.state,coverageVerified:progress.coverageVerified,slots:progress.slots,missingSlots:progress.missingSlots,emailEnabled:!!progress.email_enabled});
    }catch(e){if(e.status!==404)throw e;}
  }
  return tasks;
}
export async function uploadCard(input,file,deps={}) {
  if(!CARD_SLOTS.includes(input.slot)||!validCardFile(file))throw billingError(400,'Choose a JPEG, PNG or PDF up to 10 MB for the selected card side');
  const context=await cardContext(input),profile=context.profile,cycle=cardCycle(profile);
  if(input.cycle!==cycle)throw billingError(409,'Insurance changed. Refresh before uploading the card');
  const storage=deps.storage||StorageService,cryptoService=deps.crypto||DocumentEncryptionService;
  const bucket=await storage.getGCSBucket();
  if(!bucket||!cryptoService.isConfigured())throw billingError(503,'Encrypted document storage is unavailable');
  const key=`insurance-cards/${input.agencyId}/${profile.id}/${input.slot}-${crypto.randomUUID()}.enc`;
  const aad=JSON.stringify({agencyId:Number(input.agencyId),profileId:Number(profile.id),slot:input.slot,cycle});
  const encrypted=await cryptoService.encryptBuffer(file.buffer,{aad});
  await bucket.file(key).save(encrypted.encryptedBuffer,{contentType:'application/octet-stream',metadata:{metadata:{isEncrypted:'1',originalMimeType:file.mimetype,originalFilename:String(file.originalname||'card').slice(0,255),checksum:crypto.createHash('sha256').update(file.buffer).digest('hex'),uploader:String(input.userId),uploadedAt:new Date().toISOString(),encryptionKeyId:String(encrypted.encryptionKeyId||''),encryptionWrappedKey:String(encrypted.encryptionWrappedKeyB64||''),encryptionIv:String(encrypted.encryptionIvB64||''),encryptionAuthTag:String(encrypted.encryptionAuthTagB64||''),encryptionAad:aad}}});
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[locked]]=await db.execute('SELECT * FROM guardian_insurance_profiles WHERE id=? AND agency_id=? AND guardian_user_id=? FOR UPDATE',[profile.id,input.agencyId,input.userId]);
    const current=decodeInsuranceProfile(locked);
    if(!current||cardCycle(current)!==cycle)throw billingError(409,'Insurance changed during upload. Refresh and try again');
    await cardContext(input,db);
    current[cardUrlKey(input.slot)]=`gs://${bucket.name}/${key}`;
    await db.execute('UPDATE guardian_insurance_profiles SET private_payload=? WHERE id=? AND agency_id=? AND guardian_user_id=?',[encryptFamilyBilling(current,`insurance:${input.agencyId}:${input.userId}`),profile.id,input.agencyId,input.userId]);
    const [[followup]]=await db.execute('SELECT rejected_slots_json FROM insurance_card_followups WHERE profile_id=? FOR UPDATE',[profile.id]);
    if(followup)await db.execute("UPDATE insurance_card_followups SET state=IF(state='help','help','missing'),rejected_slots_json=?,snoozed_until=NULL WHERE profile_id=?",[JSON.stringify(parse(followup.rejected_slots_json,[]).filter(s=>s!==input.slot)),profile.id]);
    await refreshCardFollowup(await cardContext(input,db),db,{locked:true});
    await auditBilling({agencyId:input.agencyId,userId:input.userId,action:'insurance_card_uploaded',objectId:profile.id},db);
    await db.commit();
  }catch(e){await db.rollback();throw e;}finally{db.release();}
  return {uploaded:true};
}
export async function cardFile(input,slot,deps={}) {
  if(!CARD_SLOTS.includes(slot))throw billingError(400,'Choose a valid card side');
  const {profile}=await cardContext(input);
  const bucket=await (deps.storage||StorageService).getGCSBucket(),reference=String(profile[cardUrlKey(slot)]||'');
  const prefixes=[`gs://${bucket?.name}/insurance-cards/${input.agencyId}/${profile.id}/`,...(profile.intake_submission_id?[`gs://${bucket?.name}/intake-insurance/${profile.intake_submission_id}/`]:[])];
  if(!bucket||!prefixes.some(p=>reference.startsWith(p))||reference.includes('..'))throw billingError(404,'Card image not found');
  const file=bucket.file(reference.slice(`gs://${bucket.name}/`.length));
  const [[buffer],[metadata]]=await Promise.all([file.download(),file.getMetadata()]);
  const m=metadata.metadata||{};
  if(m.isEncrypted!=='1')throw billingError(409,'This document requires storage review');
  const body=await (deps.crypto||DocumentEncryptionService).decryptBuffer({encryptedBuffer:buffer,encryptionKeyId:m.encryptionKeyId,encryptionWrappedKeyB64:m.encryptionWrappedKey,encryptionIvB64:m.encryptionIv,encryptionAuthTagB64:m.encryptionAuthTag,aad:m.encryptionAad});
  await auditBilling({agencyId:input.agencyId,userId:input.userId,action:input.staff?'staff_view_insurance_card':'view_own_insurance_card',objectId:profile.id});
  return {body,type:['image/jpeg','image/png','application/pdf'].includes(m.originalMimeType)?m.originalMimeType:'application/octet-stream'};
}
export async function updateCardTask(input) {
  const db=await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM guardian_insurance_profiles WHERE id=? AND agency_id=? FOR UPDATE',[input.profileId,input.agencyId]);
    const context=await cardContext(input,db),progress=await refreshCardFollowup(context,db,{locked:true});
    if(!context.followupEligible && input.action!=='email_preference')throw billingError(409,'Insurance card follow-up is disabled for this client.');
    if(input.cycle!==progress.cycle_hash)throw billingError(409,'Insurance changed. Refresh this request');
    if(input.action==='email_preference')await db.execute('UPDATE insurance_card_followups SET email_enabled=? WHERE profile_id=?',[input.enabled===true,input.profileId]);
    else if(['help','resume'].includes(input.action)) {
      if(input.action==='help'&&!['missing','help'].includes(progress.state))throw billingError(409,'No missing-card help request is needed for this policy');
      if(input.action==='resume'&&progress.state!=='help')throw billingError(409,'This request is not paused for help');
      await db.execute('UPDATE insurance_card_followups SET state=?,next_check_at=UTC_TIMESTAMP() WHERE profile_id=?',[input.action==='help'?'help':'missing',input.profileId]);
    }else if(input.staff&&['complete','waived','replace','snooze','delivery_reviewed'].includes(input.action)) {
      if(!String(input.reason||'').trim())throw billingError(400,'Record the review reason');
      const slots=Array.isArray(input.slots)?input.slots:[];
      if(input.action==='complete'&&progress.missingSlots.length)throw billingError(409,'Upload both sides before approving the images, or waive the optional card request');
      if(input.action==='replace'&&(!slots.length||slots.some(s=>!progress.encouragedSlots.includes(s))))throw billingError(400,'Choose the card sides that need replacement');
      await db.execute('INSERT INTO insurance_card_reviews (profile_id,agency_id,actor_user_id,cycle_hash,action,evidence_encrypted) VALUES (?,?,?,?,?,?)',[input.profileId,input.agencyId,input.userId,input.cycle,input.action,
        encryptFamilyBilling({reason:String(input.reason).slice(0,2000),slots,documents:Object.fromEntries(CARD_SLOTS.map(slot=>[slot,context.profile[cardUrlKey(slot)]||null]))},`insurance-review:${input.agencyId}:${input.profileId}`)]);
      const keep=['snooze','delivery_reviewed'].includes(input.action);
      if(input.action==='delivery_reviewed')await db.execute("UPDATE insurance_card_deliveries SET status='reviewed' WHERE profile_id=? AND cycle_hash=? AND status IN ('sending','unknown','held')",[input.profileId,input.cycle]);
      await db.execute('UPDATE insurance_card_followups SET state=?,rejected_slots_json=?,review_encrypted=?,snoozed_until=?,next_check_at=UTC_TIMESTAMP() WHERE profile_id=? AND cycle_hash=?',[
        input.action==='replace'?'missing':keep?progress.state:input.action,
        JSON.stringify(keep?parse(progress.rejected_slots_json,[]):input.action==='replace'?slots:[]),
        encryptFamilyBilling({reason:String(input.reason).slice(0,2000),actor:input.userId,at:new Date().toISOString()},`insurance-review:${input.agencyId}:${input.profileId}`),
        input.action==='snooze'?new Date(Date.now()+7*86400000):keep?progress.snoozed_until:null,input.profileId,input.cycle]);
    }else throw billingError(400,'Choose a supported action');
    await auditBilling({agencyId:input.agencyId,userId:input.userId,action:`insurance_card_${input.action}`,objectId:input.profileId},db);
    await db.commit();return {updated:true};
  }catch(e){await db.rollback();throw e;}finally{db.release();}
}
