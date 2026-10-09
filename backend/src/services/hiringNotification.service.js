import pool from '../config/database.js';
import {taskPhase} from './hireJourney.service.js';
import {portalPacket} from './hirePortalWorkflow.service.js';
import {buildPublicAppUrl} from '../utils/publicPortalUrl.js';
import VonageService from './vonage.service.js';
import {sendNotificationEmail} from './unifiedEmail/unifiedEmailSender.service.js';
import {resolveRegisteredSmsSender} from './smsCompliance.service.js';
const parse=v=>typeof v==='string'?JSON.parse(v):v;
export const HIRING_EVENT_TEXT = Object.freeze({
 prehire_invite:'Your private pre-hire portal is ready.',
 prehire_complete:'Your pre-hire information is complete and submitted for review.',
 onboarding_started:'Your onboarding is ready. Continue using your personal portal.',
 onboarding_complete:'Your onboarding is complete and submitted for review.',
 document_added:'You have a new document to review in your portal.',
 training_added:'You have a new training item in your portal.',
 item_added:'You have a new item in your portal.'
});
export function hiringSnapshotEvents(previous,current) {
 if(!previous)return [];
 const events=[];
 for(const [key,type] of [['prehireCompletedAt','prehire_complete'],['onboardingStartedAt','onboarding_started'],['onboardingCompletedAt','onboarding_complete']])
  if(current[key]&&!previous[key])events.push({key:type,type});
 // A phase opening already has one notification explaining the new package.
 for(const phase of ['pre_hire','onboarding']){
  if(!previous.steps?.[phase] || (phase==='onboarding' && current.onboardingStartedAt && !previous.onboardingStartedAt))continue;
  const seen=new Set(previous.steps[phase].map(s=>s.key));
  for(const step of current.steps?.[phase]||[])if(!seen.has(step.key)&&step.kind!=='review')events.push({key:`${phase}:${step.key}`,type:step.kind==='document'||step.taskType==='document'?'document_added':step.taskType==='training'?'training_added':'item_added'});
 }
 return events;
}
export async function hiringNotificationSnapshot(userId,agencyId,status,db=pool){
 const [[journey]]=await db.execute('SELECT prehire_completed_at,onboarding_started_at,onboarding_completed_at FROM hire_journeys WHERE user_id=? AND agency_id=?',[userId,agencyId]);
 const [tasks]=await db.execute(`SELECT id,task_type,title,metadata,reference_id FROM tasks WHERE assigned_to_user_id=?
   AND task_type IN ('document','training','intake_form','custom')
   AND (task_type <> 'custom' OR JSON_EXTRACT(metadata,'$.checklistItemId') IS NOT NULL)
   AND (document_action_type IS NULL OR document_action_type <> 'countersignature')
   AND status NOT IN ('overridden','archived','deleted')`,[userId]);
 const packet=await portalPacket(userId,agencyId);
 const steps={pre_hire:[],onboarding:[]};
 for(const task of tasks){const phase=taskPhase(task,status);if(steps[phase])steps[phase].push({key:`task-${task.id}`,kind:'task',taskType:task.task_type});}
 for(const doc of packet.documents||[])if(doc.kind!=='acknowledgement'&&!(doc.templateId&&tasks.some(t=>t.task_type==='document'&&Number(t.reference_id)===Number(doc.templateId))))steps.pre_hire.push({key:`doc-${doc.id}`,kind:'document'});
 for(const resource of packet.workflow?.resources||[])if(steps[resource.phase]&&resource.kind!=='document')steps[resource.phase].push({key:resource.id,kind:resource.kind});
 return {prehireCompletedAt:journey?.prehire_completed_at,onboardingStartedAt:journey?.onboarding_started_at,onboardingCompletedAt:journey?.onboarding_completed_at,steps};
}
export async function queueHiringNotification({userId,agencyId,key,type,emailAlreadyHandled=false,skipDelivery=false},db=pool){
 if(!HIRING_EVENT_TEXT[type])throw new Error('Unknown hiring notification event');
 await db.execute(`INSERT IGNORE INTO hire_communication_preferences(user_id,agency_id) VALUES (?,?)`,[userId,agencyId]);
 await db.execute(`INSERT IGNORE INTO hire_notification_events(user_id,agency_id,event_key,event_type,email_status,sms_status)
   VALUES (?,?,?,?,?,?)`,[userId,agencyId,key,type,emailAlreadyHandled||skipDelivery?'handled':'pending',skipDelivery?'skipped':'pending']);
}
export async function runHiringNotifications(){
 const db=await pool.getConnection();let locked=false;
 try{
  const [[lock]]=await db.execute("SELECT GET_LOCK('hiring-notification-worker',0) AS acquired");
  locked=Number(lock?.acquired)===1;if(!locked)return;
  const [people]=await db.execute(`SELECT p.*,u.passwordless_token,u.passwordless_token_expires_at,u.passwordless_token_purpose,
    u.status,u.personal_email,u.email,a.slug,a.name,a.custom_domain
    FROM hire_communication_preferences p JOIN users u ON u.id=p.user_id JOIN agencies a ON a.id=p.agency_id
    WHERE u.status IN ('PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING')
    ORDER BY p.updated_at,p.user_id LIMIT 500`);
  for(const person of people){
   try{
    const current=await hiringNotificationSnapshot(person.user_id,person.agency_id,person.status,db);
    await db.beginTransaction();
    for(const event of hiringSnapshotEvents(parse(person.observed_snapshot),current))await queueHiringNotification({userId:person.user_id,agencyId:person.agency_id,...event},db);
    await db.execute('UPDATE hire_communication_preferences SET observed_snapshot=? WHERE user_id=? AND agency_id=?',[JSON.stringify(current),person.user_id,person.agency_id]);
    await db.commit();
   }catch(e){await db.rollback();console.warn('[hiring-notifications] Unable to observe journey',person.user_id,e.code||e.name);}
  }
  const [events]=await db.execute(`SELECT e.*,p.channel,p.phone,u.status,u.personal_email,u.email,u.passwordless_token,
    u.passwordless_token_expires_at,u.passwordless_token_purpose,a.slug,a.name,a.custom_domain
    FROM hire_notification_events e JOIN hire_communication_preferences p ON p.user_id=e.user_id AND p.agency_id=e.agency_id
    JOIN users u ON u.id=e.user_id JOIN agencies a ON a.id=e.agency_id
    WHERE e.email_status='pending' OR e.sms_status='pending' ORDER BY e.id LIMIT 100`);
  for(const event of events){
   const validToken=['PENDING_SETUP','PREHIRE_OPEN','PREHIRE_REVIEW','ONBOARDING'].includes(event.status)&&event.passwordless_token_purpose==='prehire_portal'&&event.passwordless_token&&new Date(event.passwordless_token_expires_at)>new Date();
   const url=validToken?buildPublicAppUrl(event,`pre-hire/${event.passwordless_token}`):null;
   const text=`${HIRING_EVENT_TEXT[event.event_type]}${url?`\n${url}\nKeep this personal link private.`:' Contact People Operations for a current portal link.'}`;
   for(const channel of ['email','sms']){
    if(event[`${channel}_status`]!=='pending')continue;
    const [claim]=await db.execute(`UPDATE hire_notification_events SET ${channel}_status='sending' WHERE id=? AND ${channel}_status='pending'`,[event.id]);
    if(!claim.affectedRows)continue;
    let status='sent';
    try{
     if(channel==='email'){
      const to=event.personal_email||event.email;
      if(!to)status='skipped';
      else {const result=await sendNotificationEmail({agencyId:event.agency_id,userId:event.user_id,triggerKey:'pre_hire_admin_review_access',templateType:'hiring_portal_update',to,subject:`${event.name}: hiring and onboarding update`,text});
       if(result?.pendingApproval||result?.queued)status='held';
       else if(result?.skipped||result?.blocked||result?.failed||!result?.id)status='failed';}
     }else if(event.channel!=='email_sms'||!event.phone)status='skipped';
     else {
      const from=await resolveRegisteredSmsSender({agencyId:event.agency_id,purpose:'workforce'});
      if(!from)status='skipped';
      else await VonageService.sendSms({purpose:'workforce',to:event.phone,from,body:text,agencyId:event.agency_id,staffNotificationKind:'hiring',hiringUserId:event.user_id});
     }
    }catch(error){status='failed';console.warn('[hiring-notifications] Delivery did not complete',event.id,channel,error.code||error.name);}
    // Ambiguous transport failures are retained for review, never blindly resent.
    await db.execute(`UPDATE hire_notification_events SET ${channel}_status=? WHERE id=?`,[status,event.id]);
   }
  }
 }finally{try{if(locked)await db.execute("SELECT RELEASE_LOCK('hiring-notification-worker')");}finally{db.release();}}
}
