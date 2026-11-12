import pool from '../config/database.js';
import { guardianContactRows, sharedGuardianContact } from './guardianContactSharing.service.js';
import {clientAgencyMembership,listClientServices} from './clientServiceEnrollment.service.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { clinicalAccess } from './guardianClinicalAccess.service.js';
import {guardianServiceAllowed} from '../utils/guardianServiceRestrictions.js';

// A family account can have several children. Never guess between their records.
export async function resolveClientForSecureRecipients({ agencyId, actorUserId, recipientUserId, clientId = null }) {
  if (clientId) return Number(clientId);
  const [family] = await pool.execute("SELECT id FROM users WHERE id IN (?, ?) AND LOWER(role) IN ('client', 'client_guardian')", [actorUserId, recipientUserId]);
  if (!family.length) return null;
  const ids = family.map((u) => Number(u.id));
  const [clients] = await pool.execute(
    `SELECT DISTINCT c.id FROM clients c LEFT JOIN client_guardians cg ON cg.client_id = c.id AND cg.access_enabled = 1
     WHERE c.agency_id = ? AND cg.guardian_user_id IN (${ids.map(() => '?').join(',')})`, [agencyId, ...ids]);
  if (clients.length !== 1) throw Object.assign(new Error('Select the client to open the correct shared secure conversation'), { status: 400 });
  return Number(clients[0].id);
}

