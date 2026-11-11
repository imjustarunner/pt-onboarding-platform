import pool from '../config/database.js';
import { clientSecureAudience, ensureClientSecureConversation } from './clientSecureConversation.service.js';

export async function sharedChildParticipants(clientId, agencyId, db = pool) {
  const { client, participants } = await clientSecureAudience(clientId, db,{agencyId});
  if (Number(client.agency_id) !== Number(agencyId)) throw Object.assign(new Error('Client access denied'), { status: 403 });
  return { client, participants };
}

// Compatibility for guardian portal callers: one secure conversation per client.
export async function ensureSharedChildThread({ clientId, agencyId, userId, serviceId }) {
  const { familySharedConversations } = await import('./familySharedConversations.service.js');
  const conversation = await familySharedConversations.open({clientId,agencyId,serviceId,userId});
  return { ...conversation, shared: true };
}

export async function assertSharedChildThreadAccess(userId, threadId) {
 const {familySharedConversations}=await import('./familySharedConversations.service.js');
 const shared=await familySharedConversations.requireAccess(userId,threadId);
 if(shared)return shared;
  const {assertDependentThreadAccess}=await import('./dependentPortalMessages.service.js');
  const personal=await assertDependentThreadAccess(userId,threadId);if(personal)return personal;
  const [[thread]] = await pool.execute('SELECT client_id, agency_id,service_enrollment_id FROM chat_threads WHERE id = ?', [threadId]);
  if (!thread?.client_id) return null;
  const {refreshClientSecureAccess}=await import('./clientSecureConversation.service.js');
  await refreshClientSecureAccess(threadId,userId);
  return thread;
}

export async function assertSharedGuardianSend(userId, threadId, {expectedRecipientUserIds}={}) {
  const {familySharedConversations,assertReviewedFamilyRecipients}=await import('./familySharedConversations.service.js');
  const shared=await familySharedConversations.requireAccess(userId,threadId,{forSend:true});
  if(shared){
    assertReviewedFamilyRecipients({shared,userId,expectedRecipientUserIds});
    const {requireSharedFamilyAck}=await import('./sharedFamilyNotice.service.js');
    await requireSharedFamilyAck({userId,agencyId:shared.agencyId});
    return shared;
  }
  const [[family]] = await pool.execute(`SELECT p.user_id FROM chat_thread_participants p JOIN users u ON u.id = p.user_id
    WHERE p.thread_id = ? AND LOWER(u.role) IN ('client', 'client_guardian') LIMIT 1`, [threadId]);
  if (family) throw Object.assign(new Error('This earlier conversation is read-only. Open the client’s shared family conversation and review its current recipients before sending.'), { status: 409,code:'FAMILY_SHARED_THREAD_REQUIRED' });
}

export async function refreshSharedChildMemberships(userId) {
  const [rows] = await pool.execute(`SELECT t.id AS thread_id FROM chat_threads t
    JOIN chat_thread_participants p ON p.thread_id = t.id WHERE p.user_id = ? AND t.client_id IS NOT NULL`, [userId]);
  for (const row of rows) {
    try { await assertSharedChildThreadAccess(userId, row.thread_id); }
    catch (error) { if (error.status !== 403) throw error; }
  }
}
