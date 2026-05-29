import pool from '../config/database.js';

/**
 * Ensure a company_event_clients row exists for event enrollment workflow
 * (registrants / participants tabs, intake outcome, treatment plan).
 */
export async function ensureCompanyEventClientEnrollment({
  eventId,
  agencyId,
  clientId,
  actorUserId = null
}) {
  const eid = Number(eventId);
  const aid = Number(agencyId);
  const cid = Number(clientId);
  if (!eid || !aid || !cid) return { ok: false };

  await pool.execute(
    `INSERT INTO company_event_clients
       (company_event_id, agency_id, client_id, enrolled_by_user_id, is_active)
     VALUES (?, ?, ?, ?, TRUE)
     ON DUPLICATE KEY UPDATE is_active = TRUE`,
    [eid, aid, cid, actorUserId || null]
  );
  return { ok: true };
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
