import { sendSupervisionRsvpSms } from './supervisionRsvpSms.service.js';
import { isStudentIntern } from '../utils/studentIntern.js';
import { sharedCalendarJoinUrl } from '../utils/meetingCalendarLink.js';
import SupervisionSession from '../models/SupervisionSession.model.js';
import ProviderScheduleEvent from '../models/ProviderScheduleEvent.model.js';
import { priorityEventEmailRecipient } from './priorityEventEmail.service.js';
import { huddleTitle } from './huddlePolicy.js';
import pool from '../config/database.js';
import { ensureSupervisionReplyMailbox } from './supervisionReplyMailbox.service.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { interviewCalendar } from '../utils/interviewCalendar.js';
import { supervisionEmailBody } from '../utils/supervisionEmailBody.js';
import { personalMeetingInvitation } from './meetingInvitations.service.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { tenantMeetingBase } from '../utils/tenantMeetingUrl.js';
import { ensureTenantMessageMailboxes } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { duePresenterReminders } from './supervisionPresenterReminderPolicy.js';
import { parseMeetingSettings } from './meetingSettingsPolicy.js';
import { getSupervisionSignupWindow } from './supervisionSignupWindow.js';
import { canUserSignup, getViewerSignupState } from './supervisionSignup.service.js';
import { escapeMeetingHtml as esc } from './meetingInvitationPolicy.js';
import { pendingOptionalSupervision } from './supervisionAttendancePolicy.js';

// Explicit organizer opt-in only. Existing sessions and regular invited sessions
// never start broadcasting signup emails when this code is deployed.
export function signupInvitationDue(session, now = new Date()) {
 const settings = parseMeetingSettings(session.meeting_settings_json);
 const window = getSupervisionSignupWindow(session, now);
 return session.enrollment_mode === 'signup_only' && settings.signupInvitationEnabled === true
   && session.status === 'SCHEDULED' && Number(session.notify_participants ?? 1) !== 0 && window.signupOpen;
}

