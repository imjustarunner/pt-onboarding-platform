import pool from '../config/database.js';
import {randomUUID} from 'node:crypto';
import {reactivateClientForActivity} from './clientReactivation.service.js';

/**
 * Ensure a company_event_clients row exists for event enrollment workflow
 * (registrants / participants tabs, intake outcome, treatment plan).
 */
export async function ensureCompanyEventClientEnrollment({
  eventId,
  agencyId,
  clientId,
  actorUserId = null,
  db = pool
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  const cid = Number(clientId);
  if (!eid || !aid || !cid) return { ok: false };

  const own=db===pool,connection=own?await db.getConnection():db;
  try{
  if(own)await connection.beginTransaction();
  await connection.execute('SELECT id FROM clients WHERE id=? FOR UPDATE',[cid]);
  const [[prior]]=await connection.execute('SELECT id,is_active FROM company_event_clients WHERE company_event_id=? AND agency_id=? AND client_id=? FOR UPDATE',[eid,aid,cid]);
  await connection.execute(
    `INSERT INTO company_event_clients
       (company_event_id, agency_id, client_id, enrolled_by_user_id, is_active)
     VALUES (?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [eid, aid, cid, actorUserId || null]
  );
  if(!prior||!Number(prior.is_active))await reactivateClientForActivity({clientId:cid,agencyId:aid,trigger:'event_registration',sourceId:`event:${eid}:${randomUUID()}`,actorUserId},{executor:connection});
  if(own)await connection.commit();
  return { ok: true };
  }catch(error){if(own)await connection.rollback();throw error;}finally{if(own)connection.release();}
}

/**
 * Skills-group-backed events enroll via skills_group_clients; mirror those rows
 * into company_event_clients so the event portal Participants workflow can see them.
 */
export async function syncSkillsGroupClientsToCompanyEventClients(eventId, agencyId) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  if (!eid || !aid) return { synced: 0 };

  const [sgRows] = await pool.execute(
    `SELECT sg.id
     FROM skills_groups sg
     WHERE sg.company_event_id = ? AND sg.agency_id = ?
     LIMIT 1`,
    [eid, aid]
  );
  const sgId = Number(sgRows?.[0]?.id || 0);
  if (!sgId) return { synced: 0 };

  const [result] = await pool.execute(
    `INSERT INTO company_event_clients
       (company_event_id, agency_id, client_id, enrolled_by_user_id, is_active)
     SELECT ?, ?, sgc.client_id, NULL, TRUE
     FROM skills_group_clients sgc
     WHERE sgc.skills_group_id = ?
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [eid, aid, sgId]
  );
  return { synced: Number(result?.affectedRows || 0) };
}
