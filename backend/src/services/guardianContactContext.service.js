import { latestIntakeCommunicationChoices } from './intakeCommunicationChoices.service.js';
import pool from '../config/database.js';
import { hubClientScope, canAccessHubClient } from './hubPeopleAccess.service.js';
import { emailClientCandidates } from './clientConversationRecord.service.js';

export async function guardianContactContext({ userId, guardianId }) {
  if (!Number.isSafeInteger(Number(guardianId)) || Number(guardianId)<1) throw Object.assign(new Error('Guardian not found'),{status:404});
  const scope=hubClientScope(userId);
  const [rows]=await pool.execute(`SELECT c.id,c.agency_id,a.name AS agency_name,a.slug AS agency_slug,
    COALESCE(c.full_name,c.initials) AS name,cg.relationship_title,u.id AS guardian_id,u.first_name,u.last_name,
    COALESCE(NULLIF(u.personal_email,''),u.email) AS email
    FROM client_guardians cg JOIN clients c ON c.id=cg.client_id JOIN users u ON u.id=cg.guardian_user_id
    JOIN agencies a ON a.id=c.agency_id
    WHERE cg.guardian_user_id=? AND cg.relationship_type<>'self' AND ${scope.sql}
    ORDER BY a.name,c.full_name,c.initials,c.id`,[guardianId,...scope.params]);
  if(!rows.length)throw Object.assign(new Error('Guardian not found'),{status:404});
  const first=rows[0];
  const preferences = new Map();
  for (const row of rows) {
    const cp = await latestIntakeCommunicationChoices(row.id,row.agency_id,guardianId);
    preferences.set(Number(row.id), cp ? { noRoutineCalls: cp.noRoutineCalls === true, noAutomaticEmail: cp.noAutomaticEmail === true,
      alternativeContactInstructions: cp.alternativeContactInstructions || null } : null);
  }
  return {guardian:{id:Number(first.guardian_id),name:[first.first_name,first.last_name].filter(Boolean).join(' '),email:first.email},
    clients:rows.map(r=>({id:Number(r.id),name:r.name,agencyId:Number(r.agency_id),agencyName:r.agency_name,agencySlug:r.agency_slug,relationship:r.relationship_title,contactPreferences:preferences.get(Number(r.id))}))};
}

export async function emailFilingOptions({userId,agencyId,to='',cc='',bcc=''}) {
  if(!Number.isSafeInteger(Number(agencyId)) || Number(agencyId)<1)throw Object.assign(new Error('Choose an agency'),{status:400});
  const addresses=[to,cc,bcc].flatMap(v=>String(v).split(/[,;]/)).map(v=>v.trim()).filter(Boolean);
  if(addresses.length>100)throw Object.assign(new Error('Too many recipients'),{status:400});
  const candidates=await emailClientCandidates(Number(agencyId),addresses);
  const clients=[];
  for(const c of candidates)if(await canAccessHubClient({userId,clientId:c.id,agencyId:Number(agencyId)}))clients.push({id:Number(c.id),name:c.full_name||c.initials});
  return {clients};
}

export async function guardianVoicemailConversations({ user, guardianId }) {
  const context = await guardianContactContext({ userId: user.id, guardianId });
  const agencyIds = [...new Set(context.clients.map(c => c.agencyId))];
  const [threads] = await pool.execute(`SELECT c.id,c.subject,c.last_message_at FROM communication_conversations c
    JOIN communication_links l ON l.conversation_id=c.id AND l.entity_type='guardian' AND l.entity_id=?
    WHERE c.agency_id IN (${agencyIds.map(() => '?').join(',')}) ORDER BY c.last_message_at DESC LIMIT 100`, [guardianId,...agencyIds]);
  const { requireConversationAccess } = await import('./communicationAccess.service.js');
  const conversations = [];
  for (const thread of threads) {
    try { await requireConversationAccess(user,thread.id); conversations.push(thread); }
    catch (e) { if (![403,404].includes(e.status)) throw e; }
  }
  return { conversations };
}
