/**
 * Client / guardian portal mailbox: email conversations they are a participant on.
 * No staff Communications permissions — list, read, simple reply.
 */
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';

async function userEmails(userId) {
  const [rows] = await pool.execute(
    `SELECT email, personal_email FROM users WHERE id = ? LIMIT 1`,
    [userId]
  );
  const u = rows?.[0] || {};
  return [...new Set(
    [u.email, u.personal_email]
      .map((e) => String(e || '').trim().toLowerCase())
      .filter((e) => e.includes('@'))
  )];
}

async function assertEmailParticipant(conversationId, emails) {
  if (!emails.length) return null;
  const ph = emails.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT c.id, c.subject, c.agency_id, c.inbox_id, c.channel, i.from_email AS inbox_from
     FROM communication_conversations c
     LEFT JOIN communication_inboxes i ON i.id = c.inbox_id
     WHERE c.id = ?
       AND c.channel = 'email'
       AND c.archived_at IS NULL
       AND EXISTS (
         SELECT 1 FROM communication_participants p
         WHERE p.conversation_id = c.id
           AND LOWER(COALESCE(p.email, '')) IN (${ph})
       )
     LIMIT 1`,
    [conversationId, ...emails]
  );
  return rows?.[0] || null;
}

export async function listPortalEmails({ userId } = {}) {
  const uid = Number(userId || 0);
  if (!uid) return [];
  const emails = await userEmails(uid);
  if (!emails.length) return [];
  const ph = emails.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT c.id,
            c.subject,
            c.last_message_at,
            c.last_message_preview,
            c.agency_id,
            (
              SELECT r.last_read_at
              FROM communication_conversation_reads r
              WHERE r.conversation_id = c.id AND r.user_id = ?
              LIMIT 1
            ) AS last_read_at,
            (
              SELECT COALESCE(m.sent_at, m.created_at)
              FROM communication_messages m
              WHERE m.conversation_id = c.id
                AND m.direction = 'outbound'
                AND COALESCE(m.is_internal_note, 0) = 0
                AND (m.send_status IS NULL OR m.send_status NOT IN ('cancelled'))
              ORDER BY COALESCE(m.sent_at, m.created_at) DESC, m.id DESC
              LIMIT 1
            ) AS last_from_staff_at
     FROM communication_conversations c
     WHERE c.channel = 'email'
       AND c.archived_at IS NULL
       AND COALESCE(c.is_spam, 0) = 0
       AND EXISTS (
         SELECT 1 FROM communication_participants p
         WHERE p.conversation_id = c.id
           AND LOWER(COALESCE(p.email, '')) IN (${ph})
       )
     ORDER BY COALESCE(c.last_message_at, c.updated_at) DESC
     LIMIT 80`,
    [uid, ...emails]
  );
  return (rows || []).map((r) => {
    const lastStaff = r.last_from_staff_at ? new Date(r.last_from_staff_at) : null;
    const lastRead = r.last_read_at ? new Date(r.last_read_at) : null;
    const unread = !!(lastStaff && (!lastRead || lastRead < lastStaff));
    return {
      type: 'email',
      conversationId: Number(r.id),
      subject: r.subject || 'Email',
      preview: r.last_message_preview || r.subject || '',
      last_message_at: r.last_message_at,
      unread,
      agency_id: r.agency_id
    };
  });
}

export async function getPortalEmail({ userId, conversationId } = {}) {
  const uid = Number(userId || 0);
  const cid = Number(conversationId || 0);
  if (!uid || !cid) return null;
  const emails = await userEmails(uid);
  const conv = await assertEmailParticipant(cid, emails);
  if (!conv) return null;
  const messages = await CommunicationConversation.listMessages(cid, { limit: 200 });
  await CommunicationConversation.markRead(cid, uid);
  const mine = new Set(emails);
  return {
    conversation: {
      id: Number(conv.id),
      subject: conv.subject || 'Email',
      agency_id: conv.agency_id
    },
    messages: (messages || [])
      .filter((m) => String(m.direction || '') !== 'internal' && !m.is_internal_note)
      .map((m) => {
    const fromEmail = String(
      m.from?.email ||
        (Array.isArray(m.from) ? m.from[0]?.email : '') ||
        ''
    ).toLowerCase();
        const isMine =
          Number(m.author_user_id) === uid ||
          (String(m.direction) === 'inbound' && mine.has(fromEmail));
        return {
          id: `email-${m.id}`,
          body: m.body_text || m.body || '',
          created_at: m.sent_at || m.created_at,
          isMine,
          direction: m.direction
        };
      })
  };
}

export async function replyPortalEmail({ userId, conversationId, body } = {}) {
  const uid = Number(userId || 0);
  const cid = Number(conversationId || 0);
  const text = String(body || '').trim();
  if (!uid || !cid || !text) {
    const err = new Error('body is required');
    err.status = 400;
    throw err;
  }
  const emails = await userEmails(uid);
  const conv = await assertEmailParticipant(cid, emails);
  if (!conv) {
    const err = new Error('Conversation not found');
    err.status = 404;
    throw err;
  }
  const fromEmail = emails[0];
  const [nameRows] = await pool.execute(
    `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
    [uid]
  );
  const displayName = [nameRows?.[0]?.first_name, nameRows?.[0]?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim() || fromEmail;
  const toEmail = String(conv.inbox_from || '').trim() || null;

  await CommunicationConversation.addMessage({
    conversationId: cid,
    channel: 'email',
    direction: 'inbound',
    authorUserId: uid,
    from: { email: fromEmail, name: displayName },
    to: toEmail ? [{ email: toEmail }] : null,
    subject: conv.subject || null,
    bodyText: text,
    sentAt: new Date(),
    sendStatus: 'sent'
  });
  await CommunicationConversation.markRead(cid, uid);
  return { ok: true };
}
