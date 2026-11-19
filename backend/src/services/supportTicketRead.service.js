import pool from '../config/database.js';

export function ticketLatestIncomingSql(userId) {
  const uid = Number(userId);
  if (!Number.isSafeInteger(uid) || uid <= 0) throw new Error('A user is required');
  return `GREATEST(t.created_at, COALESCE((SELECT MAX(rm.created_at) FROM support_ticket_messages rm
    WHERE rm.ticket_id=t.id AND COALESCE(rm.is_deleted,0)=0
      AND (rm.author_user_id IS NULL OR rm.author_user_id<>${uid})),t.created_at))`;
}

export function ticketUnreadSql(userId) {
  const latest = ticketLatestIncomingSql(userId);
  return `NOT EXISTS (SELECT 1 FROM support_ticket_reads tr WHERE tr.ticket_id=t.id AND tr.user_id=${Number(userId)}
    AND tr.forced_unread=0 AND tr.last_read_at>=${latest})`;
}

export async function markSupportTicketRead({ ticketId, userId, unread = false, readBefore = new Date() }) {
  await pool.execute(`INSERT INTO support_ticket_reads (ticket_id,user_id,last_read_at,forced_unread)
    SELECT t.id,?,LEAST(${ticketLatestIncomingSql(userId)},?),? FROM support_tickets t WHERE t.id=?
    ON DUPLICATE KEY UPDATE last_read_at=GREATEST(COALESCE(last_read_at,'1000-01-01'),VALUES(last_read_at)),forced_unread=VALUES(forced_unread)`,
    [userId, readBefore, unread ? 1 : 0, ticketId]);
  // The same email can be opened from Tickets or Groups; retain one read position.
  await pool.execute(`INSERT INTO communication_conversation_reads (conversation_id,user_id,last_read_at,forced_unread)
    SELECT c.id,?,LEAST(COALESCE(c.last_message_at,c.created_at),?),? FROM communication_conversations c WHERE c.support_ticket_id=?
    ON DUPLICATE KEY UPDATE last_read_at=GREATEST(COALESCE(last_read_at,'1000-01-01'),VALUES(last_read_at)),forced_unread=VALUES(forced_unread)`,
    [userId, readBefore, unread ? 1 : 0, ticketId]);
}
