/**
 * Dynamic / smart chat groups whose membership is derived from a rule
 * and reconciled on demand (and when the rule source changes).
 */
import pool from '../config/database.js';
import SupervisorAssignment from '../models/SupervisorAssignment.model.js';

const PROVIDER_LIKE = new Set([
  'provider',
  'provider_plus',
  'intern',
  'intern_plus',
  'supervisor',
  'clinical_practice_assistant'
]);

async function listOfficeAvailableUserIds(agencyId) {
  const aid = Number(agencyId);
  if (!aid) return [];
  const [rows] = await pool.execute(
    `SELECT DISTINCT u.id
     FROM users u
     INNER JOIN user_agencies ua ON ua.user_id = u.id AND ua.agency_id = ?
     WHERE COALESCE(u.in_office_available, 0) = 1
       AND COALESCE(u.is_active, 1) = 1
       AND COALESCE(u.is_archived, 0) = 0
       AND LOWER(COALESCE(u.role, '')) IN (${[...PROVIDER_LIKE].map(() => '?').join(',')})`,
    [aid, ...PROVIDER_LIKE]
  );
  return (rows || []).map((r) => Number(r.id)).filter(Boolean);
}

async function listSuperviseeUserIds(supervisorId, agencyId) {
  const ids = await SupervisorAssignment.getSuperviseeIds(supervisorId, agencyId);
  return (ids || []).map((x) => Number(x)).filter(Boolean);
}

async function setParticipants(threadId, desiredUserIds) {
  const tid = Number(threadId);
  const desired = new Set((desiredUserIds || []).map((x) => Number(x)).filter(Boolean));
  const [existing] = await pool.execute(
    `SELECT user_id FROM chat_thread_participants WHERE thread_id = ?`,
    [tid]
  );
  const have = new Set((existing || []).map((r) => Number(r.user_id)));

  const toAdd = [...desired].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !desired.has(id));

  if (toAdd.length) {
    const values = toAdd.map(() => '(?, ?)').join(',');
    const params = [];
    for (const uid of toAdd) params.push(tid, uid);
    await pool.execute(
      `INSERT IGNORE INTO chat_thread_participants (thread_id, user_id) VALUES ${values}`,
      params
    );
  }
  if (toRemove.length) {
    const placeholders = toRemove.map(() => '?').join(',');
    await pool.execute(
      `DELETE FROM chat_thread_participants
       WHERE thread_id = ? AND user_id IN (${placeholders})`,
      [tid, ...toRemove]
    );
  }
  return { added: toAdd.length, removed: toRemove.length, memberCount: desired.size };
}

/**
 * Ensure the agency "Office Available" channel exists and membership matches in_office_available.
 */
export async function ensureOfficeAvailableChannel(agencyId) {
  const aid = Number(agencyId);
  if (!aid) throw new Error('agencyId is required');

  const slug = 'office-available';
  const [existing] = await pool.execute(
    `SELECT id FROM chat_threads
     WHERE agency_id = ? AND thread_type = 'channel' AND membership_rule = 'office_available'
     LIMIT 1`,
    [aid]
  );
  let threadId = existing?.[0]?.id ? Number(existing[0].id) : null;
  if (!threadId) {
    const [ins] = await pool.execute(
      `INSERT INTO chat_threads
         (agency_id, organization_id, thread_type, name, slug, visibility, membership_rule, description)
       VALUES (?, NULL, 'channel', 'Office Available', ?, 'private', 'office_available',
               'Smart group: members who are Office Available. Client Exchange posts land here.')`,
      [aid, slug]
    );
    threadId = Number(ins.insertId);
  }

  const memberIds = await listOfficeAvailableUserIds(aid);
  await setParticipants(threadId, memberIds);
  return { threadId, memberIds };
}

/**
 * Ensure supervisor ↔ current supervisees channel and reconcile membership.
 */
