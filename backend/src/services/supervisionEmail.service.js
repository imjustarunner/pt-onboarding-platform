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

export function supervisionCalendar(session, joinUrl) {
 const calendar=interviewCalendar({startsAt:session.start_at,endsAt:session.end_at,timezone:session.event_timezone||'America/Denver',title:session.session_type==='group'?'Group supervision':'Individual supervision',publicJoinUrl:joinUrl,uid:`supervision-${session.agency_id}-${session.id}@meetings`,description:`Supervision session. Your personal session link: ${joinUrl}`});
 if(calendar){const url=new URL(joinUrl);calendar.downloadUrl=`${url.origin}/api/meeting-invitations/${encodeURIComponent(url.pathname.split('/').pop())}/calendar.ics?eventId=${session.id}`;}
 return calendar;
}
export async function supervisionEmailPeople(session) {
 const [rows]=await pool.execute(`SELECT u.id,u.first_name,u.last_name,u.email,u.work_email,a.status,a.is_required,a.participant_role,
 EXISTS(SELECT 1 FROM supervision_session_presenters p WHERE p.session_id=? AND p.user_id=u.id) isPresenter
 FROM users u LEFT JOIN supervision_session_attendees a ON a.user_id=u.id AND a.session_id=?
 WHERE u.id IN (?,?,?) OR (a.user_id IS NOT NULL AND a.status NOT IN ('REMOVED','CANCELLED'))`,[session.id,session.id,session.supervisor_user_id,session.co_facilitator_user_id||null,session.supervisee_user_id||null]);
 return rows.map(row=>({...row,name:[row.first_name,row.last_name].filter(Boolean).join(' '),isPresenter:!!Number(row.isPresenter)}));
}
export async function prepareSupervisionEmail({session,user,joinUrl,kind='invitation'}) {
 const people=await supervisionEmailPeople(session);
 const recipient=people.find(p=>Number(p.id)===Number(user.id));
 if(!recipient||['DECLINED','WITHDRAWN','REMOVED','CANCELLED'].includes(recipient.status))return {skipped:true,reason:'not_attending'};
 const hostIds=[session.supervisor_user_id,session.co_facilitator_user_id].map(Number);
 const hosts=people.filter(p=>hostIds.includes(Number(p.id)));
 const base=await tenantMeetingBase(session.agency_id);
 const personal=joinUrl||(await personalMeetingInvitation(session,user.id)).url;
 const calendar=supervisionCalendar(session,personal);
 if(!calendar) return {skipped:true,reason:'invalid_dates'};
 const recipientIdentity=await resolveMeetingRecipient({agencyId:session.agency_id,user});
 const mailboxes=await ensureTenantMessageMailboxes(session.agency_id);
 const replyMailbox=await ensureSupervisionReplyMailbox(session.agency_id);
 const detailsUrl=`${personal}?details=1&eventId=${session.id}`;
 const content=supervisionEmailBody({session,people,recipientName:user.first_name||recipient.name,hostNames:hosts.map(p=>p.name),calendar,joinUrl:personal,
 rsvpUrl:`${personal}?rsvp=1&eventId=${session.id}`,presentationUrl:`${base}/supervision/sessions/${session.id}/presentation`,detailsUrl,
 isRequired:!!Number(recipient.is_required),isPresenter:recipient.isPresenter,isHost:hostIds.includes(Number(user.id)),kind});
 return {...content,to:recipientIdentity.email,senderIdentityId:mailboxes.notifications.id,replyToOverride:`"${hosts.map(p=>p.name).join(" & ").replace(/[\r\n"<>]/g, "")} via the app" <${replyMailbox.from_email}>`,
 attachments:[{filename:'supervision.ics',contentType:'text/calendar; charset=utf-8',contentBase64:Buffer.from(calendar.ics).toString('base64')}],
 userId:user.id,source:'auto',templateType:kind==='invitation'?'meeting_invited':'meeting_join_reminder'};
}
export async function sendSupervisionEmail({session,user,joinUrl,kind='invitation'}) {
 if(Number(session.notify_participants??1)===0||session.status!=='SCHEDULED'||parseUtcDate(session.end_at)<=new Date())return {skipped:true};
 const db=await pool.getConnection();const lock=`supervision-email:${session.id}:${user.id}:${kind}`;let acquired=false;
 try {
 const [locks]=await db.execute('SELECT GET_LOCK(?,0) acquired',[lock]);acquired=!!locks[0]?.acquired;if(!acquired)return {skipped:true};
 const key=[session.id,user.id,kind,session.start_at];
 const [prior]=await db.execute('SELECT * FROM supervision_email_deliveries WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?',key);
 if(prior.length)return {id:prior[0].delivery_status==='sent'?'already_sent':null,skipped:prior[0].delivery_status!=='sent'};
 const email=await prepareSupervisionEmail({session,user,joinUrl,kind});if(email.skipped)return email;
 await db.execute(`INSERT INTO supervision_email_deliveries (session_id,user_id,delivery_kind,start_at,delivery_status) VALUES (?,?,?,?,'sending')`,key);
 let result;
 try { result=await sendEmailFromIdentity(email); }
 catch(error){await db.execute("UPDATE supervision_email_deliveries SET delivery_status='review' WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?",key);throw error;}
 await db.execute(`UPDATE supervision_email_deliveries SET delivery_status=?,internet_message_id=?,gmail_thread_id=?,communication_id=? WHERE session_id=? AND user_id=? AND delivery_kind=? AND start_at=?`,[result?.id&&!result.redirected?'sent':result?.pendingApproval?'approval':'held',result.internetMessageId||null,result.threadId||null,result.communicationId||null,...key]);
 return result;
 }finally{if(acquired)await db.execute('SELECT RELEASE_LOCK(?)',[lock]);db.release();}
}
// One day ahead gives optional invitees and presenters time to respond/prepare.
export async function sendSupervisionDayAheadReminders(now=new Date()) {
 const [sessions]=await pool.execute(`SELECT * FROM supervision_sessions WHERE status='SCHEDULED' AND notify_participants=1 AND reminder_minutes IS NOT NULL AND start_at>? AND start_at<=DATE_ADD(?,INTERVAL 24 HOUR) AND start_at>DATE_ADD(?,INTERVAL 23 HOUR)`,[now,now,now]);
 for(const session of sessions){const people=await supervisionEmailPeople(session);for(const user of people)await sendSupervisionEmail({session,user,kind:'day_before'});}
}
