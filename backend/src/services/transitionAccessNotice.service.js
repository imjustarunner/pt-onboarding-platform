import pool from '../config/database.js';
import {canRunMeetingPhoneMaintenance} from './schedulingWorkerGate.js';
import {hasTransitionClientImportAccess} from './transitionClientImportAccess.service.js';
import {transitionPractices} from './transitionWorkspace.service.js';
const REQUEST='practice_transition_access_notice_requested';
const MARKERS=['practice_transition_access_notice_processing','practice_transition_access_notice_sent','practice_transition_access_notice_review'];
const SUBJECT='auricwell-transition-sequence@ptonboard-dev.iam.gserviceaccount.com';
const BODY='AuricWell: Your ITSCO/NLU transition workspace and Add client from TherapyNotes access are active. Sign in: https://plottwisthq.com/practice-transition. In Client Management, choose Add client from TherapyNotes.';
const parse=value=>typeof value==='string'?JSON.parse(value):value;
async function append(db,action,agencyId,metadata){
 await db.execute('INSERT INTO user_activity_log(action_type,user_id,agency_id,user_agent,metadata) VALUES(?,NULL,?,\'transition-access-notifier\',?)',[action,agencyId,JSON.stringify({actorType:'automation',automationSubject:'backend:transition-access-notifier',...metadata})]);
}
export async function dispatchTransitionAccessNotice(user,agencyId,{database=pool}={}){
 const {default:User}=await import('../models/User.model.js');
 const {phoneFingerprint}=await import('../utils/staffCommunicationChoices.js');
 const {prepareSmsDelivery,resolveRegisteredSmsSender}=await import('./smsCompliance.service.js');
 const {default:Vonage}=await import('./vonage.service.js');
 const {default:SmsLog}=await import('../models/NotificationSmsLog.model.js');
 const [[prefs]]=await database.execute('SELECT sms_enabled,notification_categories FROM user_preferences WHERE user_id=?',[user.id]);
 const settings=parse(prefs?.notification_categories||'{}')?.[`staff_communications_${agencyId}`];
 const phone=[user.personal_phone,user.phone_number,user.work_phone].map(User.normalizePhone).filter(Boolean).find(p=>settings?.phoneHash===phoneFingerprint(p));
 let sms=null;
 if(prefs?.sms_enabled&&settings?.choices?.notifications===true&&phone){
  const from=await resolveRegisteredSmsSender({agencyId,purpose:'workforce'});
  if(from){const candidate={agencyId,purpose:'workforce',staffNotificationKind:'notifications',to:phone,from,body:BODY};try{await prepareSmsDelivery(candidate);sms=candidate;}catch(error){if(!String(error.code||'').startsWith('sms_'))throw error;}}
 }
 if(sms){
  const record=await SmsLog.create({userId:user.id,agencyId,toNumber:sms.to,fromNumber:sms.from,body:BODY,status:'pending'});
  try{const receipt=await Vonage.sendSms(sms);if(!receipt?.sid)throw Error('Unconfirmed SMS receipt');await SmsLog.updateStatus(record.id,{status:'sent',providerRef:receipt.sid,errorMessage:null});return {channel:'sms',reference:receipt.sid,smsLogId:record.id};}
  catch(error){await SmsLog.updateStatus(record.id,{status:'pending',errorMessage:'Activation text requires receipt review; no automatic resend.'});throw error;}
 }
 const {sendEmailFromIdentity}=await import('./unifiedEmail/unifiedEmailSender.service.js');
 const [[sender]]=await database.execute("SELECT id FROM email_sender_identities WHERE agency_id=2 AND identity_key='transition_sequence' AND from_email='transitions@auricwell.com' AND is_active=1");
 if(!sender)throw Error('Verified transition sender unavailable');
 const result=await sendEmailFromIdentity({senderIdentityId:sender.id,to:user.work_email||user.email,subject:'Your transition and TherapyNotes client import access are active',text:BODY,source:'manual',templateType:'manual_email',userId:user.id,generatedByUserId:null});
 if(!result?.id||result.pendingApproval||result.queued||result.blocked||result.skipped||result.redirected)throw Error('Activation email needs delivery review');
 return {channel:'email',reference:result.id};
}
export async function processTransitionAccessNotices({database=pool,gate=canRunMeetingPhoneMaintenance,deliver=dispatchTransitionAccessNotice}={}){
 if(!await gate())return {inactiveRevision:true};
 const connection=await database.getConnection();let held=false;
 try{
  const [[lock]]=await connection.execute("SELECT GET_LOCK('transition-access-notices',0) acquired");held=!!lock.acquired;if(!held)return {busy:true};
  const [requests]=await connection.execute(`SELECT r.id,r.agency_id,r.metadata FROM user_activity_log r WHERE r.action_type=? AND r.user_id IS NULL
   AND JSON_UNQUOTE(JSON_EXTRACT(r.metadata,'$.actorType'))='automation' AND JSON_UNQUOTE(JSON_EXTRACT(r.metadata,'$.automationSubject'))=?
   AND NOT EXISTS(SELECT 1 FROM user_activity_log m WHERE m.action_type IN (?,?,?) AND m.user_id IS NULL AND CAST(JSON_UNQUOTE(JSON_EXTRACT(m.metadata,'$.requestId')) AS UNSIGNED)=r.id) ORDER BY r.id LIMIT 5`,[REQUEST,SUBJECT,...MARKERS]);
  let sent=0,review=0;
  for(const request of requests){
   const data=parse(request.metadata),uid=Number(data.targetUserId),agencyId=Number(request.agency_id),audit={requestId:Number(request.id),targetUserId:uid};
   // Persist before dispatch. A crash or uncertain carrier response is held for
   // review, never silently retried by another revision or worker.
   await append(connection,MARKERS[0],agencyId,audit);
   try{
    if(agencyId!==2||!Number.isSafeInteger(uid)||uid<1)throw Error('Unsupported access notice scope');
    const [[user]]=await connection.execute('SELECT id,role,personal_phone,phone_number,work_phone,work_email,email FROM users WHERE id=? AND is_active=1 AND COALESCE(is_archived,0)=0',[uid]);
    if(!user)throw Error('Active staff recipient required');
    const practices=await transitionPractices(user,connection);
    for(const id of [2,6])if(!practices.some(p=>p.id===id)||!await hasTransitionClientImportAccess(user,id,connection))throw Error('Verify both requested access grants before notifying');
    const result=await deliver(user,agencyId,{database:connection});
    if(!['sms','email'].includes(result?.channel)||!result.reference)throw Error('Delivery receipt required');
    await append(connection,MARKERS[1],agencyId,{...audit,...result});sent++;
   }catch(error){await append(connection,MARKERS[2],agencyId,{...audit,reason:error.code||'DELIVERY_REVIEW_REQUIRED'});review++;}
  }
  return {sent,review};
 }finally{if(held)await connection.execute("SELECT RELEASE_LOCK('transition-access-notices')");connection.release();}
}
