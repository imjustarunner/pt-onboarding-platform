import crypto from 'node:crypto';
import pool from '../config/database.js';
import { logCommunication } from './appointmentReminder.service.js';
import { authenticatedFamilySender } from './familyEmailPolicy.js';
import { stripQuotedEmailTail } from '../utils/gmailMessageParse.shared.js';
import { applyAppointmentReply } from './appointmentReply.service.js';
import { loadClientConsent } from './sessionNotification.service.js';
const hash = value => crypto.createHash('sha256').update(String(value || '').trim().toLowerCase()).digest('hex');
const references = input => [...new Set((String(input || '').match(/<[^<>\s]+>/g) || []).reverse())];

export async function recordSessionReminderEmail({appointment,reminderId,clientId,guardianUserId,affiliationId,to,result},db=pool) {
  await db.execute(`INSERT INTO session_notification_email_deliveries
    (appointment_id,agency_id,reminder_id,client_id,guardian_user_id,affiliation_id,recipient_hash,internet_message_id,communication_id)
    VALUES (?,?,?,?,?,?,?,?,?) ON DUPLICATE KEY UPDATE internet_message_id=VALUES(internet_message_id),communication_id=VALUES(communication_id)`,
  [appointment.id,appointment.agencyId,reminderId,clientId,guardianUserId||null,affiliationId||null,hash(to),result.internetMessageId,result.communicationId||null]);
}

export function createSessionNotificationEmailReplies({db=pool,apply=applyAppointmentReply,consent=loadClientConsent,log=logCommunication}={}) {
  return async ({fromEmail,inReplyTo,referencesHeader,messageId,bodyText,subject,gmailPayload}) => {
    if (!messageId) return { matched:false };
    const ids=[...new Set([...references(inReplyTo),...references(referencesHeader)])];
    if (!ids.length) return {matched:false};
    const [rows]=await db.execute(`SELECT * FROM session_notification_email_deliveries
      WHERE internet_message_id IN (${ids.map(()=>'?').join(',')}) AND recipient_hash=? ORDER BY id DESC LIMIT 2`,[...ids,hash(fromEmail)]);
    if (!rows?.length || new Set(rows.map(row=>Number(row.appointment_id))).size!==1) return {matched:false};
    const delivery=rows[0], body=stripQuotedEmailTail(String(bodyText||'')).trim().slice(0,10000);
    const authenticated=authenticatedFamilySender(gmailPayload?.headers||[],fromEmail);
    const current=await consent(delivery.client_id,delivery.agency_id,delivery.guardian_user_id||null);
    const currentSender=String(current.emailAddress||'').trim().toLowerCase()===String(fromEmail).trim().toLowerCase();
    const shortcut=/^(y|yes|c|confirm|confirmed|1|n|no|x|cancel|cancelled|canceled|2|r|reschedule|resched|move|3)$/i.test(body);
    const canApply=authenticated&&currentSender&&shortcut&&!delivery.affiliation_id;
    const messageHash=crypto.createHash('sha256').update(String(messageId).trim()).digest('hex'),conn=await db.getConnection();
    try {
      await conn.beginTransaction();
      const [claim]=await conn.execute(`INSERT IGNORE INTO session_notification_email_replies
        (message_hash,appointment_id,reminder_id,action_status) VALUES (?,?,?,'review')`,[messageHash,delivery.appointment_id,delivery.reminder_id]);
      if(!claim.affectedRows){await conn.commit();return {matched:true,duplicate:true};}
      const communication=await log({appointmentId:delivery.appointment_id,agencyId:delivery.agency_id,direction:'inbound',channel:'email',
        kind:'notification_reply',bodyPreview:body.slice(0,500),reminderId:delivery.reminder_id,db:conn,
        metadata:{deliveryStatus:'received',subject:String(subject||'').slice(0,300),recipient:fromEmail,body,
          guardianUserId:delivery.guardian_user_id||null,authenticated,actionStatus:'review',needsSupport:true}});
      await conn.execute('UPDATE session_notification_email_replies SET communication_id=? WHERE message_hash=?',[communication.id,messageHash]);
      await conn.commit();
    } catch(error){await conn.rollback();throw error;}finally{conn.release();}
    let outcome='review';
    if(canApply) {
      try {const result=await apply({appointmentId:delivery.appointment_id,agencyId:delivery.agency_id,clientId:delivery.client_id,
        guardianUserId:delivery.guardian_user_id,channel:'email',rawBody:body,autoApply:true});outcome=result.status==='applied'?'applied':'review';}
      catch(error){if(![400,403,404,409,410].includes(error.status))throw error;}
    }
    await db.execute('UPDATE session_notification_email_replies SET action_status=? WHERE message_hash=?',[outcome,messageHash]);
    return {matched:true,actionStatus:outcome};
  };
}
export const ingestSessionNotificationEmailReply=createSessionNotificationEmailReplies();
