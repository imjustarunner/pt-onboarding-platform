import { randomUUID } from 'node:crypto';
import pool from '../config/database.js';

export async function resolveChatTopic({ threadId, userId, topicId = null, legacyRootMessageId = null, subject = null }) {
  const [members] = await pool.execute('SELECT 1 FROM chat_thread_participants WHERE thread_id = ? AND user_id = ? LIMIT 1', [threadId, userId]);
  if (!members.length) throw Object.assign(new Error('Chat topic not found'), { status: 404 });
  if (topicId) {
    const [topics] = await pool.execute('SELECT id FROM chat_topics WHERE id = ? AND thread_id = ? LIMIT 1', [topicId, threadId]);
    if (!topics.length) throw Object.assign(new Error('Chat topic not found'), { status: 404 });
    return topics[0].id;
  }
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    let rootId = null;
    if (legacyRootMessageId) {
      const [messages] = await db.execute('SELECT id, parent_message_id FROM chat_messages WHERE id = ? AND thread_id = ?', [legacyRootMessageId, threadId]);
      if (!messages.length) throw Object.assign(new Error('Original message not found'), { status: 404 });
      rootId = messages[0].parent_message_id || messages[0].id;
      const [root] = await db.execute('SELECT topic_id, subject FROM chat_messages WHERE id = ? AND thread_id = ? FOR UPDATE', [rootId, threadId]);
      if (!root.length) throw Object.assign(new Error('Original message not found'), { status: 404 });
      if (root[0].topic_id) { await db.commit(); return root[0].topic_id; }
      subject = root[0].subject || subject;
    }
    const id = randomUUID();
    await db.execute('INSERT INTO chat_topics (id, thread_id, subject, created_by_user_id) VALUES (?, ?, ?, ?)', [id, threadId, String(subject || '').slice(0, 500) || null, userId]);
    if (rootId) await db.execute('UPDATE chat_messages SET topic_id = ? WHERE thread_id = ? AND (id = ? OR parent_message_id = ?) AND topic_id IS NULL', [id, threadId, rootId, rootId]);
    await db.commit();
    return id;
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function findExistingTopicThread({ userId, otherUserId, topicId, legacyRootMessageId, threadId }) {
  if (!topicId && !legacyRootMessageId && !threadId) return null;
  const table = topicId ? 'chat_topics' : legacyRootMessageId ? 'chat_messages' : 'chat_threads';
  const column = table === 'chat_threads' ? 'id' : 'thread_id';
  const [rows] = await pool.execute(`SELECT target.${column} AS thread_id FROM ${table} target
    JOIN chat_threads t ON t.id = target.${column}
    JOIN chat_thread_participants me ON me.thread_id = t.id AND me.user_id = ?
    JOIN chat_thread_participants other ON other.thread_id = t.id AND other.user_id = ?
    WHERE target.id = ? AND t.thread_type = 'direct' LIMIT 1`, [userId, otherUserId, topicId || legacyRootMessageId || threadId]);
  if (!rows.length) throw Object.assign(new Error('Chat topic not found for this recipient'), { status: 404 });
  return Number(rows[0].thread_id);
}
