import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { listUserDepartmentalGroupKeys } from './departmentalGroupAccess.service.js';
import { requireConversationAccess } from './communicationAccess.service.js';
import { schoolGroupConversationSql } from './groupEmailConversationPolicy.js';

/** Notify authorized school observers independently of ticket ownership. Reply subscriptions use an explicit in-app opt-in for the School group email notification type. No email is sent. */
export async function notifySchoolTicketReply({ agencyId, ticketId, ticketMessageId }, dependencies = {}) {
  const db = dependencies.database || pool;
  if (![agencyId, ticketId, ticketMessageId].every(v => Number.isSafeInteger(Number(v)) && Number(v) > 0)) return { notificationCount: 0 };
  const [conversations] = await db.execute(`SELECT c.id,m.author_user_id
    FROM support_tickets t
    JOIN support_ticket_messages m ON m.ticket_id=t.id AND m.id=?
    JOIN support_ticket_email_messages delivery ON delivery.ticket_message_id=m.id AND delivery.ticket_id=t.id
    JOIN communication_conversations c ON c.support_ticket_id=t.id AND c.agency_id=t.agency_id
    JOIN communication_inboxes i ON i.id=c.inbox_id
    WHERE t.id=? AND t.agency_id=? AND COALESCE(m.is_internal,0)=0 AND COALESCE(m.is_deleted,0)=0
      AND (delivery.direction='inbound' OR delivery.send_status='sent') AND ${schoolGroupConversationSql}
    ORDER BY c.id`, [ticketMessageId,ticketId,agencyId]);
  if (!conversations.length) return { notificationCount: 0 };
  const [members] = await db.execute(`SELECT DISTINCT u.id,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id
    JOIN user_notification_type_preferences preference ON preference.user_id=u.id
      AND preference.notification_type='school_group_email_received' AND preference.in_app_enabled=1
    WHERE ua.agency_id=? AND ua.is_active=1 AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND COALESCE(u.is_demo,0)=0
      AND u.role IN ('admin','super_admin','support')`, [agencyId]);
  const hash = createHash('sha256').update(`ticket-reply:${ticketId}:${ticketMessageId}`).digest('hex');
  let notificationCount = 0;
  for (const member of members) {
    if (Number(member.id) === Number(conversations[0].author_user_id)) continue;
    const keys = await (dependencies.groupKeys || listUserDepartmentalGroupKeys)({ agencyId, userId:member.id, db });
    if (!keys.includes('schools')) continue;
    let conversation;
    for (const candidate of conversations) {
      try { await (dependencies.requireAccess || requireConversationAccess)(member,candidate.id); conversation=candidate; break; }
      catch (error) { if (![403,404].includes(error.status)) throw error; }
    }
    if (!conversation) continue;
    const conn = await db.getConnection();
    let notification;
    try {
      await conn.beginTransaction();
      const [receipt] = await conn.execute(`INSERT IGNORE INTO school_group_email_notification_receipts
        (agency_id,delivery_hash,user_id) VALUES (?,?,?)`, [agencyId,hash,member.id]);
      if (!receipt.affectedRows) { await conn.rollback(); continue; }
      const title = 'New School groups reply';
      const message = 'A new reply is available in School groups. Open the conversation to see the exchange and its assigned owner.';
      const [result] = await conn.execute(`INSERT INTO notifications
        (type,severity,title,message,user_id,agency_id,related_entity_type,related_entity_id,actor_source,created_at)
        VALUES ('school_group_email_received','info',?,?,?,?,'communication_conversation',?,'Schools',NOW())`,
        [title,message,member.id,agencyId,conversation.id]);
      await conn.execute('UPDATE school_group_email_notification_receipts SET notification_id=? WHERE agency_id=? AND delivery_hash=? AND user_id=?', [result.insertId,agencyId,hash,member.id]);
      await conn.commit();
      notification = { id:result.insertId,type:'school_group_email_received',title,message,user_id:member.id,agency_id:agencyId,
        related_entity_type:'communication_conversation',related_entity_id:conversation.id };
      notificationCount++;
    } catch (error) { await conn.rollback(); throw error; }
    finally { conn.release(); }
    const dispatch = dependencies.dispatchPush || (await import('./notificationDispatcher.service.js')).default.dispatchPushForNotification;
    await dispatch(notification).catch(error => console.warn('[school reply] push pending:',error?.code || 'push_failed'));
  }
  return { notificationCount };
}
