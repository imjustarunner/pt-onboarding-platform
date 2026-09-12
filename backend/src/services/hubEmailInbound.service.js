import { persistInboundEmail } from './inboundEmailPersistence.service.js';
import { prepareInboundAttachments } from './communicationAttachments.service.js';
/**
 * Route inbound replies to messages@ into the hub communication thread.
 */
import crypto from 'crypto';
import { replyMessageIds } from '../utils/emailThreading.js';
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

async function findConversationByReplyHeaders({ agencyId, identity, inReplyTo, referencesHeader, threadId }) {
  const ids = replyMessageIds(inReplyTo, referencesHeader);
  for (const id of ids) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id, c.agency_id
       FROM communication_conversations c
       JOIN communication_inboxes i ON i.id = c.inbox_id
       JOIN communication_messages m ON m.conversation_id = c.id
       WHERE c.channel = 'email' AND c.agency_id = ?
         AND i.sender_identity_id = ? AND m.internet_message_id = ?
       LIMIT 2`,
      [agencyId, identity.id, id]
    );
    if (rows?.length === 1) return rows[0];
    if (rows?.length > 1) return null;
  }
  // Gmail's thread ID is useful for older sends whose RFC Message-ID was not stored.
  if (threadId) {
    const [rows] = await pool.execute(
      `SELECT DISTINCT c.id, c.agency_id FROM communication_conversations c
       JOIN communication_inboxes i ON i.id = c.inbox_id
       WHERE c.channel = 'email' AND c.agency_id = ?
         AND i.sender_identity_id = ?
         AND (c.external_thread_id = ? OR EXISTS (
           SELECT 1 FROM communication_messages m
           JOIN user_communications uc ON uc.external_message_id = m.internet_message_id
           WHERE m.conversation_id = c.id
             AND JSON_UNQUOTE(JSON_EXTRACT(uc.metadata, '$.threadId')) = ?
         )) LIMIT 2`,
      [agencyId, identity.id, threadId, threadId]
    );
    if (rows?.length === 1) return rows[0];
  }
  return null;
}

/**
 * Ingest an email reply into an existing hub conversation.
 * Match a scoped reply token or email reply headers; never guess from sender or subject.
 */
export async function ingestHubEmailReply({
  agencyId,
  identity,
  fromEmail,
  subject,
  bodyText,
  toAddresses = [],
  ccAddresses = [],
  threadId = null,
  messageIdHeader = null,
  inReplyTo = null,
  referencesHeader = null,
  receivedAt = null, gmail = null, gmailMessageId = null, gmailPayload = null
} = {}) {
  if (!isMessagesIdentity(identity)) return { ingested: false, reason: 'not_messages_identity' };

  const inboundAgencyId = Number(agencyId || identity.agency_id);
  if (!inboundAgencyId || Number(identity.agency_id) !== inboundAgencyId) {
    return { ingested: false, reason: 'identity_agency_mismatch' };
  }
  let tokenRow = null;
  for (const addr of toAddresses || []) {
    if (stripPlusAddress(addr) !== stripPlusAddress(identity.from_email)) continue;
    const tag = extractPlusTag(addr);
    if (!tag) continue;
    tokenRow = await resolveHubReplyToken(tag);
    if (tokenRow && Number(tokenRow.agency_id) === inboundAgencyId) {
      const conv = await CommunicationConversation.findById(tokenRow.conversation_id);
      if (Number(conv?.agency_id) === inboundAgencyId && Number(conv?.sender_identity_id) === Number(identity.id)) break;
    }
    tokenRow = null;
  }

  let conversationId = tokenRow ? Number(tokenRow.conversation_id) : null;
  let personKey = tokenRow?.person_key || null;
  let aid = Number(tokenRow?.agency_id || agencyId || identity?.agency_id) || null;

  if (!conversationId) {
    const hit = await findConversationByReplyHeaders({
      agencyId: aid,
      identity,
      inReplyTo, referencesHeader, threadId
    });
    if (!hit?.id) return { ingested: false, reason: 'no_matching_conversation' };
    conversationId = Number(hit.id);
    aid = Number(hit.agency_id || aid);
  }

  const conversation = await CommunicationConversation.findById(conversationId);
  if (!conversation?.inbox_id) throw new Error('Reply inbox not found');
  const attachments = await prepareInboundAttachments({ gmail, gmailMessageId, payload: gmailPayload, inboxId: conversation.inbox_id });
  const result = await persistInboundEmail({
    inboxId: conversation.inbox_id, agencyId: aid, conversationId,
    deliveryId: messageIdHeader || (gmailMessageId ? `gmail:${gmailMessageId}` : null),
    threadId, fromEmail, subject, bodyText,
    to: toAddresses.map((email) => ({ email })), cc: ccAddresses.map((email) => ({ email })),
    inReplyTo, referencesHeader, receivedAt: receivedAt || new Date(), attachments
  });
  return { ...result, personKey };
}
