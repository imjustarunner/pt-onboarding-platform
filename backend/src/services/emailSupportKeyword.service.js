import pool from '../config/database.js';
import { getAgencyEmailSettings } from './emailSettings.service.js';
import { personalReminderReplyText } from '../utils/personalReminderReply.js';
import { prepareEncryptedTicketText } from '../utils/supportTicketCrypto.js';

// The OOO instructions ask the sender to reply with the keyword. It must be a
// command on the first new line, not an address/signature or quoted instructions.
export function isSupportKeywordReply(bodyText, keyword = 'SUPPORT') {
  const reply = personalReminderReplyText(bodyText);
  const firstLine = reply.split(/\r?\n/).map(line => line.trim()).find(Boolean) || '';
  return firstLine.replace(/[.!]+$/, '').trim().toUpperCase() === String(keyword || 'SUPPORT').trim().toUpperCase();
}

export async function handleSupportKeywordReply({ agencyId, conversationId, bodyText, fromEmail }) {
  const settings = await getAgencyEmailSettings(agencyId);
  if (!isSupportKeywordReply(bodyText, settings.clientOooSupportKeyword)) return { handled: false };

  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    // Serialize repeated delivery of the same conversation; ticket and link
    // commit together, so a failed insert cannot leave a half-created escalation.
    const [[conversation]] = await db.execute(
      'SELECT id, support_ticket_id FROM communication_conversations WHERE id=? AND agency_id=? FOR UPDATE',
      [conversationId, agencyId]
    );
    if (!conversation) {
      await db.rollback();
      return { handled: false, reason: 'conversation_not_found' };
    }
    if (conversation.support_ticket_id) {
      await db.commit();
      return { handled: true, ticketId: conversation.support_ticket_id, duplicate: true };
    }
    const [[school]] = await db.execute(
      `SELECT a.id FROM communication_links l JOIN agencies a ON a.id=l.entity_id
       WHERE l.conversation_id=? AND l.entity_type='school' AND a.organization_type='school' AND a.is_active=1
         AND (a.id=? OR EXISTS (SELECT 1 FROM organization_affiliations oa WHERE oa.organization_id=a.id AND oa.agency_id=? AND oa.is_active=1)
           OR EXISTS (SELECT 1 FROM agency_schools s WHERE s.school_organization_id=a.id AND s.agency_id=? AND s.is_active=1))
       ORDER BY l.id LIMIT 1`,
      [conversationId, agencyId, agencyId, agencyId]
    );
    const [messages] = await db.execute(
      `SELECT body_text, direction, is_auto_reply FROM communication_messages
       WHERE conversation_id=? ORDER BY COALESCE(sent_at,created_at) DESC, id DESC LIMIT 40`, [conversationId]
    );
    const transcript = [...messages].reverse().map(m =>
      `[${m.direction}${m.is_auto_reply ? '/auto' : ''}] ${String(m.body_text || '').replace(/\s+/g, ' ').trim().slice(0, 240)}`
    ).join('\n');
    const question = prepareEncryptedTicketText([
      `Sender requested support for conversation #${conversationId}.`,
      `From: ${String(fromEmail || '').trim()}`, '', transcript || personalReminderReplyText(bodyText)
    ].join('\n'));
    // Non-school requests use the agency's organization, as other tenant support
    // entry points do. Never invent a school or attribute the sender to staff.
    const [result] = await db.execute(
      `INSERT INTO support_tickets
       (school_organization_id, agency_id, created_by_user_id, created_by_source_key,
        subject, question, status, priority, source_channel, source_email_from,
        question_ciphertext, question_iv, question_auth_tag, question_encryption_key_id)
       VALUES (?, ?, NULL, 'inbound_email', ?, ?, 'open', 'medium', 'email', ?, ?, ?, ?, ?)`,
      [school?.id || agencyId, agencyId, `Support requested (conversation #${conversationId})`, question.plain,
        String(fromEmail || '').trim() || null, question.ciphertext, question.iv, question.authTag, question.keyId]
    );
    if (!result.insertId) throw new Error('Support ticket was not saved');
    await db.execute('UPDATE communication_conversations SET support_ticket_id=? WHERE id=? AND agency_id=?',
      [result.insertId, conversationId, agencyId]);
    await db.commit();
    return { handled: true, ticketId: result.insertId };
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    db.release();
  }
}
