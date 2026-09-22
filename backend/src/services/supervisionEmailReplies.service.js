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
  const [matches]=await pool.execute(`SELECT DISTINCT d.session_id,d.user_id FROM supervision_email_deliveries d JOIN supervision_sessions s ON s.id=d.session_id WHERE s.agency_id=? AND d.internet_message_id=?`,[identities[0].agency_id,ancestor]);
  if(matches.length){deliveries=matches;break;}
 }
 if(deliveries.length!==1)return {ingested:false};
 const delivery=deliveries[0];
 const [[session]]=await pool.execute('SELECT * FROM supervision_sessions WHERE id=?',[delivery.session_id]);
 const [[user]]=await pool.execute(`SELECT u.* FROM users u JOIN user_agencies ua ON ua.user_id=u.id WHERE u.id=? AND ua.agency_id=? AND ua.is_active=1 AND u.is_active=1`,[delivery.user_id,session.agency_id]);
 if(!user)return {ingested:false};
 const identity=await resolveMeetingRecipient({agencyId:session.agency_id,user});
 const allowed=[user.email,identity.email].filter(Boolean).map(v=>v.toLowerCase());
 if(!allowed.includes(String(fromEmail).toLowerCase()))return {ingested:false};
 const text=freshSupervisionReply(bodyText);if(!text)return {ingested:false};
 const fromDomain=String(fromEmail).split('@')[1]?.toLowerCase();
 const authenticated=String(authenticationResults).split(';').some(part=>/\bdmarc=pass\b/i.test(part)&&part.toLowerCase().match(/header\.from=([a-z0-9.-]+)/)?.[1]===fromDomain);
 const response=authenticated?supervisionReplyIntent(text):null;
 let newReply=false;
 for(const hostId of new Set([session.supervisor_user_id,session.co_facilitator_user_id].map(Number).filter(Boolean))){
  const box=await ensurePersonalMailbox({agencyId:session.agency_id,userId:hostId});
  if(!box?.id)throw new Error('Supervision host inbox unavailable');
  const [prior]=await pool.execute('SELECT conversation_id FROM supervision_reply_forwards WHERE session_id=? AND participant_user_id=? AND host_user_id=? ORDER BY message_id DESC LIMIT 1',[session.id,user.id,hostId]);
  const attachments=gmailPayload?await (await import('./communicationAttachments.service.js')).prepareInboundAttachments({gmail,gmailMessageId,payload:gmailPayload,inboxId:box.id}):[];
  const stored=await persistInboundEmail({inboxId:box.id,agencyId:session.agency_id,ownerUserId:hostId,conversationId:prior[0]?.conversation_id||null,
   deliveryId:messageId,fromEmail,subject,bodyText:text,to:[{email:box.from_email}],attachments,inReplyTo,referencesHeader,receivedAt});
  newReply ||= !stored.duplicate;
  await pool.execute('UPDATE communication_conversations SET is_unknown_sender=0 WHERE id=?',[stored.conversationId]);
  await pool.execute(`INSERT IGNORE INTO supervision_reply_forwards(message_id,host_user_id,session_id,participant_user_id,conversation_id,received_at,interpreted_rsvp) VALUES(?,?,?,?,?,?,?)`,[stored.messageId,hostId,session.id,user.id,stored.conversationId,receivedAt,response]);
 }
 if(newReply&&response&&session.status==='SCHEDULED'&&parseUtcDate(session.start_at)>new Date()){
  try{await saveSupervisionRsvp({sessionId:session.id,userId:user.id,response});}
  catch(error){if(![409,410].includes(error.status))throw error;}
 }
 return {ingested:true,response};
}

export async function forwardUnreadSupervisionReplies(now=new Date()) {
 const [rows]=await pool.execute(`SELECT f.*,s.agency_id,s.start_at,m.body_text,m.subject,m.from_json,u.email,u.work_email,u.first_name,u.last_name
 FROM supervision_reply_forwards f JOIN supervision_sessions s ON s.id=f.session_id
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
   const mailbox=await ensureTenantMessageMailboxes(row.agency_id);
   const recipient=await resolveMeetingRecipient({agencyId:row.agency_id,user:{...row,id:row.host_user_id}});
   const sender=typeof row.from_json==='string'?JSON.parse(row.from_json):row.from_json;
   const text=`An unread supervision reply is waiting in your app inbox.\n\nFrom: ${sender.email}\n\n${row.body_text}`;
   const result=await sendEmailFromIdentity({senderIdentityId:mailbox.notifications.id,to:recipient.email,replyToOverride:sender.email,subject:`Supervision reply: ${row.subject||'Session attendance'}`,text,html:`<h2>Supervision reply</h2><p>From: ${esc(sender.email)}</p><p>${esc(row.body_text).replace(/\n/g,'<br>')}</p><p>This reply is also saved in your app inbox. Reply here to answer the participant.</p>`,source:'auto',userId:row.host_user_id,templateType:'meeting_join_reminder'});
   await pool.execute('UPDATE supervision_reply_forwards SET delivery_status=?,communication_id=? WHERE message_id=? AND host_user_id=?',[result.id&&!result.redirected?'sent':result.pendingApproval?'approval':'held',result.communicationId||null,row.message_id,row.host_user_id]);
  }catch(error){await pool.execute("UPDATE supervision_reply_forwards SET delivery_status='review' WHERE message_id=? AND host_user_id=?",[row.message_id,row.host_user_id]);console.warn('[supervision reply] Forward needs review',row.message_id,error.code||'send_failed');}
 }
}
