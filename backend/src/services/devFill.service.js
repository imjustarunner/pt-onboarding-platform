import pool from '../config/database.js';
import Client from '../models/Client.model.js';
import ClientStatusHistory from '../models/ClientStatusHistory.model.js';
import User from '../models/User.model.js';

const BACKOFFICE_ROLES = new Set(['admin', 'super_admin', 'support', 'staff']);

export function isDevFillRequested(payload = {}) {
  return payload.createdViaDevFill === true
    || payload.devFillUsed === true
    || payload.created_via_dev_fill === true
    || payload.created_via_dev_fill === 1;
}

export async function userHasAgencyAccess(userId, agencyId) {
  const uid = Number(userId || 0);
  const aid = Number(agencyId || 0);
  if (!uid || !aid) return false;
  try {
    const [rows] = await pool.execute(
      `SELECT 1 FROM user_agencies WHERE user_id = ? AND agency_id = ? LIMIT 1`,
      [uid, aid]
    );
    return Boolean(rows?.[0]);
  } catch {
    return false;
  }
}

export async function canUseDevFill(user, agencyId) {
  if (!user?.id) return false;
  const role = String(user.role || '').toLowerCase();
  if (!BACKOFFICE_ROLES.has(role)) return false;
  if (role === 'super_admin') return true;
  if (role === 'admin') {
    return userHasAgencyAccess(user.id, agencyId);
  }
  // support/staff: same agency scoping as admin for assisted intake
  return userHasAgencyAccess(user.id, agencyId);
}

/**
 * Resolve whether an authenticated intake submission should mark Dev Fill records.
 * Returns { enabled, actorUserId, agencyId }.
 */
export async function resolveDevFillContext({ req, agencyId, payload }) {
  if (!isDevFillRequested(payload || {})) {
    return { enabled: false, actorUserId: null, agencyId: Number(agencyId || 0) || null };
  }
  const user = req?.user;
  if (!user?.id) return { enabled: false, actorUserId: null, agencyId: null };
  const aid = Number(agencyId || 0) || null;
  const allowed = await canUseDevFill(user, aid);
  if (!allowed) return { enabled: false, actorUserId: null, agencyId: aid };
  return { enabled: true, actorUserId: user.id, agencyId: aid };
}

