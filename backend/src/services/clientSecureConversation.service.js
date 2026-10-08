import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';

// A family account can have several children. Never guess between their records.
export async function resolveClientForSecureRecipients({ agencyId, actorUserId, recipientUserId, clientId = null }) {
  if (clientId) return Number(clientId);
  const [family] = await pool.execute("SELECT id FROM users WHERE id IN (?, ?) AND LOWER(role) IN ('client', 'client_guardian')", [actorUserId, recipientUserId]);
  if (!family.length) return null;
  const ids = family.map((u) => Number(u.id));
  const [clients] = await pool.execute(
    `SELECT DISTINCT c.id FROM clients c LEFT JOIN client_guardians cg ON cg.client_id = c.id AND cg.access_enabled = 1
     WHERE c.agency_id = ? AND (c.user_id IN (${ids.map(() => '?').join(',')}) OR cg.guardian_user_id IN (${ids.map(() => '?').join(',')}))`, [agencyId, ...ids, ...ids]);
  if (clients.length !== 1) throw Object.assign(new Error('Select the client to open the correct shared secure conversation'), { status: 400 });
  return Number(clients[0].id);
}

export async function clientSecureAudience(clientId, db = pool) {
  const [clients] = await db.execute('SELECT id, agency_id, organization_id, user_id, provider_id, client_type, guardian_portal_enabled FROM clients WHERE id = ?', [clientId]);
  const client = clients[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  const [links] = await db.execute(
    `SELECT cg.guardian_user_id, cg.permissions_json, u.first_name, u.last_name
     FROM client_guardians cg JOIN users u ON u.id = cg.guardian_user_id
     WHERE cg.client_id = ? AND cg.access_enabled = 1 AND LOWER(u.status) IN ('active', 'active_employee')`, [clientId]);
  const participants = [];
  for (const link of links) {
    const permissions = ClientGuardian.parsePermissions(link.permissions_json);
    if (!client.guardian_portal_enabled || ClientGuardian.isNoView(permissions) || permissions?.canMessage === false) continue;
    if (['clinical', 'mental_health'].includes(String(client.client_type).toLowerCase())) {
      const access = await clinicalAccess({ agencyId: client.agency_id, clientId, userId: link.guardian_user_id }, db);
      if (!access.scopes.includes('clinical_messages')) continue;
    }
    participants.push({ id: Number(link.guardian_user_id), name: [link.first_name, link.last_name].filter(Boolean).join(' '), role: 'guardian' });
  }
  const guardians = participants.map(p => p.id);
  const [providers] = await db.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name FROM users u
     WHERE LOWER(u.status) IN ('active', 'active_employee') AND
       (u.id = ? OR u.id IN (SELECT provider_user_id FROM client_provider_assignments WHERE client_id = ? AND is_active = 1))`, [client.provider_id || null, clientId]);
  for (const provider of providers) participants.push({ id: Number(provider.id), name: [provider.first_name, provider.last_name].filter(Boolean).join(' '), role: 'provider' });
  if (client.user_id) {
    const [selves] = await db.execute("SELECT id, first_name, last_name FROM users WHERE id = ? AND LOWER(status) IN ('active', 'active_employee')", [client.user_id]);
    for (const self of selves) participants.push({ id: Number(self.id), name: [self.first_name, self.last_name].filter(Boolean).join(' '), role: 'client' });
  }
  const unique = [...new Map(participants.map(p => [p.id, p])).values()];
  return { client, guardians, participants: unique, userIds: unique.map(p => p.id) };
}

export async function ensureClientSecureConversation({ clientId, actorUserId, agencyId = null }) {
  const db = await pool.getConnection();
  try {
    await db.beginTransaction();
    await db.execute('SELECT id FROM clients WHERE id = ? FOR UPDATE', [clientId]);
    const audience = await clientSecureAudience(clientId, db);
    if (agencyId && Number(agencyId) !== Number(audience.client.agency_id)) throw Object.assign(new Error('Client does not belong to this agency'), { status: 403 });
    let actorAllowed = audience.userIds.includes(Number(actorUserId));
    const { resolveClientRecordAccess } = await import('./clientRecordAccess.service.js');
    if (!actorAllowed) {
      const [actors] = await db.execute("SELECT role FROM users WHERE id = ? AND LOWER(status) IN ('active', 'active_employee')", [actorUserId]);
      const role = actors[0]?.role;
      if (['admin', 'super_admin', 'staff', 'support', 'clinical_practice_assistant', 'supervisor'].includes(role)) {
        const access = await resolveClientRecordAccess({ userId: actorUserId, role, clientId });
        if (access.ok) { audience.userIds.push(Number(actorUserId)); actorAllowed = true; }
      }
    }
    const [rows] = await db.execute("SELECT id FROM chat_threads WHERE client_id = ? AND thread_type = 'client_secure'", [clientId]);
    let threadId = rows[0]?.id;
    if (!threadId && !actorAllowed) throw Object.assign(new Error('Secure conversation access is not authorized'), { status: 403 });
    if (!threadId) {
      const [created] = await db.execute(
        "INSERT INTO chat_threads (agency_id, client_id, thread_type, message_channel) VALUES (?, ?, 'client_secure', 'secure')", [audience.client.agency_id, clientId]);
      threadId = created.insertId;
    }
    for (const userId of audience.userIds) await db.execute('INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES (?, ?)', [threadId, userId]);
    // Retain additional staff only while their current chart access remains authorized.
    const [existing] = await db.execute('SELECT p.user_id, u.role, u.status FROM chat_thread_participants p JOIN users u ON u.id = p.user_id WHERE p.thread_id = ?', [threadId]);
    for (const member of existing) {
      if (audience.userIds.includes(Number(member.user_id))) continue;
      if (['active', 'active_employee'].includes(String(member.status).toLowerCase()) && ['admin', 'super_admin', 'staff', 'support', 'clinical_practice_assistant', 'supervisor'].includes(member.role)) {
        const access = await resolveClientRecordAccess({ userId: member.user_id, role: member.role, clientId });
        if (access.ok) audience.userIds.push(Number(member.user_id));
      }
    }
    // Revoked relationships and assignments lose access. Reminder contacts are never participants.
    await db.execute(
      `DELETE FROM chat_thread_participants WHERE thread_id = ?
       ${audience.userIds.length ? `AND user_id NOT IN (${audience.userIds.map(() => '?').join(',')})` : ''}`, [threadId, ...audience.userIds]);
    await db.commit();
    if (!actorAllowed) throw Object.assign(new Error('Your access to this shared secure conversation has changed'), { status: 403 });
    return { threadId: Number(threadId), clientId: Number(clientId), agencyId: Number(audience.client.agency_id), audienceUserIds: audience.userIds, participants: audience.participants };
  } catch (e) { await db.rollback(); throw e; } finally { db.release(); }
}

export async function refreshClientSecureAccess(threadId, actorUserId) {
  const [rows] = await pool.execute('SELECT client_id FROM chat_threads WHERE id = ?', [threadId]);
  if (!rows[0]?.client_id) return;
  await ensureClientSecureConversation({ clientId: rows[0].client_id, actorUserId });
}
