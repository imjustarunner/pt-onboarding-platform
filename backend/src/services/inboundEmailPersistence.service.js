import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { replyMessageIds } from '../utils/emailThreading.js';

/** Inbox row lock serializes thread creation; receipt+message+attachments commit together. */
export async function persistInboundEmail({ inboxId, agencyId, deliveryId, conversationId = null, threadId = null, ownerUserId = null, fromEmail, subject, bodyText, to = [], cc = [], inReplyTo = null, referencesHeader = null, receivedAt = new Date(), attachments = [] }) {
  if (!deliveryId) throw new Error('Inbound email is missing a delivery identifier');
  const hash = createHash('sha256').update(String(deliveryId)).digest('hex');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [boxes] = await db.execute('SELECT id FROM communication_inboxes WHERE id = ? AND agency_id = ? FOR UPDATE', [inboxId, agencyId]);
    if (!boxes.length) throw new Error('Inbox not found');
    const [receipt] = await db.execute('SELECT message_id FROM communication_email_receipts WHERE inbox_id = ? AND delivery_hash = ?', [inboxId, hash]);
    if (receipt[0]?.message_id) {
      const [m] = await db.execute('SELECT conversation_id FROM communication_messages WHERE id = ?', [receipt[0].message_id]);
      await db.commit();
      return { ingested: true, duplicate: true, conversationId: m[0]?.conversation_id, messageId: receipt[0].message_id, agencyId, inboxId };
    }
    // Backward compatibility with deliveries ingested before receipts existed.
    const [legacy] = await db.execute(`SELECT m.id, m.conversation_id FROM communication_messages m JOIN communication_conversations c ON c.id = m.conversation_id WHERE c.inbox_id = ? AND m.internet_message_id = ? ORDER BY m.id LIMIT 1`, [inboxId, deliveryId]);
    if (legacy[0]) {
      await db.execute('INSERT INTO communication_email_receipts (inbox_id, delivery_hash, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)', [inboxId, hash, legacy[0].id]);
      await db.commit();
      return { ingested: true, duplicate: true, conversationId: legacy[0].conversation_id, messageId: legacy[0].id, agencyId, inboxId };
    }
    let cid = conversationId;
    if (cid) {
      const [matched] = await db.execute('SELECT id FROM communication_conversations WHERE id = ? AND inbox_id = ? AND agency_id = ?', [cid, inboxId, agencyId]);
      if (!matched.length) throw new Error('Reply conversation does not belong to this inbox');
    }
    let ambiguousParent = false;
    if (!cid) {
      for (const ancestor of replyMessageIds(inReplyTo, referencesHeader)) {
        const [matched] = await db.execute(`SELECT DISTINCT c.id FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id WHERE c.inbox_id=? AND m.internet_message_id=? LIMIT 2`, [inboxId, ancestor]);
        if (matched.length > 1) { ambiguousParent = true; break; }
        if (matched.length === 1) { cid = matched[0].id; break; }
      }
    }
    if (!cid && !ambiguousParent && threadId) {
      const [matched] = await db.execute('SELECT id FROM communication_conversations WHERE inbox_id = ? AND external_thread_id = ? ORDER BY id LIMIT 2', [inboxId, threadId]);
      if (matched.length === 1) cid = matched[0].id;
    }
    if (!cid) {
      const [created] = await db.execute(`INSERT INTO communication_conversations (agency_id, inbox_id, channel, subject, status, owner_user_id, external_thread_id) VALUES (?, ?, 'email', ?, 'needs_reply', ?, ?)`, [agencyId, inboxId, subject || '(no subject)', ownerUserId, threadId]);
      cid = created.insertId;
    }
    const [msg] = await db.execute(`INSERT INTO communication_messages (conversation_id, channel, direction, from_json, to_json, cc_json, subject, body_text, internet_message_id, in_reply_to, references_header, send_status, sent_at) VALUES (?, 'email', 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`, [cid, JSON.stringify({ email: fromEmail }), JSON.stringify(to), JSON.stringify(cc), subject || null, bodyText || '', deliveryId, inReplyTo, referencesHeader, receivedAt]);
    for (const att of attachments) await db.execute('INSERT INTO communication_attachments (message_id, filename, content_type, size_bytes, storage_key) VALUES (?, ?, ?, ?, ?)', [msg.insertId, att.filename, att.contentType, att.sizeBytes, att.storageKey]);
    await db.execute(`INSERT INTO communication_participants (conversation_id, kind, email, display_name, is_primary) SELECT ?, 'email', ?, ?, NOT EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id = ? AND p.is_primary = 1) WHERE NOT EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id = ? AND LOWER(p.email) = LOWER(?))`, [cid, fromEmail, fromEmail, cid, cid, fromEmail]);
    await db.execute(`UPDATE communication_conversations SET status = 'needs_reply', archived_at = NULL, last_message_preview = IF(last_message_at IS NULL OR last_message_at <= ?, ?, last_message_preview), last_message_at = GREATEST(COALESCE(last_message_at, ?), ?) WHERE id = ?`, [receivedAt, String(bodyText || subject || '').replace(/\s+/g, ' ').slice(0, 240), receivedAt, receivedAt, cid]);
    await db.execute('INSERT INTO communication_email_receipts (inbox_id, delivery_hash, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)', [inboxId, hash, msg.insertId]);
    await db.commit();
    return { ingested: true, conversationId: cid, messageId: msg.insertId, agencyId, inboxId };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
