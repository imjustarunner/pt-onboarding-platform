import pool from '../config/database.js';
import ClientGuardian from '../models/ClientGuardian.model.js';
import { ASSESSMENT_FAMILIES, getFamilyMeta } from './assessmentFamilyRegistry.js';

const FAMILY_TABLES = new Set(ASSESSMENT_FAMILIES.map((family) => family.table));

function publicOrigin() {
  return String(process.env.PUBLIC_APP_URL || process.env.FRONTEND_URL || process.env.APP_PUBLIC_URL || 'https://plottwisthq.com').replace(/\/+$/, '');
}

export function absolutePortalPath(path) {
  const value = String(path || '').trim();
  if (!value) return null;
  if (/^https?:\/\//i.test(value)) return value;
  return `${publicOrigin()}${value.startsWith('/') ? value : `/${value}`}`;
}

/**
 * Record one assessment or deliverable share and join the existing
 * 2-minute / 30-minute portal notice. Additions do not restart the window.
 * Pass skip for the Client Updater's first send, which already emails once.
 */
export async function queuePortalShareForClient({
  agencyId,
  clientId,
  kind,
  familyKey = null,
  referenceId,
  href = null,
  skip = false
} = {}) {
  if(process.env.CLIENT_UPDATE_WORKFLOWS_ENABLED!=='true')return {queued:0,held:true};
  if (skip) return { queued: 0 };
  const aid = Number(agencyId);
  const cid = Number(clientId);
  const ref = String(referenceId || '').trim();
  if (!aid || !cid || !ref || !['assessment', 'deliverable'].includes(kind)) return { queued: 0 };
  const guardians = await ClientGuardian.listForClient(cid);
  const recipients = (guardians || []).filter((guardian) => {
    const enabled = guardian.access_enabled === 1 || guardian.access_enabled === true;
    const permissions = guardian.permissions_json;
    return enabled && Number(guardian.is_active)===1 && guardian.guardian_user_id && permissions?.canViewDocs!==false && !permissions?.noView && !permissions?.noViewOtherGuardian;
  });
  if (!recipients.length) return { queued: 0 };
  const clinicalDb = (await import('../config/clinicalDatabase.js')).default;
  const { queueClinicalFormNotification } = await import('./safetyPlans/notificationQueue.js');
  const link = absolutePortalPath(href);
  let queued = 0;
  for (const guardian of recipients) {
    const {assertClientCanViewOwnShared}=await import('./assessmentDeliverable.service.js');
    try{const current=await assertClientCanViewOwnShared({user:{id:guardian.guardian_user_id,role:guardian.role},clientId:cid});if(Number(current.agency_id)!==aid||Number(current.client_id||current.id)!==cid)continue;}catch(error){if([403,404].includes(error.status))continue;throw error;}
    await pool.execute(
      `INSERT INTO client_portal_share_events
        (agency_id, client_id, recipient_user_id, kind, family_key, reference_id, href)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [aid, cid, Number(guardian.guardian_user_id), kind, familyKey || null, ref, link]
    );
    await queueClinicalFormNotification(clinicalDb, aid, Number(guardian.guardian_user_id));
    queued += 1;
  }
  return { queued };
}

export async function shareEventStillOpen(event, db = pool) {
  if(process.env.CLIENT_UPDATE_WORKFLOWS_ENABLED!=='true')return false;
  if (!event) return false;
  if (event.kind === 'deliverable') {
    const [rows] = await db.execute(
      `SELECT id FROM client_assessment_deliverables
       WHERE id = ? AND agency_id = ? AND client_id=? AND shared_with_client = 1 LIMIT 1`,
      [Number(event.reference_id), Number(event.agency_id),Number(event.client_id)]
    );
    return !!rows.length;
  }
  const meta = getFamilyMeta(event.family_key);
  const table = meta?.table;
  const id = Number(event.reference_id);
  if (!table || !FAMILY_TABLES.has(table) || !id) return false;
  try {
    const [rows] = await db.execute(`SELECT status FROM ${table} WHERE id = ? AND agency_id=? AND client_id=? LIMIT 1`, [id,Number(event.agency_id),Number(event.client_id)]);
    if (!rows.length) return false;
    const status = String(rows[0].status || '').toLowerCase();
    return status !== 'completed' && status !== 'archived';
  } catch (error) {
    if (!/unknown column/i.test(String(error?.message || ''))) return false;
    const [rows] = await db.execute(`SELECT id FROM ${table} WHERE id = ? AND agency_id=? AND client_id=? LIMIT 1`, [id,Number(event.agency_id),Number(event.client_id)]);
    return !!rows.length;
  }
}

export async function listOpenShareEvents({ agencyId, clientId, recipientUserId }, db = pool) {
  if(process.env.CLIENT_UPDATE_WORKFLOWS_ENABLED!=='true')return [];
  const [rows] = await db.execute(
    `SELECT * FROM client_portal_share_events
     WHERE agency_id = ? AND client_id = ? AND recipient_user_id = ?
       AND created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL 30 DAY)
     ORDER BY id DESC LIMIT 30`,
    [Number(agencyId), Number(clientId), Number(recipientUserId)]
  );
  const open = [];
  for (const row of rows || []) {
    if (!(await shareEventStillOpen(row, db))) continue;
    const meta = getFamilyMeta(row.family_key);
    open.push({
      id: Number(row.id),
      kind: row.kind,
      title: row.kind === 'deliverable' ? 'Shared report' : (meta?.title || 'Assessment'),
      href: row.href || null
    });
  }
  return open;
}
