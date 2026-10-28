import pool from '../config/database.js';
import { resolveRegisteredSmsSender, getSmsSender, prepareSmsDelivery } from './smsCompliance.service.js';
import { assertCompanyEventSmsCampaign } from '../utils/companyEventSms.js';
import { normalizeSmsPhone } from '../utils/smsThreadIdentity.js';
import { staffCommunicationKey, phoneFingerprint } from '../utils/staffCommunicationChoices.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import Vonage from './vonage.service.js';
import SmsLog from '../models/NotificationSmsLog.model.js';
const json=value=>typeof value==='string'?JSON.parse(value):value||{};
export const isSupervisionRsvpReminder = (session,kind) => session.kind!=='HUDDLE' && session.session_type==='group'
 && session.enrollment_mode!=='signup_only' && (kind==='join_reminder'||/^(join|reminder|presenter):[1-5]$/.test(kind));
export function createSupervisionRsvpSms({db=pool,resolveSender=resolveRegisteredSmsSender,readSender=getSmsSender,prepare=prepareSmsDelivery,send=options=>Vonage.sendSms(options),log=SmsLog,invitation=personalMeetingInvitation}={}) {
 async function eligible(sessionId,userId) {
  const [[row]]=await db.execute(`SELECT s.*,u.personal_phone,u.work_phone,u.phone_number,p.sms_enabled,p.notification_categories
   FROM supervision_sessions s JOIN supervision_session_attendees a ON a.session_id=s.id AND a.user_id=?
   JOIN users u ON u.id=a.user_id JOIN user_preferences p ON p.user_id=u.id
   WHERE s.id=? AND s.status='SCHEDULED' AND s.session_type='group' AND COALESCE(s.enrollment_mode,'invited')<>'signup_only'
    AND s.notify_participants=1 AND s.start_at>UTC_TIMESTAMP() AND a.status='INVITED'
    AND (a.is_required=1 OR EXISTS(SELECT 1 FROM supervision_session_presenters pr WHERE pr.session_id=s.id AND pr.user_id=u.id))
    AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
    AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED','PROSPECTIVE')
    AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.is_active=1
      AND (ua.agency_id=s.agency_id OR JSON_CONTAINS(JSON_EXTRACT(s.meeting_settings_json,'$.audienceAgencyIds'),CAST(ua.agency_id AS JSON))))`,[userId,sessionId]);
  return row;
 }
 return async function sendRsvpSms({session,user,kind}) {
  if(!isSupervisionRsvpReminder(session,kind))return {skipped:true};
  let claimId=null,smsLogId=null;
  try {
   let row=await eligible(session.id,user.id);
   if(!row||parseUtcDate(row.start_at).getTime()!==parseUtcDate(session.start_at).getTime())return {skipped:true};
   const to=normalizeSmsPhone(row.personal_phone||row.work_phone||row.phone_number);
   const choice=json(row.notification_categories)[staffCommunicationKey(row.agency_id)];
   if(!to||!Number(row.sms_enabled)||choice?.choices?.notifications!==true||choice.phoneHash!==phoneFingerprint(to))return {skipped:true};
   const from=await resolveSender({agencyId:row.agency_id,purpose:'workforce',requiredPurpose:'polling'});
   if(!from)return {skipped:true};
   assertCompanyEventSmsCampaign(await readSender(from),'staff','workforce');
   const link=(await invitation({...session,...row},user.id)).url;
   const when=new Intl.DateTimeFormat('en-US',{timeZone:row.event_timezone||'America/Denver',weekday:'short',month:'short',day:'numeric',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(parseUtcDate(row.start_at));
   const options={to,from,purpose:'workforce',agencyId:row.agency_id,staffNotificationKind:'notifications',body:`Required group supervision is starting soon (${when}). Join here: ${link}\n\nCan't make it? Click here to record your absence: ${link}?rsvp=absence&eventId=${session.id}`};
   await prepare(options);
   // A response, removed requirement, cancellation, or changed time suppresses a queued text.
   row=await eligible(session.id,user.id);
   if(!row||parseUtcDate(row.start_at).getTime()!==parseUtcDate(session.start_at).getTime())return {skipped:true};
   const [claim]=await db.execute(`INSERT IGNORE INTO supervision_rsvp_sms_deliveries (session_id,user_id,delivery_kind,start_at) VALUES (?,?,?,?)`,[session.id,user.id,kind,session.start_at]);
   if(!claim.affectedRows)return {skipped:true,reason:'duplicate'};
   claimId=claim.insertId;
   const entry=await log.create({userId:user.id,agencyId:row.agency_id,toNumber:to,fromNumber:from,body:options.body});smsLogId=entry.id;
   // Recheck after receipt/log writes too. Transport independently rechecks STOP and consent.
   row=await eligible(session.id,user.id);
   if(!row||parseUtcDate(row.start_at).getTime()!==parseUtcDate(session.start_at).getTime()){await db.execute("UPDATE supervision_rsvp_sms_deliveries SET delivery_status='skipped' WHERE id=?",[claimId]);await log.updateStatus(smsLogId,{status:'failed',errorMessage:'RSVP no longer pending'});return {skipped:true};}
   const result=await send(options);
   await db.execute('UPDATE supervision_rsvp_sms_deliveries SET delivery_status=?,provider_ref=? WHERE id=?',[result?.sid?'sent':'review',result?.sid||null,claimId]);
   await log.updateStatus(smsLogId,{status:result?.sid?'sent':'failed',providerRef:result?.sid||null});
   return result;
  }catch(error){
   if(claimId)await db.execute("UPDATE supervision_rsvp_sms_deliveries SET delivery_status='review' WHERE id=?",[claimId]).catch(()=>{});
   if(smsLogId)await log.updateStatus(smsLogId,{status:'failed',errorMessage:String(error.code||'sms_delivery_failed')}).catch(()=>{});
   return {skipped:true,reason:error.code||'sms_delivery_failed'};
  }
 };
}
export const sendSupervisionRsvpSms=createSupervisionRsvpSms();