export async function clientSecureAudience(clientId, db = pool, context = {}) {
  const [clients] = await db.execute('SELECT id, agency_id, organization_id, provider_id, client_type, guardian_portal_enabled FROM clients WHERE id = ?', [clientId]);
  const client = clients[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  const agencyId=Number(context.agencyId||client.agency_id);
  if(agencyId!==Number(client.agency_id)&&!await clientAgencyMembership(clientId,agencyId,db))throw Object.assign(new Error('Client is not enrolled with this agency'),{status:403});
  const service=context.serviceId?(await listClientServices(clientId,agencyId,db)).find(e=>Number(e.id)===Number(context.serviceId)&&e.is_active):null;
  if(context.serviceId&&!service)throw Object.assign(new Error('Service conversation is no longer active'),{status:403});
  const owningAgency=Number(client.agency_id);client.agency_id=agencyId;
  if(service)client.client_type=service.service_kind==='tutoring'?'learning':'clinical';
  else if((await listClientServices(clientId,agencyId,db)).some(s=>s.is_active&&s.service_kind==='counseling'))client.client_type='clinical';
  const [links] = await db.execute(
    `SELECT cg.guardian_user_id, cg.relationship_type, cg.permissions_json, u.first_name, u.last_name
     FROM client_guardians cg JOIN users u ON u.id = cg.guardian_user_id
     WHERE cg.client_id = ? AND cg.access_enabled = 1 AND LOWER(u.status) IN ('active', 'active_employee','ehr_only')
       AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())`, [clientId]);
  const participants = [];
  for (const link of links) {
    const permissions = ClientGuardian.parsePermissions(link.permissions_json);
    if (permissions?.dependentSelfAccess) continue; // Personal conversations never inherit family history.
    if (!client.guardian_portal_enabled || ClientGuardian.isNoView(permissions) || permissions?.canMessage === false) continue;
    if (!guardianServiceAllowed({...link,agency_id:owningAgency},service||{agency_id:agencyId})) continue;
    if (['clinical', 'mental_health', 'school'].includes(String(client.client_type).toLowerCase())) {
      const access = await clinicalAccess({ agencyId: client.agency_id, clientId, userId: link.guardian_user_id }, db);
      if (!access.scopes.includes('clinical_messages')) continue;
    }
    participants.push({ id: Number(link.guardian_user_id), name: [link.first_name, link.last_name].filter(Boolean).join(' '), role: link.relationship_type === 'self' ? 'client' : 'guardian' });
  }
  const guardians = participants.filter(p => p.role === 'guardian').map(p => p.id);
  const [providers] = await db.execute(
    `SELECT DISTINCT u.id, u.first_name, u.last_name FROM users u
     WHERE LOWER(u.status) IN ('active', 'active_employee','ehr_only') AND u.is_active=1 AND COALESCE(u.is_archived,0)=0
       AND u.terminated_at IS NULL AND (u.status_expires_at IS NULL OR u.status_expires_at>UTC_TIMESTAMP())
       AND u.role IN ('provider','provider_plus','intern','intern_plus','clinician','therapist','supervisor','clinical_practice_assistant','admin','super_admin') AND
       ((u.id = ? AND NOT EXISTS(SELECT 1 FROM client_provider_assignments ended WHERE ended.client_id=? AND ended.provider_user_id=u.id))
        OR u.id IN (SELECT provider_user_id FROM client_provider_assignments WHERE client_id = ? AND is_active = 1))
       AND EXISTS (SELECT 1 FROM user_agencies ua WHERE ua.user_id=u.id AND ua.agency_id=? AND ua.is_active=1)
       AND (? IS NULL OR u.id=?)`, [service?.provider_user_id || (owningAgency===agencyId?client.provider_id:null),clientId,clientId,agencyId,service?Number(service.provider_user_id):null,service?Number(service.provider_user_id):null]);
  for (const provider of providers) participants.push({ id: Number(provider.id), name: [provider.first_name, provider.last_name].filter(Boolean).join(' '), role: 'provider' });
  const unique = [...new Map(participants.map(p => [p.id, p])).values()];
  return { client, guardians, participants: unique, userIds: unique.map(p => p.id) };
}

export async function ensureClientSecureConversation({ clientId, actorUserId, agencyId = null, serviceId = null }) {
  // New sends use a new immutable-audience thread. This gateway must never add
  // family members to an older private or differently addressed conversation.
  const { familySharedConversations } = await import('./familySharedConversations.service.js');
  if (!agencyId) {
    const [[client]] = await pool.execute('SELECT agency_id FROM clients WHERE id=?',[clientId]);
    agencyId = client?.agency_id;
  }
  return familySharedConversations.open({clientId,userId:actorUserId,agencyId,serviceId});
}

export async function refreshClientSecureAccess(threadId, actorUserId) {
  const {familySharedConversations}=await import('./familySharedConversations.service.js');
  if(await familySharedConversations.requireAccess(actorUserId,threadId))return;
  const {assertDependentThreadAccess}=await import('./dependentPortalMessages.service.js');
  if(await assertDependentThreadAccess(actorUserId,threadId))return;
  const [rows] = await pool.execute('SELECT client_id,agency_id,service_enrollment_id,message_channel FROM chat_threads WHERE id = ?', [threadId]);
  if (!rows[0]?.client_id) {
    if(rows[0]?.message_channel!=='secure')return;
    let [records]=await pool.execute('SELECT DISTINCT client_id,agency_id FROM client_secure_message_records WHERE thread_id=?',[threadId]);
    if(!records.length)[records]=await pool.execute('SELECT DISTINCT g.client_id,t.agency_id FROM guardian_client_threads g JOIN chat_threads t ON t.id=g.thread_id WHERE g.thread_id=?',[threadId]);
    if(!records.length){
      const [[family]]=await pool.execute("SELECT 1 FROM chat_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.thread_id=? AND u.role IN ('client','client_guardian') LIMIT 1",[threadId]);
      if(family)throw Object.assign(new Error('This historical secure conversation needs its original client context reviewed before it can be opened.'),{status:403});
      return;
    }
    const [[member]]=await pool.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[threadId,actorUserId]);
    if(!member)throw Object.assign(new Error('This historical conversation belongs to its recorded participants.'),{status:403});
    // Ambiguous multi-client legacy conversations require all recorded scopes;
    // no child is guessed and no new member is added to establish access.
    for(const context of records){
      const audience=await clientSecureAudience(context.client_id,pool,{agencyId:context.agency_id});
      if(!audience.userIds.includes(Number(actorUserId)))throw Object.assign(new Error('Current clinical access to this historical conversation is required.'),{status:403});
    }
    return;
  }
  // Historical conversations retain their original membership. Rechecking
  // rights must never add a newly linked parent to earlier message history.
  const audience=await clientSecureAudience(rows[0].client_id,pool,{agencyId:rows[0].agency_id,serviceId:rows[0].service_enrollment_id});
  const [[member]]=await pool.execute('SELECT user_id FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[threadId,actorUserId]);
  if(!member||!audience.userIds.includes(Number(actorUserId)))throw Object.assign(new Error('Your access to this historical secure conversation has changed.'),{status:403});
  if(audience.userIds.length)await pool.execute(`DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id NOT IN (${audience.userIds.map(()=>'?').join(',')})`,[threadId,...audience.userIds]);
}