export function supervisionCalendar(session, joinUrl) {
 const calendarJoinUrl=sharedCalendarJoinUrl(session,joinUrl);
 if (!calendarJoinUrl) return null;
 const calendar=interviewCalendar({startsAt:session.start_at,endsAt:session.end_at,timezone:session.event_timezone||'America/Denver',title:session.kind==='HUDDLE'?huddleTitle(session,session.host_role):session.session_type==='group'?'Group supervision':'Individual supervision',publicJoinUrl:calendarJoinUrl,uid:`${session.kind==='HUDDLE'?'huddle':'supervision'}-${session.agency_id}-${session.id}@meetings`,description:'Calendar links join as a guest unless you are signed in. Use the private link in your email to join as yourself without signing in.'});
 if(calendar){const url=new URL(joinUrl);calendar.downloadUrl=`${url.origin}/api/meeting-invitations/${encodeURIComponent(url.pathname.split('/').pop())}/calendar.ics?eventId=${session.id}`;}
 return calendar;
}
export async function supervisionEmailPeople(session) {
 if(session.kind==='HUDDLE'){
  const [rows]=await pool.execute(`SELECT u.id,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name,u.email,u.work_email,u.role,COALESCE(p.is_required,1) is_required,COALESCE(p.is_cohost,0) is_cohost,COALESCE(p.rsvp,'pending') rsvp FROM users u LEFT JOIN meeting_participant_preferences p ON p.user_id=u.id AND p.event_id=? WHERE u.id=? OR u.id IN (SELECT user_id FROM provider_schedule_event_attendees WHERE event_id=?)`,[session.id,session.provider_id,session.id]);
  return rows.map(r=>({...r,name:[r.first_name,r.last_name].filter(Boolean).join(' '),status:r.rsvp==='declined'?'DECLINED':r.rsvp==='accepted'?'SIGNED_UP':'INVITED',participant_role:Number(r.id)===Number(session.provider_id)?'host':'supervisee',isPresenter:false}));
 }

 const [rows]=await pool.execute(`SELECT u.id,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name,u.email,u.work_email,u.role,u.credential,u.title,u.employment_type,a.status,a.is_required,a.participant_role,a.decline_reason,a.is_compensable_snapshot,
 ua.supervision_is_prelicensed,ua.supervision_is_compensable,ua.supervision_start_date,
 COALESCE(sa.individual_hours,0) AS supervision_individual_hours,COALESCE(sa.group_hours,0) AS supervision_group_hours,
 (SELECT cp.status FROM supervision_case_presentations cp WHERE cp.session_id=a.session_id AND cp.presenter_user_id=u.id LIMIT 1) presentationStatus,
 EXISTS(SELECT 1 FROM supervision_session_presenters p WHERE p.session_id=? AND p.user_id=u.id) isPresenter
 FROM users u LEFT JOIN supervision_session_attendees a ON a.user_id=u.id AND a.session_id=?
 LEFT JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=?
 LEFT JOIN supervision_accounts sa ON sa.user_id=u.id AND sa.agency_id=ua.agency_id
 WHERE u.id IN (?,?,?) OR (a.user_id IS NOT NULL AND a.status NOT IN ('REMOVED','CANCELLED'))`,[session.id,session.id,session.agency_id,session.supervisor_user_id,session.co_facilitator_user_id||null,session.supervisee_user_id||null]);
 return rows.map(row=>({...row,name:[row.first_name,row.last_name].filter(Boolean).join(' '),isPresenter:!!Number(row.isPresenter)}));
}
export async function prepareSupervisionEmail({session,user,joinUrl,kind='invitation'}) {
 if (kind === 'signup_invitation') {
  if (['DECLINED','WITHDRAWN'].includes((await getViewerSignupState(session.id,user.id)).status)) return {skipped:true,reason:'not_interested'};
  if (session.enrollment_mode !== 'signup_only' || parseMeetingSettings(session.meeting_settings_json).signupInvitationEnabled !== true
    || !(await canUserSignup({sessionRow:session,userId:user.id})).ok) return {skipped:true,reason:'not_signup_eligible'};
  const identity = await resolveMeetingRecipient({agencyId:session.agency_id,user});
  const mailboxes = await ensureTenantMessageMailboxes(session.agency_id);
  const base = await tenantMeetingBase(session.agency_id);
  const when = new Intl.DateTimeFormat('en-US',{dateStyle:'full',timeStyle:'short',timeZone:session.event_timezone || 'America/Denver'}).format(parseUtcDate(session.start_at));
  const text = `Hi ${user.first_name || ''},\n\nOptional group supervision is available ${when} (${session.event_timezone || 'America/Denver'}). Participation is optional and not compensated.${isStudentIntern(user) ? ' Record attended supervision as indirect hours toward your master’s internship requirements.' : ''} RSVP only if you plan to attend; no decline or reason is needed.\n\nOpen My Schedule and select this group supervision to sign up. Signup opens 24 hours before the session and closes one hour before it starts; the session is canceled if nobody signs up.\n\n${base}/dashboard?tab=my_schedule\n\nThis is your one signup invitation for this date. You have not been registered automatically.`;
  return {to:identity.email,senderIdentityId:mailboxes.notifications.id,replyToOverride:`leadership@${mailboxes.domain || mailboxes.notifications.from_email.split('@')[1]}`,
   subject:`Optional group supervision — sign up for ${when}`,text,html:`<p>${esc(text).replace(/\n/g,'<br>')}</p><p><a href="${esc(base)}/dashboard?tab=my_schedule">Open My Schedule to sign up</a></p>`,
   agencyId:session.agency_id,userId:user.id,templateType:'meeting_invited',source:'auto'};
 }
 const people=await supervisionEmailPeople(session);
 const recipient=people.find(p=>Number(p.id)===Number(user.id));
 if(!recipient||['DECLINED','WITHDRAWN','REMOVED','CANCELLED'].includes(recipient.status))return {skipped:true,reason:'not_attending'};
 // Older recurring copies may have an INVITED row for last week's registrants.
 // That is not registration for this date: only the dedicated 24-hour signup
 // invitation may reach them until they explicitly sign up again.
 if(session.enrollment_mode==='signup_only'
   && ![session.supervisor_user_id,session.co_facilitator_user_id].some(id=>Number(id)>0 && Number(id)===Number(user.id))
   && !['SIGNED_UP','JOINED'].includes(String(recipient.status || '').toUpperCase()))return {skipped:true,reason:'signup_registration_required'};
 const huddle=session.kind==='HUDDLE';
 if(!huddle && kind.startsWith('presenter:') && !recipient.isPresenter)return {skipped:true,reason:'no_longer_presenting'};
 // Presenter preparation has its own five deadlines. Do not also send the
 // generic attendee reminder at the same time (or the default five-minute one).
 if(!huddle && recipient.isPresenter && kind!=='invitation' && !kind.startsWith('presenter:'))return {skipped:true,reason:'presenter_reminder_schedule'};
 if(pendingOptionalSupervision(session,recipient) && kind!=='invitation' && !['join:10080','join:4320'].includes(kind))return {skipped:true,reason:'optional_registration_reminder_schedule'};
 const hostIds=huddle?[Number(session.provider_id),...people.filter(p=>Number(p.is_cohost)).map(p=>Number(p.id))]:[session.supervisor_user_id,session.co_facilitator_user_id].map(Number);
 const hosts=people.filter(p=>hostIds.includes(Number(p.id)));
 const base=await tenantMeetingBase(session.agency_id);
 const personal=joinUrl||(await personalMeetingInvitation(session,user.id)).url;
 const hostRole=hosts[0]?.role;
 const calendarSession=session.participant_join_token||session.join_token?session:await (huddle?ProviderScheduleEvent:SupervisionSession).resolveByJoinRef(String(session.id));
 const calendar=supervisionCalendar({...session,...calendarSession,host_role:hostRole},personal);
 if(!calendar) return {skipped:true,reason:'invalid_dates'};
 const recipientIdentity=await resolveMeetingRecipient({agencyId:session.agency_id,user});
 const mailboxes=await ensureTenantMessageMailboxes(session.agency_id);
 const delivery=await priorityEventEmailRecipient({agencyId:session.agency_id,userId:user.id,templateType:'meeting_invited',to:recipientIdentity.email});
 const replyMailbox=huddle ? await ensureSupervisionReplyMailbox(session.agency_id,{replyEmail:delivery.to}) : null;
 const leadershipReplyTo = !huddle ? `leadership@${mailboxes.domain || mailboxes.notifications.from_email.split('@')[1]}` : null;
 const detailsUrl=`${personal}?details=1&eventId=${session.id}`;
 const content=supervisionEmailBody({session:huddle?{...session,session_type:people.length>2?'group':'individual'}:session,meetingTitle:huddle?huddleTitle(session,hostRole):null,hostLabel:huddle?(huddleTitle(session,hostRole)==='CPA Meeting'?'Clinical Practice Assistant':'Internship Mentor'):null,people,recipientName:user.first_name||recipient.name,hostNames:hosts.map(p=>p.name),calendar,joinUrl:personal,
 rsvpUrl:`${personal}?rsvp=1&eventId=${session.id}`,presentationUrl:`${base}/supervision/sessions/${session.id}/presentation`,detailsUrl,
 recipient,preparationComplete:['ready','presented'].includes(recipient.presentationStatus),
 isRequired:recipient.isPresenter || (recipient.is_required == null ? hostIds.includes(Number(user.id)) : !!Number(recipient.is_required)),isPresenter:recipient.isPresenter,isHost:hostIds.includes(Number(user.id)),kind,leadershipReplyTo});
 return {...content,to:recipientIdentity.email,senderIdentityId:mailboxes.notifications.id,replyToOverride:leadershipReplyTo || `"${hosts.map(p=>p.name).join(" & ").replace(/[\r\n"<>]/g, "")} via the app" <${replyMailbox.from_email}>`,
 attachments:[{filename:huddle?'huddle.ics':'supervision.ics',contentType:'text/calendar; charset=utf-8',contentBase64:Buffer.from(calendar.ics).toString('base64')}],
 userId:user.id,source:'auto',templateType:kind==='invitation'?'meeting_invited':'meeting_join_reminder'};
}
export async function sendSupervisionEmail({session,user,joinUrl,kind='invitation'}) {
 if(Number(session.notify_participants??1)===0||!['SCHEDULED',...(session.kind==='HUDDLE'?['ACTIVE']:[])].includes(session.status)||parseUtcDate(session.end_at)<=new Date())return {skipped:true};
 const table=session.kind==='HUDDLE'?'huddle_email_deliveries':'supervision_email_deliveries';
 const db=await pool.getConnection();const lock=`${table}:${session.id}:${user.id}:${kind}`;let acquired=false;
 try {
 const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);acquired=!!locks[0]?.acquired;if(!acquired)return {skipped:true};
 const key=[session.id,user.id,kind,session.start_at];
 const [prior]=await db.execute(`SELECT * FROM ${table} WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?`,key);
 if(prior.length){if(prior[0].delivery_status==='sent')await sendSupervisionRsvpSms({session,user,kind});return {id:prior[0].delivery_status==='sent'?'already_sent':null,skipped:prior[0].delivery_status!=='sent'};}
 const email=await prepareSupervisionEmail({session,user,joinUrl,kind});if(email.skipped)return email;
 await db.execute(`INSERT INTO ${table} (session_id,user_id,delivery_kind,start_at,delivery_status) VALUES (?,?,?,?,'sending')`,key);
 let result;
 try { result=await sendEmailFromIdentity(email); }
 catch(error){await db.execute(`UPDATE ${table} SET delivery_status='review' WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?`,key);throw error;}
 await db.execute(`UPDATE ${table} SET delivery_status=?,internet_message_id=?,gmail_thread_id=?,communication_id=? WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?`,[result?.id&&!result.redirected?'sent':result?.pendingApproval?'approval':'held',result.internetMessageId||null,result.threadId||null,result.communicationId||null,...key]);
 if(result?.id&&!result.redirected&&!result.pendingApproval)await sendSupervisionRsvpSms({session,user,kind});
 return result;
 }finally{if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
}
// One day ahead gives optional invitees and presenters time to respond/prepare.
export async function sendSupervisionDayAheadReminders(now=new Date()) {
 const [sessions]=await pool.execute(`SELECT * FROM supervision_sessions WHERE status='SCHEDULED' AND notify_participants=1 AND start_at>? AND start_at<=DATE_ADD(?,INTERVAL 7 DAY)`,[now,now]);
 for(const session of sessions){
  if (session.enrollment_mode === 'signup_only') {
   if (signupInvitationDue(session,now)) {
    const [candidates] = await pool.execute(`SELECT u.id,u.email,u.work_email,COALESCE(NULLIF(TRIM(u.preferred_name), SPACE(0)), u.first_name) AS first_name,u.last_name,u.role,u.credential,u.title,u.employment_type FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1
      JOIN agencies org ON org.id=ua.agency_id AND org.is_active=1
      WHERE COALESCE(u.is_demo,0)=0 AND COALESCE(u.is_active,1)=1 AND COALESCE(u.is_archived,0)=0
        AND LOWER(u.role) IN ('provider','provider_plus','clinician','supervisor','admin','super_admin','support','staff','clinical_practice_assistant')
        AND UPPER(COALESCE(u.status,'')) NOT IN ('ARCHIVED','INACTIVE','INACTIVE_EMPLOYEE','TERMINATED','DELETED','PROSPECTIVE')`, [session.agency_id]);
    for (const user of candidates) {
     // sendSupervisionEmail claims the existing unique delivery receipt before
     // sending (session,user,kind,start), under a named DB lock. Repeated ticks
     // and uncertain transport failures cannot send this invitation again.
     try { await sendSupervisionEmail({session,user,kind:'signup_invitation'}); }
     catch(error) { console.warn('[Supervision signup invitation]',session.id,user.id,error.code || 'delivery_failed'); }
    }
   }
   continue;
  }
  const people=await supervisionEmailPeople(session);
  const presenterOffsets=duePresenterReminders(session,now);
  const hours=(parseUtcDate(session.start_at)-now)/3600000;
  for(const user of people){
   if(pendingOptionalSupervision(session,user))continue;
   const kinds=user.isPresenter
    ? presenterOffsets.map(minutes=>`presenter:${minutes}`)
    : !parseMeetingSettings(session.meeting_settings_json).attendanceReminders && session.reminder_minutes != null && hours>23 && hours<=24 ? ['day_before'] : [];
   for(const kind of kinds){
    try { await sendSupervisionEmail({session,user,kind}); }
    catch(error){ console.warn('[Supervision reminder]',session.id,user.id,error.code || 'delivery_failed'); }
   }
  }
 }
}
