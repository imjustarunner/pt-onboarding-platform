/**
 * Hub delayed/scheduled sends for secure, internal, and SMS (email uses communication_messages).
 */
import pool from '../config/database.js';

const MAX_DELAY_SECONDS = 600; // 10 minutes
export const DEFAULT_DELAY_SECONDS = 20;
export { MAX_DELAY_SECONDS };

export function clampSendDelaySeconds(raw, fallback = DEFAULT_DELAY_SECONDS) {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DELAY_SECONDS, Math.max(1, Math.round(n)));
}

export async function enqueueHubMessage({
  agencyId,
  userId,
  personKey,
  channel,
  body = null,
  subject = null,
  payload = null,
  scheduledSendAt,
  queueReason = 'undo_delay',
  relatedConversationId = null,
  relatedMessageId = null
} = {}) {
  const when = scheduledSendAt instanceof Date ? scheduledSendAt : new Date(scheduledSendAt);
  if (!agencyId || !userId || !personKey || !channel || Number.isNaN(when.getTime())) {
    const err = new Error('Invalid queue payload');
    err.status = 400;
    throw err;
  }
  const [result] = await pool.execute(
    `INSERT INTO hub_message_queue
      (agency_id, user_id, person_key, channel, body, subject, payload_json,
       scheduled_send_at, queue_reason, status, related_conversation_id, related_message_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
    [
      agencyId,
      userId,
      String(personKey),
      String(channel),
      body,
      subject,
      payload ? JSON.stringify(payload) : null,
      when,
      queueReason,
      relatedConversationId,
      relatedMessageId
    ]
  );
  return findHubQueueItem(result.insertId);
}

export async function findHubQueueItem(id) {
  const [rows] = await pool.execute(`SELECT * FROM hub_message_queue WHERE id = ? LIMIT 1`, [id]);
  return rows?.[0] || null;
}

export async function listHubQueuedMessages({ userId, agencyId = null, limit = 50 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 100);
  const params = [userId];
  let agencyClause = '';
  if (agencyId) {
    agencyClause = 'AND agency_id = ?';
    params.push(agencyId);
  }
  const [rows] = await pool.execute(
    `SELECT * FROM hub_message_queue
     WHERE user_id = ? AND status = 'queued' ${agencyClause}
     ORDER BY scheduled_send_at ASC, id ASC
     LIMIT ${lim}`,
    params
  );
  return rows || [];
}

export async function cancelHubQueuedMessage({ id, userId }) {
  const row = await findHubQueueItem(id);
  if (!row) {
    const err = new Error('Queued message not found');
    err.status = 404;
    throw err;
  }
  if (Number(row.user_id) !== Number(userId)) {
    const err = new Error('Access denied');
    err.status = 403;
    throw err;
  }
  if (row.status !== 'queued') {
    const err = new Error('Message is no longer queued');
    err.status = 400;
    throw err;
  }
  await pool.execute(
    `UPDATE hub_message_queue SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
  return {
    cancelled: true,
    id: Number(id),
    body: row.body || '',
    subject: row.subject || '',
    channel: row.channel,
    personKey: row.person_key,
    agencyId: row.agency_id,
    payload: row.payload_json
      ? typeof row.payload_json === 'string'
        ? JSON.parse(row.payload_json)
        : row.payload_json
      : null
  };
}

export async function listDueHubQueue({ limit = 40 } = {}) {
  const lim = Math.min(Math.max(Number(limit) || 40, 1), 100);
  const [rows] = await pool.execute(
    `SELECT * FROM hub_message_queue
     WHERE status = 'queued' AND scheduled_send_at <= NOW()
     ORDER BY scheduled_send_at ASC, id ASC
     LIMIT ${lim}`
  );
  return rows || [];
}

export async function markHubQueueSent(id) {
  await pool.execute(
    `UPDATE hub_message_queue SET status = 'sent', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [id]
  );
}

export async function markHubQueueFailed(id, message) {
  await pool.execute(
    `UPDATE hub_message_queue
     SET status = 'failed', error_message = ?, updated_at = CURRENT_TIMESTAMP
     WHERE id = ?`,
    [String(message || '').slice(0, 500), id]
  );
}
