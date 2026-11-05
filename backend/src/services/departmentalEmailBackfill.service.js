import pool from '../config/database.js';
import { groupKeyForIdentity, DEPARTMENTAL_GROUPS } from './departmentalGroupPolicy.js';
import { emailHash, emailKey, parseEmailList } from './supportTicketEmailPolicy.js';
import { encryptSupportEmailText } from './supportEmailEncryption.js';
import { decryptChatText } from './chatEncryption.service.js';
import { preserveSupportTicketEmailCanonical } from './supportTicketEmail.service.js';

const MAX_MESSAGES = 250;
const MAX_ATTACHMENTS = 500;
const review = code => Object.assign(new Error(code), { code, needsReview: true });
const object = value => typeof value === 'string' ? JSON.parse(value) : value;
const messageId = message => message.internet_message_id || `app-communication:${message.id}`;
const sourceSql = `SELECT c.*,i.kind,i.owner_user_id AS inbox_owner_user_id,i.from_email,
  COALESCE(e.identity_key,i.identity_key) AS identity_key
  FROM communication_conversations c JOIN communication_inboxes i ON i.id=c.inbox_id
  JOIN email_sender_identities e ON e.id=i.sender_identity_id
  WHERE c.agency_id=? AND c.channel='email' AND i.is_active=1 AND e.is_active=1
    AND i.owner_user_id IS NULL AND i.kind<>'personal'`;

/** No body content appears in the dry-run report. Unfinished drafts stay intact. */
export function prepareDepartmentalConversationBackfill(conversation, messages, attachments) {
  const groupKey = groupKeyForIdentity({ kind: conversation.kind, owner_user_id: conversation.inbox_owner_user_id,
    identity_key: conversation.identity_key, from_email: conversation.from_email });
  if (!groupKey) throw review('NOT_DEPARTMENTAL_MAILBOX');
  if (conversation.support_ticket_id) throw review('ALREADY_TICKETED');
  if (String(conversation.draft_body || '').trim()) throw review('UNFINISHED_DRAFT');
  if (!messages.length || messages.length > MAX_MESSAGES || attachments.length > MAX_ATTACHMENTS) throw review('HISTORY_OUTSIDE_BATCH_LIMIT');
  let bodySize = 0;
  for (const message of messages) {
    if (message.support_ticket_message_id) throw review('MESSAGE_ALREADY_LINKED');
    if (!['inbound', 'outbound', 'internal'].includes(message.direction)) throw review('UNSUPPORTED_MESSAGE_DIRECTION');
    if (message.direction === 'outbound' && !Number(message.is_internal_note)
      && (message.send_status !== 'sent' || !message.sent_at)) throw review('UNSENT_OUTBOUND_MESSAGE');
    if (String(message.body_html || '').trim()) throw review('HTML_HISTORY_REQUIRES_REVIEW');
    bodySize += String(message.body_text || '').length;
    if (bodySize > 2_000_000) throw review('HISTORY_OUTSIDE_BATCH_LIMIT');
  }
  const seed = messages.find(message => message.direction === 'inbound' && !Number(message.is_internal_note));
  if (!seed) throw review('NO_INBOUND_MESSAGE');
  const sender = emailKey(object(seed.from_json)?.email);
  if (!sender.includes('@')) throw review('MISSING_ORIGINAL_SENDER');
  for (const attachment of attachments) {
    if (!attachment.storage_key || attachment.storage_key.length > 500) throw review('ATTACHMENT_STORAGE_REQUIRES_REVIEW');
    if (!messages.some(message => Number(message.id) === Number(attachment.message_id))) throw review('ATTACHMENT_MESSAGE_MISMATCH');
  }
  const status = conversation.archived_at || conversation.status === 'resolved' ? 'closed'
    : conversation.status === 'waiting_on_them' ? 'answered' : 'open';
  return { groupKey, seed, sender, status, topic: DEPARTMENTAL_GROUPS[groupKey].topic,
    threadId: conversation.external_thread_id || `app-conversation:${conversation.id}`,
    recipients: [...new Set([emailKey(conversation.from_email), ...parseEmailList(seed.to_json), ...parseEmailList(seed.cc_json)].filter(Boolean))] };
}

function verifiedEncryption(body) {
  const encrypted = encryptSupportEmailText(body);
  if (decryptChatText({ ciphertextB64: encrypted.ciphertext, ivB64: encrypted.iv, authTagB64: encrypted.authTag, keyId: encrypted.keyId }) !== body) {
    throw new Error('BACKFILL_ENCRYPTION_VERIFICATION_FAILED');
  }
  return encrypted;
}

async function readHistory(db, conversationId, lock = false) {
  const [messages] = await db.execute(`SELECT * FROM communication_messages WHERE conversation_id=?
    ORDER BY COALESCE(sent_at,created_at),id LIMIT ${MAX_MESSAGES + 1}${lock ? ' FOR UPDATE' : ''}`, [conversationId]);
  const [attachments] = await db.execute(`SELECT a.* FROM communication_attachments a
    JOIN communication_messages m ON m.id=a.message_id WHERE m.conversation_id=? ORDER BY a.id LIMIT ${MAX_ATTACHMENTS + 1}${lock ? ' FOR UPDATE' : ''}`, [conversationId]);
  return { messages, attachments };
}

