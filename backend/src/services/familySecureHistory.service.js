import pool from '../config/database.js';
import { familyMessageVisibilitySql } from './familySecureMessageAccess.service.js';
import { refreshClientSecureAccess } from './clientSecureConversation.service.js';
import { familySharedConversations } from './familySharedConversations.service.js';
import { guardianContactRows, sharedGuardianContact } from './guardianContactSharing.service.js';

/** Return existing, addressed history only. Never adds a thread participant. */
export async function listFamilySecureHistory({ userId, clientId, agencyId, serviceId = null, excludeThreadId = null }, db = pool, {refresh=refreshClientSecureAccess,shared=familySharedConversations,contacts:readContacts=guardianContactRows} = {}) {
  const values = [userId, clientId, clientId, clientId, clientId, agencyId];
  const [rows] = await db.execute(`SELECT DISTINCT t.id,t.agency_id,t.organization_id,
      COALESCE(shared.service_id,personal.service_id,t.service_enrollment_id) AS service_id,
      MAX(m.created_at) AS last_message_at
    FROM chat_threads t
    JOIN chat_thread_participants member ON member.thread_id=t.id AND member.user_id=?
    LEFT JOIN family_shared_conversations shared ON shared.thread_id=t.id
    LEFT JOIN dependent_portal_threads personal ON personal.thread_id=t.id
    JOIN chat_messages m ON m.thread_id=t.id
    WHERE (t.client_id=? OR shared.client_id=? OR personal.client_id=? OR EXISTS(SELECT 1 FROM client_secure_message_records client_record WHERE client_record.thread_id=t.id AND client_record.client_id=?)) AND t.agency_id=?
      AND t.message_channel='secure' AND ${familyMessageVisibilitySql(userId)}
      AND NOT EXISTS(SELECT 1 FROM client_secure_message_records other_child WHERE other_child.message_id=m.id AND other_child.client_id<>${Number(clientId)})
      AND NOT EXISTS(SELECT 1 FROM chat_message_deletes hidden WHERE hidden.message_id=m.id AND hidden.user_id=${Number(userId)})
      ${excludeThreadId ? 'AND t.id<>?' : ''}
      ${serviceId != null ? 'AND COALESCE(shared.service_id,personal.service_id,t.service_enrollment_id) IN(0,?)' : ''}
    GROUP BY t.id,t.agency_id,t.organization_id,COALESCE(shared.service_id,personal.service_id,t.service_enrollment_id)
    ORDER BY last_message_at DESC,t.id DESC`, [...values, ...(excludeThreadId ? [excludeThreadId] : []), ...(serviceId != null ? [serviceId] : [])]);
  const result = [];
  const contacts = await readContacts(clientId, db);
  const own = contacts.find(p => Number(p.id) === Number(userId));
  for (const row of rows) {
    try {
      await refresh(row.id, userId);
      const mapped = await shared.requireAccess(userId, row.id, { db });
      let participants = mapped?.participants;
      if (!participants) {
        const [members] = await db.execute(`SELECT u.id,u.role,u.first_name,u.last_name
          FROM chat_thread_participants p JOIN users u ON u.id=p.user_id WHERE p.thread_id=?`, [row.id]);
        participants = members.map(person => {
          const contact = contacts.find(p => Number(p.id) === Number(person.id));
          const visible = contact && sharedGuardianContact(contact, userId, own?.permissions_json);
          return { id: Number(person.id), name: visible ? visible.hiddenFields.includes('name') ? 'Guardian (name private)' : visible.name
            : ['client','client_guardian'].includes(person.role) ? 'Family portal user' : [person.first_name,person.last_name].filter(Boolean).join(' '),
            role: ['client','client_guardian'].includes(person.role) ? contact?.relationship_type === 'self' ? 'client' : 'guardian' : 'provider' };
        });
      }
      result.push({ threadId: Number(row.id), thread_id: Number(row.id), client_id: Number(clientId), agency_id: Number(row.agency_id),
        organization_id: row.organization_id, service_id: Number(row.service_id) || null, last_message_at: row.last_message_at,
        participants, shared: true, available: true, readOnly: true, service_label: 'Previous secure conversation' });
    } catch (error) { if (![403,404,409].includes(error.status)) throw error; }
  }
  return result;
}
