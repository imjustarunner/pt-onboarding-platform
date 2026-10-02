import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';

const fail = (message, status = 403) => Object.assign(new Error(message), { status });

export async function sharedChildParticipants(clientId, agencyId, db = pool) {
  const [[client]] = await db.execute('SELECT id, agency_id, organization_id, client_type, guardian_portal_enabled, provider_id, full_name, initials FROM clients WHERE id=? AND agency_id=?', [clientId, agencyId]);
  if (!client) throw fail('Child not found', 404);
  const [guardians] = await db.execute(`SELECT cg.*, u.first_name, u.last_name FROM client_guardians cg JOIN users u ON u.id=cg.guardian_user_id WHERE cg.client_id=? AND cg.access_enabled=1 AND LOWER(u.status) IN ('active','active_employee')`, [clientId]);
  const participants = [];
  for (const guardian of guardians) {
    if (!client.guardian_portal_enabled || ClientGuardian.isNoView(guardian.permissions_json)) continue;
    if (ClientGuardian.parsePermissions(guardian.permissions_json)?.canMessage === false) continue;
    if (['clinical', 'mental_health'].includes(client.client_type)) {
      const access = await clinicalAccess({ agencyId, clientId, userId: guardian.guardian_user_id }, db);
      if (!access.scopes.includes('clinical_messages')) continue;
    }
    participants.push({ id: Number(guardian.guardian_user_id), name: [guardian.first_name, guardian.last_name].filter(Boolean).join(' '), role: 'guardian' });
  }
  const [providers] = await db.execute(`SELECT DISTINCT u.id,u.first_name,u.last_name FROM users u WHERE LOWER(u.status) IN ('active','active_employee') AND (u.id=? OR u.id IN (SELECT provider_user_id FROM client_provider_assignments WHERE client_id=? AND is_active=1))`, [client.provider_id || null, clientId]);
  for (const provider of providers) participants.push({ id: Number(provider.id), name: [provider.first_name, provider.last_name].filter(Boolean).join(' '), role: 'provider' });
  return { client, participants: [...new Map(participants.map(p => [p.id, p])).values()] };
}

async function syncParticipants(threadId, participants, db) {
  const ids = participants.map(p => p.id);
  // Remove access, never message history, when a relationship or grant ends.
  await db.execute(`DELETE FROM chat_thread_participants WHERE thread_id=?${ids.length ? ` AND user_id NOT IN (${ids.map(() => '?').join(',')})` : ''}`, [threadId, ...ids]);
  for (const id of ids) await db.execute('INSERT IGNORE INTO chat_thread_participants (thread_id,user_id) VALUES (?,?)', [threadId, id]);
}

export async function ensureSharedChildThread({ clientId, agencyId, userId }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    const [[locked]] = await db.execute('SELECT id FROM clients WHERE id=? AND agency_id=? FOR UPDATE', [clientId, agencyId]);
    if (!locked) throw fail('Child not found', 404);
    const { client, participants } = await sharedChildParticipants(clientId, agencyId, db);
    if (!participants.some(p => p.id === Number(userId))) throw fail('You do not have permission to message about this child.');
    if (!participants.some(p => p.role === 'provider')) throw fail('No assigned provider for this child yet', 409);
    const [[mapped]] = await db.execute('SELECT thread_id FROM guardian_client_threads WHERE client_id=? AND agency_id=?', [clientId, agencyId]);
    let threadId = mapped?.thread_id;
    if (!threadId) {
      const [created] = await db.execute("INSERT INTO chat_threads (agency_id,organization_id,thread_type,name) VALUES (?,?,'group',?)", [agencyId, client.organization_id || null, `Shared care · ${String(client.full_name || client.initials || `Client ${clientId}`).slice(0,100)}`]);
      threadId = created.insertId;
      await db.execute('INSERT INTO guardian_client_threads (client_id,agency_id,thread_id) VALUES (?,?,?)', [clientId, agencyId, threadId]);
    }
    await syncParticipants(threadId, participants, db);
    await db.commit();
    return { threadId, participants, shared: true };
  } catch (error) { await db.rollback(); throw error; } finally { db.release(); }
}

export async function assertSharedChildThreadAccess(userId, threadId) {
  const [[mapped]] = await pool.execute('SELECT client_id,agency_id FROM guardian_client_threads WHERE thread_id=?', [threadId]);
  if (!mapped) return null;
  const { participants } = await sharedChildParticipants(mapped.client_id, mapped.agency_id);
  await syncParticipants(threadId, participants, pool);
  if (!participants.some(p => p.id === Number(userId))) throw fail('Your access to this child’s shared conversation has changed.');
  return mapped;
}

export async function assertSharedGuardianSend(userId, threadId) {
  if (await assertSharedChildThreadAccess(userId, threadId)) return;
  const [[privateGuardian]] = await pool.execute(`SELECT t.id FROM chat_threads t JOIN chat_thread_participants p ON p.thread_id=t.id JOIN client_guardians cg ON cg.guardian_user_id=p.user_id AND cg.relationship_type='guardian' AND cg.access_enabled=1 JOIN clients c ON c.id=cg.client_id AND c.agency_id=t.agency_id WHERE t.id=? AND t.thread_type='direct' AND EXISTS (SELECT 1 FROM chat_thread_participants provider WHERE provider.thread_id=t.id AND (provider.user_id=c.provider_id OR provider.user_id IN (SELECT provider_user_id FROM client_provider_assignments WHERE client_id=c.id AND is_active=1))) LIMIT 1`, [threadId]);
  if (privateGuardian) throw fail('Messages about a child must use their shared care conversation. Open the child’s conversation in the guardian portal.', 409);
}

/** Refresh only mapped care conversations before any inbox preview is returned. */
export async function refreshSharedChildMemberships(userId) {
  const [rows] = await pool.execute(`SELECT g.thread_id FROM guardian_client_threads g JOIN chat_thread_participants p ON p.thread_id=g.thread_id WHERE p.user_id=?`, [userId]);
  for (const row of rows) {
    try { await assertSharedChildThreadAccess(userId, row.thread_id); }
    catch (error) { if (error.status !== 403) throw error; }
  }
}
