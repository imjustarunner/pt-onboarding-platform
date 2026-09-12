/** Read-only: report record IDs/counts, never message bodies or recipient addresses. */
import pool from '../config/database.js';
import { replyMessageIds } from '../utils/emailThreading.js';

try {
  const [rows] = await pool.execute(`SELECT m.id, m.conversation_id, m.internet_message_id, m.in_reply_to, m.references_header,
      c.inbox_id, c.external_thread_id FROM communication_messages m
    JOIN communication_conversations c ON c.id=m.conversation_id
    WHERE c.channel='email' AND COALESCE(m.is_internal_note,0)=0 AND COALESCE(m.send_status,'sent')='sent'
    ORDER BY m.id`);
  const byInboxId = new Map();
  for (const row of rows) {
    if (!row.internet_message_id) continue;
    const key = `${row.inbox_id}:${row.internet_message_id}`;
    const list = byInboxId.get(key) || [];
    list.push(row); byInboxId.set(key, list);
  }
  const duplicateDeliveries = [...byInboxId.values()].filter((r) => r.length > 1).map((r) => ({ inboxId: r[0].inbox_id, messageIds: r.map((m) => m.id), conversationIds: [...new Set(r.map((m) => m.conversation_id))] }));
  const crossConversationReplies = [];
  const roots = new Map();
  for (const row of rows) {
    const ancestry = replyMessageIds(row.in_reply_to, row.references_header);
    const parent = ancestry.map((id) => byInboxId.get(`${row.inbox_id}:${id}`)).find((matches) => matches?.length === 1)?.[0];
    if (parent && parent.conversation_id !== row.conversation_id) crossConversationReplies.push({ messageId: row.id, conversationId: row.conversation_id, parentMessageId: parent.id, parentConversationId: parent.conversation_id });
    if (!ancestry.length && /^<[^<>]+>$/.test(row.internet_message_id || '')) {
      const list = roots.get(row.conversation_id) || [];
      list.push(row.id); roots.set(row.conversation_id, list);
    }
  }
  const independentRootsForReview = [...roots].filter(([, ids]) => ids.length > 1).map(([conversationId, messageIds]) => ({ conversationId, messageIds }));
  const [sms] = await pool.execute("SELECT COUNT(*) total, SUM(from_number IS NULL OR to_number IS NULL) missingPhonePair FROM message_logs");
  console.log(JSON.stringify({ reviewedEmailMessages: rows.length, duplicateDeliveries, crossConversationReplies, independentRootsForReview, sms: sms[0], note: 'Multiple roots are candidates for human review, not proof of a merge. No records were changed.' }, null, 2));
} finally { await pool.end(); }
