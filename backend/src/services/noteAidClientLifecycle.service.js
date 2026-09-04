/**
 * Note Aid minimal clients: promote after chart setup, claim unassigned creates.
 */
import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import {
  setClientLifecycleStatus,
  LIFECYCLE_STATUS_KEYS
} from './clientLifecycleStatus.service.js';

const NOTE_AID_SOURCE = 'NOTE_AID_MINIMAL';

const ALREADY_ACTIVE = new Set([
  'current',
  'being_seen',
  'scheduled',
  'ready_to_schedule',
  'onboarded'
]);

const BLOCKED = new Set(['terminated', 'archived', 'waitlist', 'declined', 'dead']);

export async function promoteNoteAidClientAfterSetup({ clientId, actorUserId = null }) {
  const cid = Number(clientId || 0);
  if (!cid) throw Object.assign(new Error('clientId required'), { status: 400 });

  const [rows] = await pool.execute(
    `SELECT c.id, c.agency_id, c.provider_id, c.source, c.status, c.created_by_user_id,
            cs.status_key AS client_status_key
     FROM clients c
     LEFT JOIN client_statuses cs ON cs.id = c.client_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [cid]
  );
  const client = rows?.[0];
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });

  const source = String(client.source || '').toUpperCase();
  if (source !== NOTE_AID_SOURCE) {
    return { changed: false, skipped: 'not_note_aid', statusKey: client.client_status_key || null };
  }

  const statusKey = String(client.client_status_key || '').toLowerCase();
  if (BLOCKED.has(statusKey) || String(client.status || '').toUpperCase() === 'ARCHIVED') {
    return { changed: false, skipped: 'blocked_status', statusKey };
  }

  let providerId = client.provider_id ? Number(client.provider_id) : null;
  if (!providerId && actorUserId) {
    await Client.update(cid, { provider_id: Number(actorUserId) }, actorUserId);
    providerId = Number(actorUserId);
  }

  if (ALREADY_ACTIVE.has(statusKey)) {
    return {
      changed: false,
      skipped: 'already_active',
      statusKey,
      providerId,
      workflowStatus: 'ACTIVE'
    };
  }

  const result = await setClientLifecycleStatus({
    clientId: cid,
    statusKey: LIFECYCLE_STATUS_KEYS.CURRENT,
    actorUserId,
    note: 'Note Aid chart setup complete — moved to current / active caseload'
  });

  return {
    changed: !!result?.changed,
    statusKey: result?.statusKey || LIFECYCLE_STATUS_KEYS.CURRENT,
    providerId,
    workflowStatus: 'ACTIVE'
  };
}

/**
 * Assign provider_id = created_by_user_id for unassigned NOTE_AID_MINIMAL clients.
 * When onlyMine=true, only rows created by actorUserId are updated.
 */
export async function backfillNoteAidProviderAssignments({
  agencyId = null,
  actorUserId = null,
  onlyMine = true
} = {}) {
  const params = [NOTE_AID_SOURCE];
  let sql = `
    SELECT id, created_by_user_id, agency_id, full_name, initials
    FROM clients
    WHERE UPPER(COALESCE(source, '')) = ?
      AND provider_id IS NULL
      AND created_by_user_id IS NOT NULL
      AND status NOT IN ('ARCHIVED')
  `;
  if (agencyId) {
    sql += ` AND agency_id = ?`;
    params.push(Number(agencyId));
  }
  if (onlyMine && actorUserId) {
    sql += ` AND created_by_user_id = ?`;
    params.push(Number(actorUserId));
  }
  sql += ` ORDER BY id ASC LIMIT 500`;

  const [rows] = await pool.execute(sql, params);
  const updated = [];
  for (const row of rows || []) {
    const cid = Number(row.id);
    const pid = Number(row.created_by_user_id);
    if (!cid || !pid) continue;
    try {
      await Client.update(cid, { provider_id: pid }, actorUserId || pid);
      updated.push({
        id: cid,
        providerId: pid,
        fullName: row.full_name || null,
        initials: row.initials || null
      });
    } catch {
      // continue
    }
  }
  return { count: updated.length, clients: updated };
}
