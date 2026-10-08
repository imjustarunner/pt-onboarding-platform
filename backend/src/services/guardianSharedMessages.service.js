import pool from '../config/database.js';
import { clientSecureAudience, ensureClientSecureConversation } from './clientSecureConversation.service.js';

export async function sharedChildParticipants(clientId, agencyId, db = pool) {
  const { client, participants } = await clientSecureAudience(clientId, db);
  if (Number(client.agency_id) !== Number(agencyId)) throw Object.assign(new Error('Client access denied'), { status: 403 });
  return { client, participants };
}

// Compatibility for guardian portal callers: one secure conversation per client.
export async function ensureSharedChildThread({ clientId, agencyId, userId }) {
  const conversation = await ensureClientSecureConversation({ clientId, agencyId, actorUserId: userId });
  return { ...conversation, shared: true };
}

export async function assertSharedChildThreadAccess(userId, threadId) {
  const [[thread]] = await pool.execute('SELECT client_id, agency_id FROM chat_threads WHERE id = ?', [threadId]);
  if (!thread?.client_id) return null;
  await ensureClientSecureConversation({ clientId: thread.client_id, agencyId: thread.agency_id, actorUserId: userId });
  return thread;
}

export async function assertSharedGuardianSend(userId, threadId) {
  if (await assertSharedChildThreadAccess(userId, threadId)) return;
  const [[family]] = await pool.execute(`SELECT p.user_id FROM chat_thread_participants p JOIN users u ON u.id = p.user_id
    WHERE p.thread_id = ? AND LOWER(u.role) IN ('client', 'client_guardian') LIMIT 1`, [threadId]);
  if (family) throw Object.assign(new Error('Use the client’s shared secure conversation for client or guardian messages.'), { status: 409 });
}

export async function refreshSharedChildMemberships(userId) {
  const [rows] = await pool.execute(`SELECT t.id AS thread_id FROM chat_threads t
    JOIN chat_thread_participants p ON p.thread_id = t.id WHERE p.user_id = ? AND t.client_id IS NOT NULL`, [userId]);
  for (const row of rows) {
    try { await assertSharedChildThreadAccess(userId, row.thread_id); }
    catch (error) { if (error.status !== 403) throw error; }
  }
}
