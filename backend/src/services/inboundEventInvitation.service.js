import pool from '../config/database.js';
import User from '../models/User.model.js';
import { messageReminderRecipient } from './messageReminderRecipient.service.js';
import { ensureTenantNotificationsMailbox } from './tenantMessageMailboxes.service.js';
import { sendEmailFromIdentity } from './unifiedEmail/unifiedEmailSender.service.js';

export function calendarParts(payload) {
 const out=[];const visit=p=>{if(String(p?.mimeType||'').toLowerCase()==='text/calendar')out.push(p);for(const c of p?.parts||[])visit(c);};visit(payload);return out;
}
// Calendar mail is high priority for app-only staff. Do not resend Google's
// invitation when the sender already included the person's personal address.
export async function forwardInboundEventInvitation({inbox,userId,messageId,gmail,gmailMessageId,payload,subject,bodyText,fromEmail,to=[],cc=[]}) {
 const parts=calendarParts(payload);if(!parts.length||!userId)return {skipped:true};
 const user=await User.findById(userId);if(!user)return {skipped:true};
 const personal=await messageReminderRecipient(user);if(!personal)return {skipped:true};
 if([...to,...cc].some(address=>String(address).trim().toLowerCase()===personal))return {skipped:true,reason:'already_addressed_personally'};
 const attachments=[];
 for(const part of parts){const encoded=part.body?.data||(await gmail.users.messages.attachments.get({userId:'me',messageId:gmailMessageId,id:part.body?.attachmentId})).data?.data;if(!encoded)throw new Error('Calendar attachment missing');const content=Buffer.from(encoded,'base64url');if(content.length>1024*1024)throw new Error('Calendar invitation too large');if(!/BEGIN:VCALENDAR/.test(content.toString('utf8')))continue;attachments.push({filename:'invitation.ics',contentType:'text/calendar; charset=utf-8',contentBase64:content.toString('base64')});}
 if(!attachments.length)return {skipped:true};
 const [claim]=await pool.execute('INSERT IGNORE INTO inbound_event_email_deliveries(inbox_id,message_id) VALUES(?,?)',[inbox.id,messageId]);if(!claim.affectedRows)return {skipped:true,reason:'already_claimed'};
 try{const {notifications}=await ensureTenantNotificationsMailbox(inbox.agency_id);const result=await sendEmailFromIdentity({senderIdentityId:notifications.id,to:personal,userId,subject,text:bodyText,attachments,replyToOverride:fromEmail,templateType:'forwarded_event_invitation',source:'auto'});await pool.execute('UPDATE inbound_event_email_deliveries SET delivery_status=?,communication_id=? WHERE inbox_id=? AND message_id=?',[result.id&&!result.redirected?'sent':result.pendingApproval?'approval':'held',result.communicationId||null,inbox.id,messageId]);return result;}
 catch(error){await pool.execute("UPDATE inbound_event_email_deliveries SET delivery_status='review' WHERE inbox_id=? AND message_id=?",[inbox.id,messageId]);throw error;}
}