async function assertUnclaimedHistory(db, agencyId, messages, threadId, conversationId) {
  const [links] = await db.execute("SELECT entity_id FROM communication_links WHERE conversation_id=? AND entity_type='ticket' LIMIT 1", [conversationId]);
  if (links.length) throw review('EXISTING_TICKET_LINK_REQUIRES_REVIEW');
  const ids = messages.filter(message => !Number(message.is_internal_note) && message.direction !== 'internal').map(messageId);
  const [receipts] = await db.execute(`SELECT ticket_id FROM support_ticket_email_messages
    WHERE agency_id=? AND internet_message_id_hash IN (${ids.map(() => '?').join(',')}) LIMIT 1`, [agencyId, ...ids.map(emailHash)]);
  const [threads] = await db.execute('SELECT id FROM support_tickets WHERE agency_id=? AND source_email_thread_id=? LIMIT 1', [agencyId, threadId]);
  if (receipts.length || threads.length) throw review('EXISTING_TICKET_HISTORY_REQUIRES_REVIEW');
}

/** One transaction owns the new encrypted ticket and its original conversation.
 * The shared intake lock prevents a concurrent delivery from creating a second
 * ticket. Source text is cleared only after every stored ciphertext is verified.
 */
async function applyConversation(agencyId, conversationId, database) {
  const db = await database.getConnection();
  const lockName = `support-email:${agencyId}`;
  let locked = false;
  try {
    const [[lock]] = await db.execute('SELECT GET_LOCK(?,5) AS acquired', [lockName]);
    if (Number(lock?.acquired) !== 1) throw review('EMAIL_INTAKE_BUSY');
    locked = true;
    await db.beginTransaction();
    const [[conversation]] = await db.execute(`${sourceSql} AND c.id=? FOR UPDATE`, [agencyId, conversationId]);
    if (!conversation) throw review('SOURCE_CHANGED');
    const { messages, attachments } = await readHistory(db, conversationId, true);
    const plan = prepareDepartmentalConversationBackfill(conversation, messages, attachments);
    await assertUnclaimedHistory(db,agencyId,messages,plan.threadId,conversationId);
    const question = verifiedEncryption(String(plan.seed.body_text || ''));
    const [created] = await db.execute(`INSERT INTO support_tickets
      (agency_id,school_organization_id,created_by_user_id,created_by_source_key,source_channel,
       source_email_from,source_email_subject,source_email_message_id,source_email_thread_id,source_email_received_at,
       email_ingested_at,source_email_recipients,subject,question,question_ciphertext,question_iv,question_auth_tag,
       question_encryption_key_id,topic,status,claimed_by_user_id,claimed_at,priority,created_at)
      VALUES (?,?,NULL,'inbound_email','email',?,?,?,?,?,CURRENT_TIMESTAMP,?,?,NULL,?,?,?,?,?,?,?,?,?,?)`,
    [agencyId,agencyId,plan.sender,String(conversation.subject || '').slice(0,255),messageId(plan.seed),plan.threadId,
      plan.seed.sent_at || plan.seed.created_at,JSON.stringify(plan.recipients),String(conversation.subject || 'Group email').slice(0,255),
      question.ciphertext,question.iv,question.authTag,question.keyId,plan.topic,plan.status,
      conversation.owner_user_id || null,conversation.owner_user_id ? conversation.updated_at : null,
      conversation.priority || 'normal',conversation.created_at]);
    const ticketId = Number(created.insertId);
    const [[storedQuestion]] = await db.execute('SELECT * FROM support_tickets WHERE id=?', [ticketId]);
    if (decryptChatText({ciphertextB64:storedQuestion.question_ciphertext,ivB64:storedQuestion.question_iv,
      authTagB64:storedQuestion.question_auth_tag,keyId:storedQuestion.question_encryption_key_id}) !== String(plan.seed.body_text || '')) throw new Error('BACKFILL_ENCRYPTION_READBACK_FAILED');
    const mapped = new Map();
    for (const message of messages) {
      const body = String(message.body_text || '');
      const encrypted = verifiedEncryption(body);
      const internal = message.direction === 'internal' || Number(message.is_internal_note) === 1;
      const [saved] = await db.execute(`INSERT INTO support_ticket_messages
        (ticket_id,author_user_id,author_role,body,body_ciphertext,body_iv,body_auth_tag,encryption_key_id,is_internal,created_at)
        VALUES (?,?,?,NULL,?,?,?,?,?,?)`, [ticketId,message.author_user_id || null,
        internal ? 'staff_internal' : message.direction === 'inbound' ? 'system_email' : 'system_email_outbound',
        encrypted.ciphertext,encrypted.iv,encrypted.authTag,encrypted.keyId,internal ? 1 : 0,message.sent_at || message.created_at]);
      const ticketMessageId = Number(saved.insertId);
      const [[stored]] = await db.execute('SELECT * FROM support_ticket_messages WHERE id=?', [ticketMessageId]);
      if (decryptChatText({ciphertextB64:stored.body_ciphertext,ivB64:stored.body_iv,authTagB64:stored.body_auth_tag,keyId:stored.encryption_key_id}) !== body) throw new Error('BACKFILL_ENCRYPTION_READBACK_FAILED');
      mapped.set(Number(message.id),ticketMessageId);
      if (!internal) {
        const from = object(message.from_json) || {};
        const fromEmail = emailKey(from.email || (message.direction === 'outbound' ? conversation.from_email : ''));
        if (!fromEmail) throw review('MISSING_MESSAGE_SENDER');
        await db.execute(`INSERT INTO support_ticket_email_messages
          (ticket_id,ticket_message_id,agency_id,direction,send_status,from_email,from_name,to_json,cc_json,subject,
           internet_message_id,internet_message_id_hash,in_reply_to,references_header,gmail_thread_id,sent_at)
          VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [ticketId,ticketMessageId,agencyId,message.direction,
          message.direction === 'inbound' ? 'received' : 'sent',fromEmail,from.name || null,
          JSON.stringify(parseEmailList(message.to_json)),JSON.stringify(parseEmailList(message.cc_json)),
          String(message.subject || conversation.subject || '').slice(0,998),messageId(message),emailHash(messageId(message)),
          message.in_reply_to || null,message.references_header || null,plan.threadId,message.sent_at || message.created_at]);
      }
    }
    for (const attachment of attachments) await db.execute(`INSERT INTO support_ticket_attachments
      (ticket_id,support_ticket_message_id,uploaded_by_user_id,file_name,file_path,mime_type,file_size,created_at)
      VALUES (?,?,NULL,?,?,?,?,?)`, [ticketId,mapped.get(Number(attachment.message_id)),attachment.filename,
      attachment.storage_key,String(attachment.content_type || '').slice(0,120) || null,attachment.size_bytes || null,attachment.created_at]);
    await preserveSupportTicketEmailCanonical({id:ticketId,agency_id:agencyId,source_email_thread_id:plan.threadId},db);
    for (const message of messages) await db.execute(`UPDATE communication_messages SET support_ticket_message_id=?,body_text=NULL,body_html=NULL WHERE id=?`, [mapped.get(Number(message.id)),message.id]);
    await db.execute('UPDATE communication_conversations SET support_ticket_id=?,last_message_preview=? WHERE id=? AND support_ticket_id IS NULL', [ticketId,conversation.subject || 'Group email',conversationId]);
    await db.execute(`INSERT INTO communication_links (conversation_id,entity_type,entity_id,label)
      VALUES (?,'ticket',?,?) ON DUPLICATE KEY UPDATE label=VALUES(label)`, [conversationId,ticketId,`Ticket #${ticketId}`]);
    await db.commit();
    return { conversationId, ticketId, groupKey: plan.groupKey, messages: messages.length, attachments: attachments.length, status: 'migrated' };
  } catch (error) {
    await db.rollback().catch(() => {});
    if (error.needsReview) return { conversationId, status: 'needs_review', reason: error.code };
    throw error;
  } finally {
    if (locked) await db.execute('SELECT RELEASE_LOCK(?)', [lockName]).catch(() => {});
    db.release();
  }
}

export async function backfillDepartmentalEmailTickets({ agencyId, apply = false, limit = 50, afterId = 0 } = {}, { database = pool } = {}) {
  if (!Number.isSafeInteger(Number(agencyId)) || Number(agencyId) < 1) throw new Error('A positive agencyId is required');
  const size = Math.min(100, Math.max(1, Number(limit) || 50));
  const [candidates] = await database.execute(`${sourceSql} AND c.support_ticket_id IS NULL AND c.id>?
    ORDER BY c.id LIMIT ${Math.trunc(size)}`, [Number(agencyId),Number(afterId) || 0]);
  const results = [];
  for (const conversation of candidates) {
    try {
      const { messages, attachments } = await readHistory(database, conversation.id);
      const plan = prepareDepartmentalConversationBackfill(conversation,messages,attachments);
      if (!apply) await assertUnclaimedHistory(database,Number(agencyId),messages,plan.threadId,conversation.id);
      results.push(apply ? await applyConversation(Number(agencyId),conversation.id,database)
        : {conversationId:conversation.id,groupKey:plan.groupKey,status:'ready',messages:messages.length,attachments:attachments.length});
    } catch (error) {
      results.push({conversationId:conversation.id,status:error.needsReview?'needs_review':'failed',reason:error.code || 'BACKFILL_FAILED'});
    }
  }
  return {agencyId:Number(agencyId),apply,limit:Math.trunc(size),nextAfterId:candidates.at(-1)?.id || Number(afterId) || 0,results};
}
