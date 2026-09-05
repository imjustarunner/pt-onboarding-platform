/**
 * Route inbound replies to messages@ into the hub communication thread.
 */
import crypto from 'crypto';
import pool from '../config/database.js';
import CommunicationConversation from '../models/CommunicationConversation.model.js';

function sha256(v) {
  return crypto.createHash('sha256').update(String(v)).digest('hex');
}

/** Extract plus-tag from local part: messages+abc@x.com → abc */
export function extractPlusTag(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return null;
  const local = e.slice(0, at);
  const plus = local.indexOf('+');
  if (plus < 0) return null;
  const tag = local.slice(plus + 1).replace(/[^a-f0-9]/gi, '');
  return tag.length >= 16 ? tag : null;
}

export function stripPlusAddress(email) {
  const e = String(email || '').trim().toLowerCase();
  const at = e.lastIndexOf('@');
  if (at < 0) return e;
  const local = e.slice(0, at);
  const domain = e.slice(at);
  const plus = local.indexOf('+');
  if (plus < 0) return e;
  return `${local.slice(0, plus)}${domain}`;
}

export function isMessagesIdentity(identity) {
  const key = String(identity?.identity_key || '').toLowerCase();
  return key === 'messages' || key === 'messages_at_tenant';
}

export async function resolveHubReplyToken(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token) return null;
  const hash = sha256(token);
  const [rows] = await pool.execute(
    `SELECT * FROM hub_email_reply_tokens
     WHERE token_hash = ?
       AND (expires_at IS NULL OR expires_at > NOW())
     LIMIT 1`,
    [hash]
  );
  return rows?.[0] || null;
}

async function findConversationByParticipantEmail({ agencyId, identity, fromEmail }) {
  const email = String(fromEmail || '').trim().toLowerCase();
  if (!email || !identity?.id) return null;
  const aid = Number(agencyId || identity.agency_id) || null;
  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id
     FROM communication_conversations c
     JOIN communication_inboxes i ON i.id = c.inbox_id
     JOIN communication_participants p ON p.conversation_id = c.id
     WHERE c.channel = 'email'
       AND i.sender_identity_id = ?
       ${aid ? 'AND c.agency_id = ?' : ''}
       AND LOWER(COALESCE(p.email, '')) = ?
       AND c.archived_at IS NULL
     ORDER BY COALESCE(c.last_message_at, c.created_at) DESC
     LIMIT 1`,
    aid ? [identity.id, aid, email] : [identity.id, email]
  );
  return rows?.[0] || null;
}

/**
 * Ingest an email reply into an existing hub conversation.
 * Prefer plus-token; fall back to matching From address on the messages@ inbox thread.
 */
export async function ingestHubEmailReply({
  agencyId,
  identity,
  fromEmail,
  subject,
  bodyText,
  toAddresses = [],
  messageIdHeader = null,
  inReplyTo = null,
  referencesHeader = null,
  receivedAt = null
} = {}) {
  if (!isMessagesIdentity(identity)) return { ingested: false, reason: 'not_messages_identity' };

  let tokenRow = null;
  for (const addr of toAddresses || []) {
    const tag = extractPlusTag(addr);
    if (!tag) continue;
    tokenRow = await resolveHubReplyToken(tag);
    if (tokenRow) break;
  }

  let conversationId = tokenRow ? Number(tokenRow.conversation_id) : null;
  let personKey = tokenRow?.person_key || null;
  let aid = Number(tokenRow?.agency_id || agencyId || identity?.agency_id) || null;

  if (!conversationId) {
    const hit = await findConversationByParticipantEmail({
      agencyId: aid,
      identity,
      fromEmail
    });
    if (!hit?.id) return { ingested: false, reason: 'no_matching_conversation' };
    conversationId = Number(hit.id);
    aid = Number(hit.agency_id || aid);
  }

  await CommunicationConversation.addMessage({
    conversationId,
    channel: 'email',
    direction: 'inbound',
    authorUserId: null,
    from: { email: fromEmail },
    to: [{ email: identity?.from_email }],
    subject: subject || null,
    bodyText: bodyText || '',
    bodyHtml: null,
    internetMessageId: messageIdHeader || null,
    inReplyTo: inReplyTo || null,
    referencesHeader: referencesHeader || null,
    sentAt: receivedAt || new Date()
  });

  await pool
    .execute(
      `UPDATE communication_conversations
       SET status = 'needs_reply',
           last_message_at = COALESCE(?, last_message_at, NOW()),
           last_message_preview = ?
       WHERE id = ?`,
      [
        receivedAt || new Date(),
        String(bodyText || subject || '')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 240),
        conversationId
      ]
    )
    .catch(() => {});

  return {
    ingested: true,
    conversationId,
    agencyId: aid,
    personKey
  };
}
