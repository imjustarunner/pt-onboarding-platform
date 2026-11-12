import pool from '../config/database.js';
import {toUtcIso} from '../utils/zonedWallTime.util.js';
import {childcareStoredIso} from './childcarePay.service.js';
import {isNluChildcareAgency} from './compensationCategories.service.js';
import {sendCompanyEventSms} from './companyEventSms.service.js';

async function sendEmailNotice({agencyId,userId,to,text,url}) {
  const {resolveSenderIdentityForSend}=await import('./emailSenderIdentityResolver.service.js');
  const {sendEmailFromIdentity}=await import('./unifiedEmail/unifiedEmailSender.service.js');
  const {identity}=await resolveSenderIdentityForSend({agencyId,templateType:'childcare_shift_reminder',preferredKeys:['notifications','people_operations'],includePlatformDefaults:false});
  if(!identity)throw new Error('Configure this organization’s workforce email sender.');
  return sendEmailFromIdentity({senderIdentityId:identity.id,userId,to,subject:'Childcare shift: confirm your work time',text,source:'auto',templateType:'childcare_shift_reminder',linkUrl:url});
}

/** Called by the real workforce attendance scheduler. Each intended channel is claimed once. */
export async function processChildcareReminders({db=pool,now=new Date(),sendSms=sendCompanyEventSms,sendEmail=sendEmailNotice,baseUrl=process.env.FRONTEND_URL||process.env.FRONTEND_BASE_URL}={}) {
  if(!/^https?:\/\//i.test(String(baseUrl||'')))return [];
  const [rows]=await db.execute(`SELECT s.id shift_id,s.planned_children,s.actual_children,s.agency_id,s.status,s.schedule_version,
    e.id event_id,e.title,e.starts_at,e.ends_at,e.timezone,e.is_active,e.school_event_status,
    a.slug,a.feature_flags,u.id user_id,u.email,u.work_email,u.personal_email,u.phone_number,u.personal_phone,u.work_phone,
    (SELECT p.punch_type FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=e.id AND p.user_id=u.id ORDER BY p.punched_at DESC,p.id DESC LIMIT 1) last_punch,
    (SELECT COUNT(*) FROM skill_builders_event_kiosk_punches p WHERE p.company_event_id=e.id AND p.user_id=u.id AND p.punch_type='clock_in') clock_in_count
    FROM childcare_shifts s JOIN company_events e ON e.id=s.company_event_id AND e.agency_id=s.agency_id
    JOIN agencies a ON a.id=s.agency_id
    JOIN company_event_provider_assignments assignment ON assignment.company_event_id=e.id
    JOIN users u ON u.id=assignment.provider_user_id
    JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=s.agency_id AND COALESCE(ua.is_active,1)=1
    JOIN childcare_service_grants g ON g.agency_id=s.agency_id AND g.user_id=u.id AND g.enabled=1
    WHERE s.status<>'canceled' AND e.is_active=1 AND a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
      AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED')
      AND e.starts_at<=DATE_ADD(?,INTERVAL 1 HOUR) AND e.ends_at>DATE_SUB(?,INTERVAL 24 HOUR)`,[now,now]);
  const results=[];
  for(const row of rows) {
    if(!isNluChildcareAgency({id:row.agency_id,slug:row.slug}))continue;
    let flags=row.feature_flags||{};if(typeof flags==='string'){try{flags=JSON.parse(flags);}catch{flags={};}}
    if(flags.childcareEnabled===false)continue;
    const start=new Date(childcareStoredIso(row.starts_at)),end=new Date(childcareStoredIso(row.ends_at));
    const reminderType=now>=end&&now<new Date(end.getTime()+24*3600000)?'clock_out':now>=start&&now<end?'clock_in':null;
    if(!reminderType)continue;
    if(reminderType==='clock_out'?row.last_punch!=='clock_in':Number(row.clock_in_count)>0)continue;
    const url=new URL(`/${encodeURIComponent(row.slug)}/childcare`,baseUrl);url.searchParams.set('shiftId',String(row.shift_id));
    const when=new Date(childcareStoredIso(row.starts_at)).toLocaleString('en-US',{timeZone:row.timezone||'America/Denver',timeZoneName:'short'});
    const text=`Childcare shift ${when}. ${row.planned_children} children were scheduled. ${reminderType==='clock_out'?'Clock out when work ends.':'Clock in when work begins.'} Were the scheduled ${row.planned_children} children present? Confirm or correct the actual count in the app. Record count/staffing changes when they happen. ${url}`;
    for(const channel of ['email','sms']) {
      const to=channel==='email'?row.work_email||row.email||row.personal_email:row.phone_number||row.personal_phone||row.work_phone;
      if(!to)continue;
      const [receipt]=await db.execute('INSERT IGNORE INTO childcare_reminder_deliveries(shift_id,user_id,reminder_type,channel,schedule_version) VALUES (?,?,?,?,?)',[row.shift_id,row.user_id,reminderType,channel,row.schedule_version||1]);
      if(!receipt.affectedRows)continue;
      let status='review',reason=null,messageId=null;
      try {
        // Current grant/membership is rechecked in this statement immediately before dispatch.
        const [eligible]=await db.execute(`SELECT g.user_id FROM childcare_service_grants g JOIN users u ON u.id=g.user_id JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=g.agency_id
          JOIN childcare_shifts s ON s.id=? AND s.agency_id=g.agency_id
          JOIN company_events e ON e.id=s.company_event_id JOIN agencies organization ON organization.id=s.agency_id
          WHERE g.agency_id=? AND g.user_id=? AND g.enabled=1 AND COALESCE(ua.is_active,1)=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND s.status<>'canceled'
          AND s.schedule_version=? AND e.starts_at=? AND e.ends_at=? AND s.planned_children=? AND organization.slug=?
          AND e.is_active=1 AND organization.is_active=1 AND COALESCE(organization.is_archived,0)=0
          AND (JSON_EXTRACT(organization.feature_flags,'$.childcareEnabled') IS NULL OR JSON_EXTRACT(organization.feature_flags,'$.childcareEnabled')<>FALSE)
          AND UPPER(COALESCE(u.status,'')) IN ('ACTIVE','ACTIVE_EMPLOYEE','COMPLETED') AND COALESCE(u.is_assistant_account,0)=0
          AND EXISTS(SELECT 1 FROM company_event_provider_assignments assignment WHERE assignment.company_event_id=s.company_event_id AND assignment.provider_user_id=u.id)`,[row.shift_id,row.agency_id,row.user_id,row.schedule_version||1,row.starts_at,row.ends_at,row.planned_children,row.slug]);
        if(!eligible.length){status='skipped';reason='Childcare access or assignment changed.';}
        else if(channel==='sms') {
          const sent=await sendSms({eventId:row.event_id,agencyId:row.agency_id,userId:row.user_id,to,body:text,purpose:'workforce',audience:'staff',dispatchType:`childcare_${reminderType}`,batchId:`childcare:${row.shift_id}:${reminderType}:v${row.schedule_version||1}`});
          messageId=sent?.sid||sent?.providerMessageId||null;
          status=sent?.blocked||sent?.skipped?'skipped':messageId?'sent':'review';
          if(status==='review')reason='No confirmed transport message ID was returned; review before retry.';
        } else {
          const sent=await sendEmail({agencyId:row.agency_id,userId:row.user_id,to,text,url:url.toString()});
          status=sent?.pendingApproval?'approval':sent?.blocked||sent?.skipped?'skipped':sent?.id||sent?.messageId?'sent':'review';messageId=sent?.messageId||sent?.id||null;
          reason=sent?.reason||null;
        }
      } catch(error){status=Number(error.status)===403?'skipped':'review';reason=error.code||error.message;}
      await db.execute('UPDATE childcare_reminder_deliveries SET status=?,reason=?,provider_message_id=? WHERE id=?',[status,reason?String(reason).slice(0,255):null,messageId==null?null:String(messageId),receipt.insertId]);
      results.push({shiftId:Number(row.shift_id),userId:Number(row.user_id),channel,reminderType,status});
    }
  }
  return results;
}
