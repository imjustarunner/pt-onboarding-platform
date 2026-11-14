import pool from '../config/database.js';
import { familyMessageVisibilitySql, assertCanReadFamilySecureMessage } from './familySecureMessageAccess.service.js';
import { refreshClientSecureAccess } from './clientSecureConversation.service.js';

export function normalizeSecureMessageSubject(value) {
  if (typeof value !== 'string' || /[\r\n\u0000]/u.test(value) || !value.trim() || Array.from(value.trim()).length > 200) {
    throw Object.assign(new Error('Subject must contain 1–200 characters on one line'), { status: 400, code: 'SECURE_MESSAGE_SUBJECT_INVALID' });
  }
  return value.trim();
}

/** Resolve a reply against its existing authorized topic, never a new thread. */
export async function resolveSecureSubjectReply({ userId, recipientUserId, agencyId, clientId, parentMessageId = null, topicId = null }, db = pool) {
  if (parentMessageId == null && !topicId) return null;
  const ids = [userId, recipientUserId, agencyId, clientId].map(Number);
  const parentId = parentMessageId == null ? null : Number(parentMessageId);
  if (ids.some(id => !Number.isSafeInteger(id) || id <= 0) || (parentId != null && (!Number.isSafeInteger(parentId) || parentId <= 0)) ||
      (topicId != null && (typeof topicId !== 'string' || topicId.length > 64))) {
    throw Object.assign(new Error('Invalid secure subject context'), { status: 400 });
  }
  const [uid, recipient, aid, cid] = ids;
  const [messages] = await db.execute(`SELECT m.id,m.thread_id,m.parent_message_id,m.topic_id
    FROM chat_messages m JOIN chat_threads t ON t.id=m.thread_id
    JOIN chat_thread_participants me ON me.thread_id=t.id AND me.user_id=?
    JOIN chat_thread_participants other ON other.thread_id=t.id AND other.user_id=?
    WHERE t.message_channel='secure' AND t.agency_id=?
      AND (t.client_id=? OR (t.client_id IS NULL AND EXISTS(SELECT 1 FROM client_secure_message_records child_record WHERE child_record.message_id=m.id AND child_record.client_id=?)))
      AND ${parentId != null ? 'm.id=?' : 'm.topic_id=? AND m.parent_message_id IS NULL'}
      AND ${familyMessageVisibilitySql(uid)}
      AND NOT EXISTS(SELECT 1 FROM chat_message_deletes hidden WHERE hidden.message_id=m.id AND hidden.user_id=?)
    ORDER BY m.id ASC LIMIT 1`, [uid, recipient, aid, cid, cid, parentId ?? topicId, uid]);
  if (!messages.length) throw Object.assign(new Error('Secure subject not found for this client and recipient'), { status: 404 });
  const message = messages[0], threadId = Number(message.thread_id), rootMessageId = Number(message.parent_message_id || message.id);
  await refreshClientSecureAccess(threadId, uid);
  await assertCanReadFamilySecureMessage({ userId: uid, messageId: rootMessageId, threadId }, db);
  return { threadId, rootMessageId, topicId: message.topic_id || null };
}
