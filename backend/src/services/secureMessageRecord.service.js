import pool from '../config/database.js';

export async function resolveSecureMessageClient({ agencyId, threadId, clientId = null }) {
  const [threads] = await pool.execute("SELECT t.client_id,d.client_id AS personal_client_id FROM chat_threads t LEFT JOIN dependent_portal_threads d ON d.thread_id=t.id WHERE t.id = ? AND t.agency_id = ? AND t.message_channel = 'secure'", [threadId, agencyId]);
  const recordedClient = threads[0]?.personal_client_id || threads[0]?.client_id;
  if (recordedClient) {
    if (clientId && Number(clientId) !== Number(recordedClient)) throw Object.assign(new Error('This message belongs to another client record'), { status: 400 });
    return Number(recordedClient);
  }
  const [participants] = await pool.execute(
    `SELECT u.id, u.role FROM chat_thread_participants p JOIN users u ON u.id = p.user_id WHERE p.thread_id = ?`, [threadId]);
  const hasClientParticipant = participants.some((p) => ['client', 'client_guardian'].includes(String(p.role).toLowerCase()));
  if (!hasClientParticipant && !clientId) return null;
  const [clients] = await pool.execute(
    `SELECT DISTINCT c.id FROM clients c JOIN chat_thread_participants p ON p.thread_id = ?
     WHERE c.agency_id = ? AND (c.user_id = p.user_id OR EXISTS (
       SELECT 1 FROM client_guardians cg WHERE cg.client_id = c.id AND cg.guardian_user_id = p.user_id AND cg.access_enabled = 1))`,
    [threadId, agencyId]);
  const ids = [...new Set(clients.map((c) => Number(c.id)))];
  if (clientId && ids.includes(Number(clientId))) return Number(clientId);
  if (!clientId && ids.length === 1) return ids[0];
  throw Object.assign(new Error(clientId ? 'This client does not belong to the secure conversation' : 'Select the client for this secure message so it can be saved in the correct record'), { status: 400 });
}

export async function recordSecureMessageInChart({ agencyId, clientId, threadId, messageId, senderUserId, executor = pool }) {
  if (!clientId) return;
  const [audience] = await executor.execute("SELECT u.id, CONCAT_WS(' ', u.first_name, u.last_name) AS name FROM chat_thread_participants p JOIN users u ON u.id = p.user_id WHERE p.thread_id = ?", [threadId]);
  await executor.execute(
    `INSERT INTO client_secure_message_records (agency_id, client_id, thread_id, message_id, sender_user_id, audience_json)
     VALUES (?, ?, ?, ?, ?, ?)`, [agencyId, clientId, threadId, messageId, senderUserId, JSON.stringify(audience)]);
}
