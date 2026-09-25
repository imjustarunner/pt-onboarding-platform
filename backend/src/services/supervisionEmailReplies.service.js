import { messageReminderRecipient } from './messageReminderRecipient.service.js';
import pool from '../config/database.js';
import { replyMessageIds } from '../utils/emailThreading.js';
import { freshSupervisionReply, supervisionReplyIntent } from '../utils/supervisionReplyIntent.js';
import { parseUtcDate } from '../utils/officeEventDateTime.util.js';
import { saveSupervisionRsvp } from './supervisionRsvp.service.js';
import { resolveMeetingRecipient } from './meetingRecipientIdentity.service.js';
import { ensurePersonalMailbox } from './personalMailbox.service.js';
import { persistInboundEmail } from './inboundEmailPersistence.service.js';
import { ensureTenantMessageMailboxes } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';
import { escapeMeetingHtml as esc } from './meetingInvitationPolicy.js';

export async function ingestSupervisionReply({identityId,fromEmail,inReplyTo,referencesHeader,threadId,messageId,subject,bodyText,receivedAt,authenticationResults='',gmail,gmailMessageId,gmailPayload}) {
 const [identities]=await pool.execute("SELECT agency_id FROM email_sender_identities WHERE id=? AND identity_key IN ('messages','messages_at_tenant','supervision_replies') AND is_active=1",[identityId]);
 if(!identities[0])return {ingested:false};
 let deliveries=[];
 for(const ancestor of replyMessageIds(inReplyTo,referencesHeader)){
  const [matches]=await pool.execute(`SELECT DISTINCT d.session_id,d.user_id,'supervision' meeting_type FROM supervision_email_deliveries d JOIN supervision_sessions s ON s.id=d.session_id WHERE s.agency_id=? AND d.internet_message_id=? UNION ALL SELECT DISTINCT d.session_id,d.user_id,'huddle' meeting_type FROM huddle_email_deliveries d JOIN provider_schedule_events s ON s.id=d.session_id WHERE s.agency_id=? AND d.internet_message_id=? AND s.kind='HUDDLE'`,[identities[0].agency_id,ancestor,identities[0].agency_id,ancestor]);
  if(matches.length){deliveries=matches;break;}
 }
 if(deliveries.length!==1)return {ingested:false};
 const delivery=deliveries[0];
 const huddle=delivery.meeting_type==='huddle';
 const meetingType=huddle?'huddle':'supervision';
 const [[session]]=await pool.execute(huddle?'SELECT *,provider_id supervisor_user_id FROM provider_schedule_events WHERE id=?': 'SELECT * FROM supervision_sessions WHERE id=?',[delivery.session_id]);
 if(!session)return {ingested:false};
 const [[user]]=await pool.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1`,[delivery.user_id,session.agency_id]);
 if(!user)return {ingested:false};
 const identity=await resolveMeetingRecipient({agencyId:session.agency_id,user});
 const allowed=[user.email,identity.email,await messageReminderRecipient(user)].filter(Boolean).map(v=>v.toLowerCase());
 if(!allowed.includes(String(fromEmail).toLowerCase()))return {ingested:false};
 const text=freshSupervisionReply(bodyText);if(!text)return {ingested:false};
 const fromDomain=String(fromEmail).split('@')[1]?.toLowerCase();
 const authenticated=String(authenticationResults).split(';').some(part=>/\bdmarc=pass\b/i.test(part)&&part.toLowerCase().match(/header\.from=([a-z0-9.-]+)/)?.[1]===fromDomain);
 const response=authenticated?supervisionReplyIntent(text):null;
 let newReply=false;
 const cohosts=huddle?(await pool.execute('SELECT user_id FROM meeting_participant_preferences WHERE event_id=? AND is_cohost=1',[session.id]))[0]:[];
 for(const hostId of new Set([session.supervisor_user_id,session.co_facilitator_user_id,...cohosts.map(p=>p.user_id)].map(Number).filter(Boolean))){
  const box=await ensurePersonalMailbox({agencyId:session.agency_id,userId:hostId});
  if(!box?.id)throw new Error('Supervision host inbox unavailable');
  const [prior]=await pool.execute('SELECT conversation_id FROM supervision_reply_forwards WHERE session_id=? AND participant_user_id=? AND host_user_id=? AND meeting_type=? ORDER BY message_id DESC LIMIT 1',[session.id,user.id,hostId,meetingType]);
  const attachments=gmailPayload?await (await import('./communicationAttachments.service.js')).prepareInboundAttachments({gmail,gmailMessageId,payload:gmailPayload,inboxId:box.id}):[];
  const stored=await persistInboundEmail({inboxId:box.id,agencyId:session.agency_id,ownerUserId:hostId,conversationId:prior[0]?.conversation_id||null,
   deliveryId:messageId,fromEmail,subject,bodyText:text,to:[{email:box.from_email}],attachments,inReplyTo,referencesHeader,receivedAt});
  newReply ||= !stored.duplicate;
  await pool.execute('UPDATE communication_conversations SET is_unknown_sender=0 WHERE id=?',[stored.conversationId]);
  await pool.execute(`INSERT IGNORE INTO supervision_reply_forwards(message_id,host_user_id,session_id,participant_user_id,conversation_id,received_at,interpreted_rsvp,meeting_type) VALUES(?,?,?,?,?,?,?,?)`,[stored.messageId,hostId,session.id,user.id,stored.conversationId,receivedAt,response,meetingType]);
 }
 if(newReply&&response&&session.status===(huddle?'ACTIVE':'SCHEDULED')&&parseUtcDate(session.start_at)>new Date()){
  try{if(huddle) await saveHuddleReplyRsvp({eventId:session.id,userId:user.id,response});else await saveSupervisionRsvp({sessionId:session.id,userId:user.id,response});}
  catch(error){if(![409,410].includes(error.status))throw error;}
 }
 return {ingested:true,response};
}

export async function forwardUnreadSupervisionReplies(now=new Date()) {
 const [rows]=await pool.execute(`SELECT f.*,s.agency_id,s.start_at,m.body_text,m.subject,m.from_json,u.email,u.work_email,u.personal_email,u.role,u.has_provider_access,u.sso_password_override,u.login_is_group_email,u.is_demo,u.first_name,u.last_name
 FROM supervision_reply_forwards f JOIN (SELECT id,agency_id,start_at,'supervision' meeting_type FROM supervision_sessions UNION ALL SELECT id,agency_id,start_at,'huddle' meeting_type FROM provider_schedule_events WHERE kind='HUDDLE') s ON s.id=f.session_id AND s.meeting_type=f.meeting_type
 JOIN communication_messages m ON m.id=f.message_id JOIN users u ON u.id=f.host_user_id AND u.is_active=1
 LEFT JOIN communication_conversation_reads r ON r.conversation_id=f.conversation_id AND r.user_id=f.host_user_id
 WHERE f.delivery_status='pending' AND (f.received_at<=DATE_SUB(?,INTERVAL 24 HOUR) OR s.start_at<=DATE_ADD(?,INTERVAL 24 HOUR))
 AND (r.last_read_at IS NULL OR r.last_read_at<f.received_at)
 AND EXISTS(SELECT 1 FROM user_agencies ua WHERE ua.user_id=f.host_user_id AND ua.agency_id=s.agency_id AND ua.is_active=1)
 AND NOT EXISTS(SELECT 1 FROM communication_messages answer WHERE answer.conversation_id=f.conversation_id AND answer.direction='outbound' AND answer.send_status='sent' AND answer.author_user_id=f.host_user_id AND answer.sent_at>=f.received_at)
 ORDER BY f.received_at LIMIT 100`,[now,now]);
 for(const row of rows){
  const [claim]=await pool.execute("UPDATE supervision_reply_forwards SET delivery_status='sending' WHERE message_id=? AND host_user_id=? AND delivery_status='pending'",[row.message_id,row.host_user_id]);if(!claim.affectedRows)continue;
  try{
   const personalRecipient=await messageReminderRecipient(row);
   if(personalRecipient && personalRecipient.toLowerCase()===String(row.personal_email||'').toLowerCase()) {
     await pool.execute("UPDATE supervision_reply_forwards SET delivery_status='inbox_reminder' WHERE message_id=? AND host_user_id=?",[row.message_id,row.host_user_id]);
     continue;
   }
   const mailbox=await ensureTenantMessageMailboxes(row.agency_id);
   const recipient=await resolveMeetingRecipient({agencyId:row.agency_id,user:{...row,id:row.host_user_id}});
   const sender=typeof row.from_json==='string'?JSON.parse(row.from_json):row.from_json;
   const label=row.meeting_type==='huddle'?'Meeting reply':'Supervision reply';
   const text=`An unread ${label.toLowerCase()} is waiting in your app inbox.\n\nFrom: ${sender.email}\n\n${row.body_text}`;
   const result=await sendEmailFromIdentity({senderIdentityId:mailbox.notifications.id,to:recipient.email,replyToOverride:sender.email,subject:`${label}: ${row.subject||'Session attendance'}`,text,html:`<h2>${label}</h2><p>From: ${esc(sender.email)}</p><p>${esc(row.body_text).replace(/\n/g,'<br>')}</p><p>This reply is also saved in your app inbox. Reply here to answer the participant.</p>`,source:'auto',userId:row.host_user_id,templateType:'meeting_reply_forward'});
   await pool.execute('UPDATE supervision_reply_forwards SET delivery_status=?,communication_id=? WHERE message_id=? AND host_user_id=?',[result.id&&!result.redirected?'sent':result.pendingApproval?'approval':'held',result.communicationId||null,row.message_id,row.host_user_id]);
  }catch(error){await pool.execute("UPDATE supervision_reply_forwards SET delivery_status='review' WHERE message_id=? AND host_user_id=?",[row.message_id,row.host_user_id]);console.warn('[supervision reply] Forward needs review',row.message_id,error.code||'send_failed');}
 }
}

export async function saveHuddleReplyRsvp({eventId,userId,response}) {
 if(!['accepted','declined','tentative'].includes(response))throw Object.assign(new Error('Invalid RSVP'),{status:409});
 const [result]=await pool.execute(`INSERT INTO meeting_participant_preferences(event_id,user_id,rsvp,rsvp_at)
 SELECT p.id,a.user_id,?,UTC_TIMESTAMP() FROM provider_schedule_events p JOIN provider_schedule_event_attendees a ON a.event_id=p.id AND a.user_id=?
 WHERE p.id=? AND p.kind='HUDDLE' AND p.status='ACTIVE' AND p.start_at>UTC_TIMESTAMP()
 ON DUPLICATE KEY UPDATE rsvp=VALUES(rsvp),rsvp_at=VALUES(rsvp_at)`,[response,userId,eventId]);
 if(!result.affectedRows)throw Object.assign(new Error('This huddle invitation is no longer active'),{status:410});
}
