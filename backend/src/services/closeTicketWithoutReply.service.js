import pool from '../config/database.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';
import { supportEmailError } from './supportTicketEmailPolicy.js';

/** Called only after the ticket controller's agency/topic/department checks. */
export async function closeTicketWithoutReply({ ticket, user, expectedLastMessageId }, database = pool) {
  const body = 'Ticket closed: no reply needed. No email was sent.';
  const encrypted = prepareEncryptedTicketText(body);
  if (ticket.source_channel === 'email' && !encrypted.encrypted) throw supportEmailError('Secure ticket history is unavailable. The ticket was not closed.', 503);
  const db = await database.getConnection();
  try {
    await db.beginTransaction();
    const [[current]] = await db.execute('SELECT id,status FROM support_tickets WHERE id=? AND agency_id=? FOR UPDATE', [ticket.id, ticket.agency_id]);
    if (!current) throw supportEmailError('Ticket not found.', 404);
    if (!['closed','resolved','done'].includes(current.status)) {
      if (expectedLastMessageId != null) {
        const [[last]] = await db.execute('SELECT MAX(id) AS id FROM support_ticket_messages WHERE ticket_id=? AND COALESCE(is_deleted,0)=0', [ticket.id]);
        if (String(last?.id || 0) !== String(expectedLastMessageId)) throw supportEmailError('A new message arrived. Review it before closing this ticket.', 409, 'SUPPORT_EMAIL_STALE_THREAD');
      }
      await db.execute("UPDATE support_tickets SET status='closed',updated_at=CURRENT_TIMESTAMP WHERE id=? AND agency_id=?", [ticket.id, ticket.agency_id]);
      await db.execute(`INSERT INTO support_ticket_messages
        (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal)
        VALUES (?,?,?,?,?,?,?,?,1)`, [ticket.id, user.id, user.role, encrypted.plain, encrypted.ciphertext, encrypted.iv, encrypted.authTag, encrypted.keyId]);
    }
    if (ticket.source_channel === 'email' && user.role !== 'school_staff') {
      await db.execute(`UPDATE communication_conversations SET status='resolved', archived_at=UTC_TIMESTAMP()
        WHERE support_ticket_id=? AND agency_id=? AND channel='email' AND archived_at IS NULL`, [ticket.id, ticket.agency_id]);
    }
    await db.commit();
  } catch (error) { await db.rollback(); throw error; }
  finally { db.release(); }
}
