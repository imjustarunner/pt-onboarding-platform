import { isGrasshopperVoicemail } from './grasshopperVoicemail.service.js';
import { createHash } from 'node:crypto';
import pool from '../config/database.js';
import { replyMessageIds } from '../utils/emailThreading.js';

// Older importers stored only text. Retrying that exact delivery may enrich its
// representation, but must not recreate it, mark it unread, or change its date.
export async function restoreMissingInboundHtml(db, messageId, bodyHtml) {
  if (!bodyHtml) return false;
  const [result] = await db.execute(`UPDATE communication_messages SET body_html = ?
    WHERE id = ? AND direction = 'inbound' AND channel = 'email'
      AND (body_html IS NULL OR body_html = '')`, [bodyHtml, messageId]);
  return result.affectedRows > 0;
}

/** Inbox row lock serializes thread creation; receipt+message+attachments commit together. */
export async function persistInboundEmail({ inboxId, agencyId, deliveryId, conversationId = null, threadId = null, ownerUserId = null, fromEmail, replyToEmail = null, subject, bodyText, bodyHtml = null, to = [], cc = [], inReplyTo = null, referencesHeader = null, receivedAt = new Date(), attachments = [], isGroupEmail = false, internalNote = false, isAutoReply = false }) {
  if (!deliveryId) throw new Error('Inbound email is missing a delivery identifier');
  const hash = createHash('sha256').update(String(deliveryId)).digest('hex');
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [boxes] = await db.execute('SELECT id FROM communication_inboxes WHERE id = ? AND agency_id = ? FOR UPDATE', [inboxId, agencyId]);
    if (!boxes.length) throw new Error('Inbox not found');
    const [receipt] = await db.execute('SELECT message_id FROM communication_email_receipts WHERE inbox_id = ? AND delivery_hash = ?', [inboxId, hash]);
    if (receipt[0]?.message_id) {
      await restoreMissingInboundHtml(db, receipt[0].message_id, bodyHtml);
      const [m] = await db.execute('SELECT conversation_id FROM communication_messages WHERE id = ?', [receipt[0].message_id]);
      await db.commit();
      return { ingested: true, duplicate: true, conversationId: m[0]?.conversation_id, messageId: receipt[0].message_id, agencyId, inboxId };
    }
    // Backward compatibility with deliveries ingested before receipts existed.
    const [legacy] = await db.execute(`SELECT m.id, m.conversation_id FROM communication_messages m JOIN communication_conversations c ON c.id = m.conversation_id WHERE c.inbox_id = ? AND m.internet_message_id = ? ORDER BY m.id LIMIT 1`, [inboxId, deliveryId]);
    if (legacy[0]) {
      await restoreMissingInboundHtml(db, legacy[0].id, bodyHtml);
      await db.execute('INSERT INTO communication_email_receipts (inbox_id, delivery_hash, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)', [inboxId, hash, legacy[0].id]);
      await db.commit();
      return { ingested: true, duplicate: true, conversationId: legacy[0].conversation_id, messageId: legacy[0].id, agencyId, inboxId };
    }
    // Automated voicemail notifications may share Gmail threads despite different callers.
    // Keep each delivery separate so caller attribution never carries into another voicemail.
    const standaloneVoicemail = isGrasshopperVoicemail({ from: fromEmail, subject, bodyText });
    let cid = standaloneVoicemail ? null : conversationId;
    if (cid) {
      const [matched] = await db.execute('SELECT id FROM communication_conversations WHERE id = ? AND inbox_id = ? AND agency_id = ?', [cid, inboxId, agencyId]);
      if (!matched.length) throw new Error('Reply conversation does not belong to this inbox');
    }
    let ambiguousParent = false;
    if (!cid && !standaloneVoicemail) {
      for (const ancestor of replyMessageIds(inReplyTo, referencesHeader)) {
        const [matched] = await db.execute(`SELECT DISTINCT c.id FROM communication_messages m JOIN communication_conversations c ON c.id=m.conversation_id WHERE c.inbox_id=? AND m.internet_message_id=? LIMIT 2`, [inboxId, ancestor]);
        if (matched.length > 1) { ambiguousParent = true; break; }
        if (matched.length === 1) { cid = matched[0].id; break; }
      }
    }
    if (!cid && !standaloneVoicemail && !ambiguousParent && threadId) {
      const [matched] = await db.execute('SELECT id FROM communication_conversations WHERE inbox_id = ? AND external_thread_id = ? ORDER BY id LIMIT 2', [inboxId, threadId]);
      if (matched.length === 1) cid = matched[0].id;
    }
    if (!cid) {
      const [created] = await db.execute(`INSERT INTO communication_conversations (agency_id, inbox_id, channel, subject, status, owner_user_id, external_thread_id, is_unknown_sender) VALUES (?, ?, 'email', ?, 'needs_reply', ?, ?, 1)`, [agencyId, inboxId, subject || '(no subject)', ownerUserId, threadId]);
      cid = created.insertId;
    }
    const [msg] = await db.execute(`INSERT INTO communication_messages (conversation_id, channel, direction, from_json, to_json, cc_json, subject, body_text, body_html, internet_message_id, in_reply_to, references_header, is_group_email, is_internal_note, is_auto_reply, send_status, sent_at) VALUES (?, 'email', 'inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'sent', ?)`, [cid, JSON.stringify({ email: fromEmail, ...(replyToEmail ? {replyTo:replyToEmail} : {}) }), JSON.stringify(to), JSON.stringify(cc), subject || null, bodyText || '', bodyHtml || null, deliveryId, inReplyTo, referencesHeader, isGroupEmail ? 1 : 0, internalNote ? 1 : 0, isAutoReply ? 1 : 0, receivedAt]);
    for (const att of attachments) await db.execute('INSERT INTO communication_attachments (message_id, filename, content_type, size_bytes, storage_key) VALUES (?, ?, ?, ?, ?)', [msg.insertId, att.filename, att.contentType, att.sizeBytes, att.storageKey]);
    await db.execute(`INSERT INTO communication_participants (conversation_id, kind, email, display_name, is_primary) SELECT ?, 'email', ?, ?, NOT EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id = ? AND p.is_primary = 1) WHERE NOT EXISTS (SELECT 1 FROM communication_participants p WHERE p.conversation_id = ? AND LOWER(p.email) = LOWER(?))`, [cid, fromEmail, fromEmail, cid, cid, fromEmail]);
    await db.execute(`UPDATE communication_conversations SET status = 'needs_reply', archived_at = NULL, last_message_preview = IF(last_message_at IS NULL OR last_message_at <= ?, ?, last_message_preview), last_message_at = GREATEST(COALESCE(last_message_at, ?), ?) WHERE id = ?`, [receivedAt, String(bodyText || subject || '').replace(/\s+/g, ' ').slice(0, 240), receivedAt, receivedAt, cid]);
    await db.execute('INSERT INTO communication_email_receipts (inbox_id, delivery_hash, message_id) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE message_id = VALUES(message_id)', [inboxId, hash, msg.insertId]);
    await db.commit();
    try {
      const {autoFileEmailMessage}=await import('./clientConversationRecord.service.js');
      await autoFileEmailMessage(msg.insertId);
      const {syncEmailParentContact}=await import('./parentContact.service.js');
      await syncEmailParentContact(msg.insertId);
    } catch(e) { console.warn('[inbound parent contact]', msg.insertId, e.code || 'sync_failed'); }
    return { ingested: true, conversationId: cid, messageId: msg.insertId, agencyId, inboxId };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}
