import pool from '../config/database.js';
import { resolveClientRecordAccess } from '../services/clientRecordAccess.service.js';
import { decryptChatText } from '../services/chatEncryption.service.js';
import { recordSecureMessageEvent } from '../services/secureMessageBoundary.service.js';

async function requireRecordAccess(req) {
  if (!['admin', 'super_admin', 'support', 'staff', 'provider', 'provider_plus', 'intern', 'intern_plus', 'supervisor', 'clinical_practice_assistant'].includes(req.user?.role)) {
    throw Object.assign(new Error('Clinical record access is required'), { status: 403 });
  }
  const access = await resolveClientRecordAccess({ userId: req.user.id, role: req.user.role, clientId: req.params.id });
  if (!access.ok) throw Object.assign(new Error(access.message), { status: access.status });
  return access.client;
}

export async function listClientSecureMessages(req, res, next) {
  try {
    await requireRecordAccess(req);
    const before = Number(req.query.beforeId) || 2147483647;
    const [records] = await pool.execute(
      `SELECT r.id, r.message_id, r.thread_id, r.sender_user_id, m.created_at,
        CONCAT_WS(' ', u.first_name, u.last_name) AS sender_name
       FROM client_secure_message_records r JOIN chat_messages m ON m.id = r.message_id
       LEFT JOIN users u ON u.id = r.sender_user_id
       WHERE r.client_id = ? AND r.id < ? ORDER BY r.id DESC LIMIT 50`, [req.params.id, before]);
    res.set('Cache-Control', 'no-store');
    res.json({ records, hasMore: records.length === 50 });
  } catch (e) { next(e); }
}

export async function getClientSecureMessage(req, res, next) {
  try {
    const client = await requireRecordAccess(req);
    const [rows] = await pool.execute(
      `SELECT m.*, r.client_id, r.audience_json, CONCAT_WS(' ', u.first_name, u.last_name) AS sender_name
       FROM client_secure_message_records r JOIN chat_messages m ON m.id = r.message_id
       LEFT JOIN users u ON u.id = m.sender_user_id WHERE r.client_id = ? AND r.message_id = ? LIMIT 1`,
      [client.id, req.params.messageId]);
    if (!rows.length) return res.status(404).json({ error: { message: 'Secure message record not found' } });
    const message = rows[0];
    const body = message.body_ciphertext ? decryptChatText({ ciphertextB64: message.body_ciphertext, ivB64: message.body_iv,
      authTagB64: message.body_auth_tag, keyId: message.encryption_key_id }) : message.body || '';
    await recordSecureMessageEvent({ agencyId: client.agency_id, threadId: message.thread_id, messageId: message.id,
      userId: req.user.id, eventType: 'medical_record_opened', req });
    const audience = typeof message.audience_json === 'string' ? JSON.parse(message.audience_json) : message.audience_json || [];
    const recipients = audience.filter(p => Number(p.id) !== Number(message.sender_user_id));
    const [events] = await pool.execute(
      `SELECT e.id, e.event_type, e.created_at, CONCAT_WS(' ', u.first_name, u.last_name) AS actor_name
       FROM secure_message_events e LEFT JOIN users u ON u.id = e.actor_user_id
       WHERE e.message_id = ? ORDER BY e.id DESC LIMIT 100`, [message.id]);
    const [attachments] = await pool.execute('SELECT id, original_filename, byte_size FROM chat_message_attachments WHERE message_id = ?', [message.id]);
    res.set('Cache-Control', 'no-store');
    res.json({ message: { id: message.id, threadId: message.thread_id, body, subject: message.subject,
      createdAt: message.created_at, senderName: message.sender_name, recipients, attachments: attachments.map(a => ({ ...a, downloadPath: `/chat/attachments/${a.id}` })) }, events });
  } catch (e) { next(e); }
}
