import {createHash} from 'node:crypto';
import pool from '../config/database.js';
import CommunicationInbox from '../models/CommunicationInbox.model.js';
import {persistInboundEmail} from './inboundEmailPersistence.service.js';
import {listUserDepartmentalGroupKeys} from './departmentalGroupAccess.service.js';

export const SCHOOL_GROUP_EMAIL_TYPE = 'school_group_email_received';
export const packetNotificationSubject = subject => !/^\s*(?:re|fw|fwd):/i.test(subject || '') && / - (?:Paper Enrollment Packet Uploaded|Digital Enrollment Packet)$/i.test(subject || '');
const emails = values => [...new Set((values || []).map(v => String(v?.email || v || '').trim().toLowerCase()).filter(Boolean))];

/** Receipt mail remains email. It never enters support-ticket intake or drafting. */
export async function recordSchoolGroupEmail(input, dependencies = {}) {
  const db = dependencies.database || pool;
  if ((!packetNotificationSubject(input.subject) && !input.automated) || !input.messageId || !Number(input.agencyId)) return {handled:false};
  const recipients = emails([...(input.to || []), ...(input.cc || []), ...(input.deliveredTo || [])]);
  if (!recipients.length) return {handled:false};
  const [schools] = await db.execute(`SELECT DISTINCT sp.school_organization_id,sp.itsco_email,a.name
    FROM school_profiles sp JOIN agencies a ON a.id=sp.school_organization_id
    JOIN organization_affiliations oa ON oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1
    WHERE a.is_active=1 AND COALESCE(a.is_archived,0)=0 AND a.organization_type='school'
      AND LOWER(TRIM(sp.itsco_email)) IN (${recipients.map(()=>'?').join(',')})`, [input.agencyId,...recipients]);
  if (!schools.length) return {handled:false};
  const [senders] = await db.execute(`SELECT id,from_email FROM email_sender_identities WHERE agency_id=? AND is_active=1
    AND identity_key IN ('schools','schoolreply','school_reply','notifications','support') AND LOWER(TRIM(from_email))=?`, [input.agencyId,String(input.fromEmail || '').trim().toLowerCase()]);
  if (!senders.length && !input.automated) return {handled:false};
  let [[inbox]] = await db.execute(`SELECT * FROM communication_inboxes WHERE agency_id=? AND kind='shared'
    AND owner_user_id IS NULL AND is_active=1 AND identity_key='schools' LIMIT 1`, [input.agencyId]);
  if (!inbox) {
    await (dependencies.ensureInboxes || CommunicationInbox.ensureFromSenderIdentities)(input.agencyId);
    [[inbox]] = await db.execute("SELECT * FROM communication_inboxes WHERE agency_id=? AND kind='shared' AND owner_user_id IS NULL AND is_active=1 AND identity_key='schools' LIMIT 1", [input.agencyId]);
  }
  if (!inbox) throw new Error('Schools group inbox is unavailable');
  const receivedAt = new Date(input.receivedAt || Date.now());
  if (!Number.isFinite(receivedAt.getTime())) throw new Error('Packet email receipt time is unavailable');
  const persist = dependencies.persistEmail || persistInboundEmail;
  const saved = await persist({agencyId:Number(input.agencyId),inboxId:inbox.id,deliveryId:input.messageId,
    threadId:input.threadId || null,fromEmail:input.fromEmail,subject:input.subject,bodyText:input.bodyText || '',bodyHtml:input.bodyHtml || null,
    to:emails(input.to).map(email=>({email})),cc:emails(input.cc).map(email=>({email})),receivedAt,
    isGroupEmail:true,isAutoReply:true,autoReplyKind:'school_group_notification',standalone:true,suppressPush:!!input.historical});
  if (!saved.messageId || !saved.conversationId) throw new Error('School notification email did not persist');
  await db.execute("UPDATE communication_conversations SET is_unknown_sender=0,status='waiting' WHERE id=? AND agency_id=? AND support_ticket_id IS NULL", [saved.conversationId,input.agencyId]);
  const [members] = await db.execute(`SELECT DISTINCT u.id,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND u.role IN ('admin','super_admin','support')`, [input.agencyId]);
  const hash = createHash('sha256').update(String(input.messageId)).digest('hex');
  let notificationCount=0;
  for (const member of members) {
    const keys = await (dependencies.groupKeys || listUserDepartmentalGroupKeys)({agencyId:input.agencyId,userId:member.id,db});
    if (!keys.includes('schools')) continue;
    const conn = await db.getConnection(); let created;
    try {
      await conn.beginTransaction();
      const [claim] = await conn.execute(`INSERT IGNORE INTO school_group_email_notification_receipts (agency_id,delivery_hash,user_id)
        VALUES (?,?,?)`, [input.agencyId,hash,member.id]);
      if (!claim.affectedRows) { await conn.rollback(); continue; }
      const title = schools.length===1 ? `${schools[0].name}: ${packetNotificationSubject(input.subject)?'packet received':'new school email'}`.slice(0,200) : 'School group email received';
      const message = 'The school group notification email is available in Conversa → Groups → Schools.';
      const [notification] = await conn.execute(`INSERT INTO notifications
        (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source,created_at)
        VALUES (?,'info',?,?,?,?, 'communication_conversation',?,'Schools',?)`,
      [SCHOOL_GROUP_EMAIL_TYPE,title,message,member.id,input.agencyId,saved.conversationId,receivedAt]);
      await conn.execute('UPDATE school_group_email_notification_receipts SET notification_id=? WHERE agency_id=? AND delivery_hash=? AND user_id=?', [notification.insertId,input.agencyId,hash,member.id]);
      await conn.commit();
      created={id:notification.insertId,type:SCHOOL_GROUP_EMAIL_TYPE,title,message,user_id:member.id,agency_id:input.agencyId,related_entity_type:'communication_conversation',related_entity_id:saved.conversationId};
      notificationCount++;
    } catch (error) { await conn.rollback(); throw error; } finally { conn.release(); }
    if (!input.historical) {
      const dispatch = dependencies.dispatchPush || (await import('./notificationDispatcher.service.js')).default.dispatchPushForNotification;
      await dispatch(created).catch(error=>console.warn('[school packet email] push pending',error?.code || 'push_failed'));
    }
  }
  return {handled:true,...saved,notificationCount};
}

export async function recordSentSchoolPacketEmail({agencyId,schoolOrganizationId,to,cc,subject,result,senderIdentityId},dependencies={}) {
  if (!result?.id || result.queued || result.blocked || result.skipped || result.redirected || !result.internetMessageId) return {handled:false};
  const db=dependencies.database || pool;
  const [[sender]]=await db.execute('SELECT from_email FROM email_sender_identities WHERE id=? AND agency_id=? AND is_active=1',[senderIdentityId,agencyId]);
  if(!sender)return {handled:false};
  return recordSchoolGroupEmail({agencyId,schoolOrganizationId,to:[to],cc:(Array.isArray(cc)?cc:String(cc || '').split(',')),subject,
    messageId:result.internetMessageId,threadId:result.threadId,fromEmail:sender.from_email,bodyText:result.bodyText,bodyHtml:result.bodyHtml,
    receivedAt:new Date()},dependencies);
}
