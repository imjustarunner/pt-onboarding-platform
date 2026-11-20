import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';
import { assertDepartmentalGroupAccess, groupKeyForIdentity } from './departmentalGroupAccess.service.js';
import { supportEmailError } from './supportTicketEmailPolicy.js';
import { resolveSupportTicketEmailThread } from './supportTicketEmail.service.js';

const UNDO_SECONDS = 20;

export async function changeSharedInboxTicketArchive({ conversationId, user, undoId }, database = pool) {
  const userId = Number(user?.id);
  if (!userId || !['admin', 'super_admin', 'support'].includes(user?.role)) {
    throw supportEmailError('Ticket close access is required.', 403);
  }
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [[row]] = await db.execute(`SELECT t.*, c.id AS conversation_id,
      c.status AS conversation_status, c.archived_at, i.identity_key, i.kind, i.from_email, i.owner_user_id
      FROM support_tickets t JOIN communication_conversations c ON c.support_ticket_id=t.id AND c.agency_id=t.agency_id
      JOIN communication_inboxes i ON i.id=c.inbox_id AND i.agency_id=c.agency_id
      WHERE c.id=? AND c.channel='email' FOR UPDATE`, [conversationId]);
    const groupKey = groupKeyForIdentity(row);
    if (!row || !groupKey) throw supportEmailError('A linked group email ticket is required.', 404);
    await assertDepartmentalGroupAccess({ agencyId: row.agency_id, userId, groupKey, db });
    if (row.claimed_by_user_id && Number(row.claimed_by_user_id) !== userId && user.role === 'support') {
      throw supportEmailError('This ticket is assigned to another team member.', 409);
    }
    const canonical = await resolveSupportTicketEmailThread(row, db);
    if (Number(canonical.canonicalTicketId) !== Number(row.id)) {
      throw supportEmailError(`Open ticket #${canonical.canonicalTicketId} to manage this conversation.`, 409);
    }
    const [[latest]] = await db.execute('SELECT COALESCE(MAX(id), 0) AS id FROM support_ticket_messages WHERE ticket_id=?', [row.id]);
    let receipt;
    if (undoId) {
      const [[archive]] = await db.execute(`SELECT a.* FROM shared_inbox_ticket_archives a
        JOIN communication_conversations c ON c.id=a.conversation_id AND c.archived_at=CAST(a.archived_at AS DATETIME)
        WHERE a.id=? AND a.conversation_id=? AND a.ticket_id=? AND a.actor_user_id=?
          AND a.undone_at IS NULL AND a.expires_at>UTC_TIMESTAMP(6) FOR UPDATE`, [undoId, conversationId, row.id, userId]);
      if (!archive || row.status !== 'closed' || Number(latest.id) !== Number(archive.last_ticket_message_id)) {
        throw supportEmailError('The undo window expired or the ticket changed.', 409);
      }
      await db.execute('UPDATE support_tickets SET status=?, close_on_read=? WHERE id=?',
        [archive.previous_ticket_status, archive.previous_close_on_read, row.id]);
      await db.execute('UPDATE communication_conversations SET status=?, archived_at=NULL WHERE id=?',
        [archive.previous_conversation_status, conversationId]);
      await db.execute('UPDATE shared_inbox_ticket_archives SET undone_at=UTC_TIMESTAMP(6) WHERE id=?', [undoId]);
      receipt = { ticketId: row.id, conversationId, undone: true };
    } else {
      if (row.archived_at) throw supportEmailError('This conversation is already archived.', 409);
      const id = randomUUID();
      await db.execute(`INSERT INTO shared_inbox_ticket_archives (id, conversation_id, ticket_id, actor_user_id,
        previous_ticket_status, previous_conversation_status, previous_close_on_read, last_ticket_message_id, archived_at, expires_at)
        VALUES (?,?,?,?,?,?,?,?,UTC_TIMESTAMP(),DATE_ADD(UTC_TIMESTAMP(6), INTERVAL ${UNDO_SECONDS} SECOND))`,
      [id, conversationId, row.id, userId, row.status, row.conversation_status, row.close_on_read || 0, latest.id]);
      if (row.status !== 'closed' || row.close_on_read) {
        await db.execute("UPDATE support_tickets SET status='closed', close_on_read=0 WHERE id=?", [row.id]);
      }
      await db.execute(`UPDATE communication_conversations c JOIN shared_inbox_ticket_archives a ON a.id=?
        SET c.status='resolved', c.archived_at=a.archived_at WHERE c.id=?`, [id, conversationId]);
      receipt = { ticketId: row.id, conversationId, undoId: id, undoSeconds: UNDO_SECONDS };
    }
    await db.commit();
    return receipt;
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
