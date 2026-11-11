import { EVENT_STAFF_ROLES_SQL } from '../utils/companyEventOperations.js';
import pool from '../config/database.js';
import { listCompanyEventInvitees, isCompanyEventInvitee, listEventManagedAgencies } from './companyEventAudience.service.js';
import { isEventCoordinator } from './companyEventOperations.service.js';

const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };

export async function canManageEventConversation(event, actor, db = pool) {
  if (actor?.role === 'super_admin') return true;
  if ((await listEventManagedAgencies(actor, db)).some(agency => agency.id === Number(event.agency_id))) return true;
  return isEventCoordinator({ userId: actor?.id, agencyId: event.agency_id, eventId: event.id });
}

// One durable, named group DM per event. Lock the event so concurrent opens do
// not create duplicate conversations. Membership always follows the invitation.
export async function syncCompanyEventConversation({ eventId, create = false, db = pool }) {
  const conn = await db.getConnection();
  try {
    await conn.beginTransaction();
    const [[event]] = await conn.execute('SELECT * FROM company_events WHERE id = ? FOR UPDATE', [eventId]);
    if (!event || !Number(event.is_active)) fail(404, 'Event not found');
    const [[thread]] = await conn.execute("SELECT id FROM chat_threads WHERE company_event_id = ? AND thread_type = 'group' AND message_channel = 'internal' LIMIT 1", [eventId]);
    if (!thread && !create) { await conn.commit(); return null; }
    const invitees = await listCompanyEventInvitees({ event, db: conn });
    const [managers] = await conn.execute(`SELECT DISTINCT u.id FROM users u
      JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
      WHERE u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
        AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL}) AND (ua.agency_role IS NULL OR LOWER(ua.agency_role) IN (${EVENT_STAFF_ROLES_SQL}))
        AND (u.id=? OR EXISTS(SELECT 1 FROM company_event_coordinators c WHERE c.company_event_id=? AND c.user_id=u.id))`, [event.agency_id, event.created_by_user_id, eventId]);
    const members = [...new Set([...invitees.map(user => Number(user.id)), ...managers.map(user => Number(user.id))])];
    if (!members.length) fail(400, 'Choose invitees before opening the event conversation.');
    let threadId = thread?.id;
    if (!threadId) {
      const [result] = await conn.execute("INSERT INTO chat_threads (agency_id,organization_id,company_event_id,thread_type,message_channel,name) VALUES (?,NULL,?,'group','internal',?)", [event.agency_id, eventId, event.title]);
      threadId = result.insertId;
    } else {
      await conn.execute('UPDATE chat_threads SET name=? WHERE id=?', [event.title, threadId]);
    }
    await conn.execute(`DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id NOT IN (${members.map(() => '?').join(',')})`, [threadId, ...members]);
    await conn.execute(`INSERT IGNORE INTO chat_thread_participants (thread_id,user_id) VALUES ${members.map(() => '(?,?)').join(',')}`, members.flatMap(userId => [threadId, userId]));
    await conn.commit();
    return { threadId: Number(threadId), agencyId: Number(event.agency_id), name: event.title, participantCount: members.length,
      url: `/messages?view=workspace&tab=dms&threadId=${threadId}&agencyId=${event.agency_id}` };
  } catch (error) { await conn.rollback(); throw error; }
  finally { conn.release(); }
}

export async function assertCompanyEventConversationMember({ threadId, userId, db = pool }) {
  const [[event]] = await db.execute(`SELECT e.* FROM chat_threads t JOIN company_events e ON e.id=t.company_event_id
    WHERE t.id=? AND t.thread_type='group' AND t.message_channel='internal'`, [threadId]);
  if (!event) return false;
  if (!Number(event.is_active)) fail(403, 'This event conversation is inactive.');
  if (await isCompanyEventInvitee({ event, userId, db })) return true;
  const [[actor]] = await db.execute(`SELECT u.id,u.role FROM users u JOIN user_agencies ua ON ua.user_id=u.id AND ua.agency_id=? AND COALESCE(ua.is_active,1)=1
    WHERE u.id=? AND u.is_active=1 AND COALESCE(u.is_archived,0)=0 AND u.terminated_at IS NULL
      AND LOWER(u.role) IN (${EVENT_STAFF_ROLES_SQL}) AND (ua.agency_role IS NULL OR LOWER(ua.agency_role) IN (${EVENT_STAFF_ROLES_SQL})) LIMIT 1`, [event.agency_id,userId]);
  if (!actor || !await canManageEventConversation(event, actor, db)) fail(403, 'You are no longer invited to this event.');
  return true;
}

export async function pruneUserCompanyEventConversations(userId, db=pool) {
  const [threads]=await db.execute("SELECT t.id FROM chat_threads t JOIN chat_thread_participants p ON p.thread_id=t.id WHERE p.user_id=? AND t.thread_type='group' AND t.company_event_id IS NOT NULL AND t.message_channel='internal'",[userId]);
  for(const thread of threads){
    try{await assertCompanyEventConversationMember({threadId:thread.id,userId,db});}
    catch(error){if(error.status!==403 && error.status!==404)throw error;await db.execute('DELETE FROM chat_thread_participants WHERE thread_id=? AND user_id=?',[thread.id,userId]);}
  }
}