export async function logDevFillCreation({
  actorUserId,
  agencyId = null,
  entityType,
  entityId,
  intakeSubmissionId = null,
  source = null,
  metadata = null
}) {
  const actor = Number(actorUserId || 0);
  const entity = Number(entityId || 0);
  if (!actor || !entity || !entityType) return;
  try {
    await pool.execute(
      `INSERT INTO dev_fill_creation_log
         (actor_user_id, agency_id, entity_type, entity_id, intake_submission_id, source, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        actor,
        agencyId ? Number(agencyId) : null,
        entityType,
        entity,
        intakeSubmissionId ? Number(intakeSubmissionId) : null,
        source ? String(source).slice(0, 64) : null,
        metadata ? JSON.stringify(metadata) : null
      ]
    );
  } catch (err) {
    console.warn('[devFill] creation log failed', err?.message || err);
  }
}

export async function markClientDevFill({
  clientId,
  actorUserId,
  agencyId = null,
  intakeSubmissionId = null,
  source = null,
  metadata = null
}) {
  const id = Number(clientId || 0);
  if (!id) return;
  try {
    await pool.execute(
      `UPDATE clients SET created_via_dev_fill = 1 WHERE id = ?`,
      [id]
    );
  } catch (err) {
    if (!/Unknown column/i.test(String(err?.message || ''))) throw err;
    return;
  }
  await logDevFillCreation({
    actorUserId,
    agencyId,
    entityType: 'client',
    entityId: id,
    intakeSubmissionId,
    source,
    metadata
  });
}

export async function markGuardianDevFill({
  guardianUserId,
  actorUserId,
  agencyId = null,
  intakeSubmissionId = null,
  source = null,
  metadata = null
}) {
  const id = Number(guardianUserId || 0);
  if (!id) return;
  try {
    await pool.execute(
      `UPDATE users SET created_via_dev_fill = 1 WHERE id = ? AND role = 'client_guardian'`,
      [id]
    );
  } catch (err) {
    if (!/Unknown column/i.test(String(err?.message || ''))) throw err;
    return;
  }
  await logDevFillCreation({
    actorUserId,
    agencyId,
    entityType: 'guardian',
    entityId: id,
    intakeSubmissionId,
    source,
    metadata
  });
}

export async function applyDevFillAfterIntakeCreate({
  devFillContext,
  clients = [],
  guardianUser = null,
  intakeSubmissionId = null,
  source = null
}) {
  if (!devFillContext?.enabled) return;
  const { actorUserId, agencyId } = devFillContext;
  for (const client of clients || []) {
    if (client?.id) {
      await markClientDevFill({
        clientId: client.id,
        actorUserId,
        agencyId,
        intakeSubmissionId,
        source,
        metadata: { clientInitials: client.initials || null }
      });
    }
  }
  if (guardianUser?.id) {
    await markGuardianDevFill({
      guardianUserId: guardianUser.id,
      actorUserId,
      agencyId,
      intakeSubmissionId,
      source,
      metadata: { email: guardianUser.email || null }
    });
  }
}

export async function complianceArchiveClient({ clientId, actorUserId, note = null }) {
  const id = Number(clientId || 0);
  if (!id) throw Object.assign(new Error('Invalid client id'), { status: 400 });
  const client = await Client.findById(id);
  if (!client) throw Object.assign(new Error('Client not found'), { status: 404 });
  if (client.compliance_archived_at) {
    return client;
  }
  if (Number(client.created_via_dev_fill) === 1) {
    throw Object.assign(new Error('Dev Fill clients should be permanently deleted, not compliance-archived'), { status: 409 });
  }
  await pool.execute(
    `UPDATE clients
     SET status = 'ARCHIVED',
         compliance_archived_at = NOW(),
         compliance_archived_by_user_id = ?
     WHERE id = ?`,
    [actorUserId || null, id]
  );
  await ClientStatusHistory.create({
    client_id: id,
    changed_by_user_id: actorUserId || null,
    field_changed: 'compliance_archived',
    from_value: client.status || null,
    to_value: 'ARCHIVED',
    note: note || 'Compliance archive (deleted for auditing)'
  }).catch(() => null);
  return Client.findById(id);
}

export async function complianceArchiveGuardian({ guardianUserId, actorUserId, note = null }) {
  const id = Number(guardianUserId || 0);
  if (!id) throw Object.assign(new Error('Invalid guardian id'), { status: 400 });
  const guardian = await User.findById(id);
  if (!guardian || String(guardian.role || '').toLowerCase() !== 'client_guardian') {
    throw Object.assign(new Error('Guardian not found'), { status: 404 });
  }
  if (guardian.compliance_archived_at) return guardian;
  if (Number(guardian.created_via_dev_fill) === 1) {
    throw Object.assign(new Error('Dev Fill guardians should be permanently deleted'), { status: 409 });
  }
  await pool.execute(
    `UPDATE users
     SET is_archived = TRUE,
         archived_at = COALESCE(archived_at, NOW()),
         status = 'ARCHIVED',
         compliance_archived_at = NOW(),
         compliance_archived_by_user_id = ?
     WHERE id = ?`,
    [actorUserId || null, id]
  );
  return User.findById(id);
}

async function fetchGuardianSummariesForClient(clientId) {
  const [rows] = await pool.execute(
    `SELECT u.id, u.first_name, u.last_name, u.email,
            u.created_via_dev_fill, u.compliance_archived_at
     FROM client_guardians cg
     JOIN users u ON u.id = cg.guardian_user_id
     WHERE cg.client_id = ?`,
    [clientId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    name: `${r.first_name || ''} ${r.last_name || ''}`.trim() || r.email || `User ${r.id}`,
    email: r.email || null,
    createdViaDevFill: Number(r.created_via_dev_fill) === 1,
    complianceArchived: Boolean(r.compliance_archived_at)
  }));
}

async function fetchClientSummariesForGuardian(guardianUserId) {
  const [rows] = await pool.execute(
    `SELECT c.id, c.initials, c.full_name, c.identifier_code,
            c.created_via_dev_fill, c.compliance_archived_at, c.status
     FROM client_guardians cg
     JOIN clients c ON c.id = cg.client_id
     WHERE cg.guardian_user_id = ?`,
    [guardianUserId]
  );
  return (rows || []).map((r) => ({
    id: Number(r.id),
    label: r.initials || r.full_name || r.identifier_code || `Client ${r.id}`,
    createdViaDevFill: Number(r.created_via_dev_fill) === 1,
    complianceArchived: Boolean(r.compliance_archived_at),
    status: r.status || null
  }));
}

export async function getClientDeletePreview(clientId) {
  const id = Number(clientId || 0);
  const [rows] = await pool.execute(
    `SELECT id, initials, full_name, identifier_code, status,
            created_via_dev_fill, compliance_archived_at
     FROM clients WHERE id = ? LIMIT 1`,
    [id]
  );
  const client = rows?.[0];
  if (!client) return null;
  const guardians = await fetchGuardianSummariesForClient(id);
  const relatedClients = [];
  for (const g of guardians) {
    const linked = await fetchClientSummariesForGuardian(g.id);
    for (const c of linked) {
      if (c.id !== id && !relatedClients.some((x) => x.id === c.id)) {
        relatedClients.push(c);
      }
    }
  }
  const isDevFill = Number(client.created_via_dev_fill) === 1;
  return {
    client: {
      id,
      label: client.initials || client.full_name || client.identifier_code || `Client ${id}`,
      createdViaDevFill: isDevFill,
      complianceArchived: Boolean(client.compliance_archived_at),
      status: client.status || null
    },
    guardians,
    relatedClients,
    deleteMode: isDevFill ? 'permanent' : 'compliance_archive',
    requiresConfirmation: guardians.length > 0 || relatedClients.length > 0
  };
}

export async function getGuardianDeletePreview(guardianUserId) {
  const id = Number(guardianUserId || 0);
  const [rows] = await pool.execute(
    `SELECT id, first_name, last_name, email, role,
            created_via_dev_fill, compliance_archived_at, is_archived
     FROM users WHERE id = ? LIMIT 1`,
    [id]
  );
  const guardian = rows?.[0];
  if (!guardian || String(guardian.role || '').toLowerCase() !== 'client_guardian') return null;
  const linkedClients = await fetchClientSummariesForGuardian(id);
  const isDevFill = Number(guardian.created_via_dev_fill) === 1;
  return {
    guardian: {
      id,
      name: `${guardian.first_name || ''} ${guardian.last_name || ''}`.trim() || guardian.email || `User ${id}`,
      email: guardian.email || null,
      createdViaDevFill: isDevFill,
      complianceArchived: Boolean(guardian.compliance_archived_at)
    },
    linkedClients,
    deleteMode: isDevFill ? 'permanent' : 'compliance_archive',
    requiresConfirmation: linkedClients.length > 0
  };
}

export async function getBulkGuardiansDeletePreview(guardianIds = []) {
  const previews = [];
  for (const rawId of guardianIds) {
    const preview = await getGuardianDeletePreview(rawId);
    if (preview) previews.push(preview);
  }
  const requiresConfirmation = previews.some((p) => p.requiresConfirmation);
  const hasReal = previews.some((p) => !p.guardian.createdViaDevFill);
  const hasDevFill = previews.some((p) => p.guardian.createdViaDevFill);
  return { previews, requiresConfirmation, hasReal, hasDevFill };
}

export async function getBulkClientsDeletePreview(clientIds = []) {
  const previews = [];
  for (const rawId of clientIds) {
    const preview = await getClientDeletePreview(rawId);
    if (preview) previews.push(preview);
  }
  const requiresConfirmation = previews.some((p) => p.requiresConfirmation);
  const hasReal = previews.some((p) => !p.client.createdViaDevFill);
  const hasDevFill = previews.some((p) => p.client.createdViaDevFill);
  return { previews, requiresConfirmation, hasReal, hasDevFill };
}

export async function permanentDeleteDevFillClient(conn, clientId) {
  const bestEffortDelete = async (sql, params) => {
    try {
      await conn.execute(sql, params);
    } catch (e) {
      const msg = String(e?.message || '');
      const missing = msg.includes('ER_NO_SUCH_TABLE') || msg.includes("doesn't exist");
      if (!missing) throw e;
    }
  };

  await bestEffortDelete(`DELETE FROM client_note_reads WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_notes WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_status_history WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_paperwork_history WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_paperwork_items WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_access_logs WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_phi_documents WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_guardians WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_provider_assignments WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM client_organization_assignments WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM soft_schedule_slots WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM school_provider_schedule_entries WHERE client_id = ?`, [clientId]);
  await bestEffortDelete(`DELETE FROM dev_fill_creation_log WHERE entity_type = 'client' AND entity_id = ?`, [clientId]);

  const [del] = await conn.execute(`DELETE FROM clients WHERE id = ? AND created_via_dev_fill = 1`, [clientId]);
  return (del?.affectedRows || 0) > 0;
}

export async function permanentDeleteDevFillGuardian(guardianUserId, { deleteLinkedDevFillClients = false } = {}) {
  const guardianId = Number(guardianUserId || 0);
  if (!guardianId) return false;

  const [guardianRows] = await pool.execute(
    `SELECT id, created_via_dev_fill FROM users WHERE id = ? AND role = 'client_guardian' LIMIT 1`,
    [guardianId]
  );
  const guardian = guardianRows?.[0];
  if (!guardian || Number(guardian.created_via_dev_fill) !== 1) {
    throw Object.assign(new Error('Only Dev Fill guardians can be permanently deleted'), { status: 409 });
  }

  const linkedClients = await fetchClientSummariesForGuardian(guardianId);
  if (deleteLinkedDevFillClients) {
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const c of linkedClients) {
        if (c.createdViaDevFill) {
          await permanentDeleteDevFillClient(conn, c.id);
        }
      }
      await conn.execute('DELETE FROM client_guardians WHERE guardian_user_id = ?', [guardianId]);
      await conn.execute('DELETE FROM user_agencies WHERE user_id = ?', [guardianId]);
      await conn.execute(`DELETE FROM dev_fill_creation_log WHERE entity_type = 'guardian' AND entity_id = ?`, [guardianId]);
      const [del] = await conn.execute(
        `DELETE FROM users WHERE id = ? AND role = 'client_guardian' AND created_via_dev_fill = 1`,
        [guardianId]
      );
      await conn.commit();
      return (del?.affectedRows || 0) > 0;
    } catch (e) {
      try { await conn.rollback(); } catch { /* ignore */ }
      throw e;
    } finally {
      conn.release();
    }
  }

  await pool.execute('DELETE FROM client_guardians WHERE guardian_user_id = ?', [guardianId]);
  await pool.execute('DELETE FROM user_agencies WHERE user_id = ?', [guardianId]);
  await pool.execute(`DELETE FROM dev_fill_creation_log WHERE entity_type = 'guardian' AND entity_id = ?`, [guardianId]);
  const [del] = await pool.execute(
    `DELETE FROM users WHERE id = ? AND role = 'client_guardian' AND created_via_dev_fill = 1`,
    [guardianId]
  );
  return (del?.affectedRows || 0) > 0;
}
