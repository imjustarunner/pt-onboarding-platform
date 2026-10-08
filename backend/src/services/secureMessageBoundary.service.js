import crypto from 'node:crypto';
import pool from '../config/database.js';

export async function defaultChatChannel(userIds) {
  const ids = [...new Set(userIds.map(Number).filter(Boolean))];
  if (!ids.length) return 'internal';
  const [rows] = await pool.execute(
    `SELECT 1 FROM users WHERE id IN (${ids.map(() => '?').join(',')})
     AND LOWER(role) IN ('client', 'client_guardian', 'school_staff') LIMIT 1`, ids
  );
  return rows.length ? 'secure' : 'internal';
}

export async function assertChatChannel(threadId, channel) {
  const [rows] = await pool.execute('SELECT message_channel FROM chat_threads WHERE id = ?', [threadId]);
  if (!rows.length || rows[0].message_channel !== channel) {
    throw Object.assign(new Error('This conversation belongs to a different message channel. Start a new conversation in the selected channel.'), { status: 409 });
  }
}

// Never include message text, subject, attachments, claim tokens or email addresses.
export async function recordSecureMessageEvent({ agencyId, threadId = null, messageId = null, notificationId = null, userId = null, eventType, req = null, executor = pool }) {
  const ip = req?.ip;
  await executor.execute(
    `INSERT INTO secure_message_events
     (agency_id, thread_id, message_id, notification_id, actor_user_id, event_type, ip_hash, user_agent)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [agencyId, threadId, messageId, notificationId, userId, eventType,
      ip ? crypto.createHash('sha256').update(String(ip)).digest('hex') : null,
      req?.headers?.['user-agent'] ? String(req.headers['user-agent']).slice(0, 512) : null]
  );
}

export async function recordSecureThreadOpen({ threadId, userId, messageIds = [], req = null }) {
  const [rows] = await pool.execute(
    `SELECT t.agency_id, t.message_channel FROM chat_threads t
     JOIN chat_thread_participants p ON p.thread_id = t.id AND p.user_id = ? WHERE t.id = ?`,
    [userId, threadId]
  );
  if (!rows.length) throw Object.assign(new Error('Conversation not found'), { status: 404 });
  if (rows[0].message_channel !== 'secure') return 'internal';
  const ids = [...new Set(messageIds.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0))];
  for (const messageId of ids) {
    await recordSecureMessageEvent({ agencyId: rows[0].agency_id, threadId, messageId, userId, eventType: 'message_opened', req });
  }
  if (!ids.length) return 'secure';
  // An anonymous email-link click or a sender viewing their own message is not a recipient read.
  await pool.execute(
    `UPDATE secure_message_notifications SET first_read_at = COALESCE(first_read_at, NOW()),
       first_read_via = COALESCE(first_read_via, 'authenticated_portal')
     WHERE chat_thread_id = ? AND recipient_user_id = ? AND message_id IN (${ids.map(() => '?').join(',')})`,
    [threadId, userId, ...ids]
  );
  return 'secure';
}

export function protectSecurePreview(item, channel) {
  if (item.channel !== 'secure' || channel === 'secure') return item;
  return { ...item, bodyPreview: 'Secure message — open to read', subject: 'Secure message',
    attachments: [], reactions: [], meta: { ...item.meta, subject: 'Secure message', secureContentHidden: true } };
}
