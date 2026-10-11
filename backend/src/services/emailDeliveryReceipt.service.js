import pool from '../config/database.js';
import { requireConversationAccess } from './communicationAccess.service.js';

// Poll only delivery metadata, never the entire thread, attachments or read state.
export async function getEmailDeliveryReceipt(actor, conversationId, messageId) {
  await requireConversationAccess(actor, conversationId);
  const [rows] = await pool.execute(`SELECT id,send_status,scheduled_send_at,undo_expires_at,sent_at
    FROM communication_messages WHERE id=? AND conversation_id=? AND author_user_id=?
    AND direction='outbound' AND channel='email' LIMIT 1`, [messageId, conversationId, actor.id]);
  if (!rows[0]) throw Object.assign(new Error('Email delivery status not found'), { status: 404 });
  return rows[0];
}