export async function ensureSupervisorSuperviseesChannel({ agencyId, supervisorId }) {
  const aid = Number(agencyId);
  const sid = Number(supervisorId);
  if (!aid || !sid) throw new Error('agencyId and supervisorId are required');

  const slug = `supervisor-${sid}-supervisees`;
  const [existing] = await pool.execute(
    `SELECT id FROM chat_threads
     WHERE agency_id = ?
       AND membership_rule = 'supervisor_supervisees'
       AND membership_owner_user_id = ?
     LIMIT 1`,
    [aid, sid]
  );
  let threadId = existing?.[0]?.id ? Number(existing[0].id) : null;
  if (!threadId) {
    const [userRows] = await pool.execute(
      `SELECT first_name, last_name FROM users WHERE id = ? LIMIT 1`,
      [sid]
    );
    const name =
      [userRows?.[0]?.first_name, userRows?.[0]?.last_name].filter(Boolean).join(' ').trim() ||
      'Supervisor';
    const [ins] = await pool.execute(
      `INSERT INTO chat_threads
         (agency_id, organization_id, thread_type, name, slug, visibility,
          membership_rule, membership_owner_user_id, created_by_user_id)
       VALUES (?, NULL, 'channel', ?, ?, 'private', 'supervisor_supervisees', ?, ?)`,
      [aid, `${name} · Supervisees`, slug, sid, sid]
    );
    threadId = Number(ins.insertId);
  }

  const supervisees = await listSuperviseeUserIds(sid, aid);
  const memberIds = [...new Set([sid, ...supervisees])];
  await setParticipants(threadId, memberIds);
  return { threadId, memberIds };
}

export async function reconcileSmartGroup(threadId) {
  const tid = Number(threadId);
  const [rows] = await pool.execute(
    `SELECT id, agency_id, membership_rule, membership_owner_user_id
     FROM chat_threads WHERE id = ? LIMIT 1`,
    [tid]
  );
  const t = rows?.[0];
  if (!t?.membership_rule) return { ok: false, reason: 'not_smart' };
  if (t.membership_rule === 'office_available') {
    return ensureOfficeAvailableChannel(t.agency_id);
  }
  if (t.membership_rule === 'supervisor_supervisees') {
    return ensureSupervisorSuperviseesChannel({
      agencyId: t.agency_id,
      supervisorId: t.membership_owner_user_id
    });
  }
  return { ok: false, reason: 'unknown_rule' };
}

/**
 * Post a system/text message into a thread (plain body).
 */
export async function postSystemMessage({ threadId, senderUserId, body }) {
  const tid = Number(threadId);
  const uid = Number(senderUserId);
  const text = String(body || '').trim();
  if (!tid || !uid || !text) return null;
  const [ins] = await pool.execute(
    `INSERT INTO chat_messages (thread_id, sender_user_id, body) VALUES (?, ?, ?)`,
    [tid, uid, text]
  );
  return Number(ins.insertId);
}

/**
 * After a Client Exchange listing is created — refresh Office Available channel and announce.
 */
export async function announceClientExchangeListing({
  agencyId,
  listingId,
  postedByUserId,
  preview = null
}) {
  const { threadId, memberIds } = await ensureOfficeAvailableChannel(agencyId);
  if (!memberIds.length) {
    return { threadId, memberIds, messageId: null, skipped: 'no_office_available_members' };
  }
  const bits = [
    `Client Exchange: new listing #${listingId}`,
    preview ? String(preview).slice(0, 240) : null,
    'Open Client Exchange to request this client.'
  ].filter(Boolean);
  const messageId = await postSystemMessage({
    threadId,
    senderUserId: postedByUserId,
    body: bits.join('\n')
  });
  return { threadId, memberIds, messageId };
}

/**
 * Reconcile Office Available membership after a user toggles in_office_available.
 */
export async function onOfficeAvailabilityChanged({ userId, agencyIds = [] }) {
  const uid = Number(userId);
  let aids = (agencyIds || []).map((x) => Number(x)).filter(Boolean);
  if (!aids.length && uid) {
    const [rows] = await pool.execute(
      `SELECT agency_id FROM user_agencies WHERE user_id = ?`,
      [uid]
    );
    aids = (rows || []).map((r) => Number(r.agency_id)).filter(Boolean);
  }
  const out = [];
  for (const aid of aids.slice(0, 40)) {
    try {
      out.push(await ensureOfficeAvailableChannel(aid));
    } catch (e) {
      console.warn('[onOfficeAvailabilityChanged]', aid, e?.message || e);
    }
  }
  return out;
}
