import pool from '../config/database.js';

/**
 * Ensure an active client_provider_assignments row exists for client+org+provider.
 * Idempotent; safe to call when the row already exists.
 */
export async function ensureClientProviderAssignmentRow(
  connection,
  { clientId, organizationId, providerUserId, serviceDay = null, userId = null, isPrimary = false }
) {
  const cid = parseInt(clientId, 10);
  const oid = parseInt(organizationId, 10);
  const pid = parseInt(providerUserId, 10);
  if (!cid || !oid || !pid) return { ok: false, reason: 'missing_ids' };

  const day = serviceDay ? String(serviceDay).trim() : null;
  const allowedDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const normalizedDay = day && allowedDays.includes(day) ? day : null;

  try {
    if (isPrimary) {
      try {
        await connection.execute(
          `UPDATE client_provider_assignments
           SET is_primary = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
           WHERE client_id = ?`,
          [userId || null, cid]
        );
      } catch {
        // is_primary column may not exist on older DBs
      }
    }

    await connection.execute(
      `INSERT INTO client_provider_assignments
        (client_id, organization_id, provider_user_id, service_day, is_active, created_by_user_id, updated_by_user_id${isPrimary ? ', is_primary' : ''})
       VALUES (?, ?, ?, ?, TRUE, ?, ?${isPrimary ? ', TRUE' : ''})
       ON DUPLICATE KEY UPDATE
         service_day = COALESCE(VALUES(service_day), service_day),
         is_active = TRUE,
         updated_by_user_id = VALUES(updated_by_user_id),
         updated_at = CURRENT_TIMESTAMP${isPrimary ? ', is_primary = TRUE' : ''}`,
      [cid, oid, pid, normalizedDay, userId || null, userId || null]
    );
    return { ok: true };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return { ok: false, reason: 'missing_table' };
    throw e;
  }
}

/**
 * Mirror legacy clients.provider_id onto every active org affiliation when CPA is missing.
 */
export async function syncLegacyProviderToAffiliatedOrgs(
  connection,
  { clientId, userId = null, serviceDay = null, isPrimary = false }
) {
  const cid = parseInt(clientId, 10);
  if (!cid) return { repaired: 0 };

  const [clientRows] = await connection.execute(
    `SELECT provider_id, service_day FROM clients WHERE id = ? LIMIT 1`,
    [cid]
  );
  const providerUserId = parseInt(clientRows?.[0]?.provider_id, 10);
  if (!providerUserId) return { repaired: 0 };

  const effectiveDay =
    serviceDay !== undefined && serviceDay !== null
      ? serviceDay
      : clientRows?.[0]?.service_day
        ? String(clientRows[0].service_day).trim()
        : null;

  const [coaRows] = await connection.execute(
    `SELECT organization_id
     FROM client_organization_assignments
     WHERE client_id = ? AND is_active = TRUE`,
    [cid]
  );
  const orgIds = [...new Set((coaRows || []).map((r) => parseInt(r.organization_id, 10)).filter(Boolean))];
  let repaired = 0;

  for (const organizationId of orgIds) {
    const [existing] = await connection.execute(
      `SELECT id
       FROM client_provider_assignments
       WHERE client_id = ? AND organization_id = ? AND provider_user_id = ? AND is_active = TRUE
       LIMIT 1`,
      [cid, organizationId, providerUserId]
    );
    if (existing?.[0]?.id) continue;

    const result = await ensureClientProviderAssignmentRow(connection, {
      clientId: cid,
      organizationId,
      providerUserId,
      serviceDay: effectiveDay,
      userId,
      isPrimary
    });
    if (result.ok) repaired += 1;
  }

  return { repaired };
}

/**
 * Deactivate all org-scoped provider assignments for a client (e.g. legacy provider cleared).
 */
export async function deactivateClientProviderAssignments(connection, { clientId, userId = null }) {
  const cid = parseInt(clientId, 10);
  if (!cid) return { deactivated: 0 };
  try {
    const [result] = await connection.execute(
      `UPDATE client_provider_assignments
       SET is_active = FALSE, updated_by_user_id = ?, updated_at = CURRENT_TIMESTAMP
       WHERE client_id = ? AND is_active = TRUE`,
      [userId || null, cid]
    );
    return { deactivated: Number(result?.affectedRows || 0) };
  } catch (e) {
    const msg = String(e?.message || '');
    const missing = msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE');
    if (missing) return { deactivated: 0 };
    throw e;
  }
}

/**
 * Mirror the primary (or most recent) active CPA row onto legacy clients.provider_id / service_day.
 */
export async function syncPrimaryLegacyFromClientAssignments(connection, { clientId, userId = null }) {
  const cid = parseInt(clientId, 10);
  if (!cid) return { ok: false };

  let next = null;
  try {
    const [nextRows] = await connection.execute(
      `SELECT provider_user_id, service_day
       FROM client_provider_assignments
       WHERE client_id = ? AND is_active = TRUE
       ORDER BY (CASE WHEN is_primary = TRUE OR is_primary = 1 THEN 1 ELSE 0 END) DESC, updated_at DESC
       LIMIT 1`,
      [cid]
    );
    next = nextRows?.[0] || null;
  } catch (e) {
    const msg = String(e?.message || '');
    const missingIsPrimary = msg.includes('Unknown column') && msg.includes('is_primary');
    if (!missingIsPrimary) throw e;
    const [nextRows] = await connection.execute(
      `SELECT provider_user_id, service_day
       FROM client_provider_assignments
       WHERE client_id = ? AND is_active = TRUE
       ORDER BY updated_at DESC
       LIMIT 1`,
      [cid]
    );
    next = nextRows?.[0] || null;
  }

  try {
    await connection.execute(
      `UPDATE clients
       SET provider_id = ?, service_day = ?, updated_by_user_id = COALESCE(?, updated_by_user_id), last_activity_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [next?.provider_user_id || null, next?.service_day || null, userId || null, cid]
    );
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

/**
 * Central hook after legacy clients.provider_id / service_day changes (any code path).
 */
export async function afterLegacyProviderFieldsChanged(
  connection,
  { clientId, userId = null, providerUserId, serviceDay = undefined, isPrimary = true }
) {
  const cid = parseInt(clientId, 10);
  if (!cid) return;

  const cleared =
    providerUserId === null || providerUserId === '' || providerUserId === undefined
      ? providerUserId === null || providerUserId === ''
      : false;

  if (cleared) {
    await deactivateClientProviderAssignments(connection, { clientId: cid, userId });
    return;
  }

  const pid = parseInt(providerUserId, 10);
  if (!pid) return;

  await syncLegacyProviderToAffiliatedOrgs(connection, {
    clientId: cid,
    userId,
    serviceDay,
    isPrimary
  });
}

/**
 * Central hook after scoped CPA upsert/delete — keep legacy columns aligned.
 */
export async function afterScopedProviderAssignmentChanged(connection, { clientId, userId = null, forceLegacy = false }) {
  const cid = parseInt(clientId, 10);
  if (!cid) return;
  if (forceLegacy) {
    await syncPrimaryLegacyFromClientAssignments(connection, { clientId: cid, userId });
    return;
  }

  const [clientRows] = await connection.execute(`SELECT provider_id FROM clients WHERE id = ? LIMIT 1`, [cid]);
  const hasLegacy = !!parseInt(clientRows?.[0]?.provider_id, 10);
  if (!hasLegacy) {
    await syncPrimaryLegacyFromClientAssignments(connection, { clientId: cid, userId });
  }
}

/**
 * Fill roster/provider views when clients.provider_id is set but org-scoped CPA rows are missing.
 */
export function enrichSchoolRosterClientProviders(rows) {
  return (rows || []).map((row) => {
    const providerIds = String(row.provider_ids || '').trim();
    const legacyPid = parseInt(row.legacy_provider_id, 10);
    if (providerIds || !legacyPid) return row;

    const first = String(row.legacy_provider_first_name || '').trim();
    const last = String(row.legacy_provider_last_name || '').trim();
    const name = [first, last].filter(Boolean).join(' ').trim() || `Provider ${legacyPid}`;
    const legacyDay = row.legacy_service_day ? String(row.legacy_service_day).trim() : '';

    return {
      ...row,
      provider_ids: String(legacyPid),
      provider_name: name,
      service_day: row.service_day || legacyDay || null,
      provider_day_pairs:
        row.provider_day_pairs || `${legacyPid}:${name}:${legacyDay}`
    };
  });
}

/**
 * Best-effort repair for roster loads: create missing CPA rows from legacy provider_id.
 */
export async function repairMissingProviderAssignmentsForSchool(schoolOrganizationId, clients, userId = null) {
  const schoolId = parseInt(schoolOrganizationId, 10);
  if (!schoolId) return { repaired: 0, clientIds: [] };

  const candidates = (clients || []).filter((c) => {
    const legacyPid = parseInt(c.legacy_provider_id, 10);
    const providerIds = String(c.provider_ids || '').trim();
    return legacyPid && !providerIds;
  });
  if (!candidates.length) return { repaired: 0, clientIds: [] };

  const connection = await pool.getConnection();
  let repaired = 0;
  const clientIds = [];
  try {
    for (const client of candidates) {
      const result = await syncLegacyProviderToAffiliatedOrgs(connection, {
        clientId: client.id,
        userId,
        serviceDay: client.legacy_service_day || null
      });
      if (result.repaired > 0) {
        repaired += result.repaired || 0;
        clientIds.push(parseInt(client.id, 10));
      }
    }
  } finally {
    connection.release();
  }
  return { repaired, clientIds: [...new Set(clientIds.filter(Boolean))] };
}

/**
 * Re-load org-scoped provider fields for roster rows after CPA repair.
 */
export async function refreshSchoolRosterProviderFields(schoolOrganizationId, clients, clientIds = null) {
  const schoolId = parseInt(schoolOrganizationId, 10);
  const ids = [...new Set((clientIds || (clients || []).map((c) => parseInt(c.id, 10))).filter(Boolean))];
  if (!schoolId || !ids.length) return clients || [];

  const placeholders = ids.map(() => '?').join(',');
  const [rows] = await pool.execute(
    `SELECT
       c.id,
       GROUP_CONCAT(DISTINCT CONCAT(u.first_name, ' ', u.last_name) ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ', ') AS provider_name,
       GROUP_CONCAT(DISTINCT cpa.provider_user_id ORDER BY u.last_name ASC, u.first_name ASC SEPARATOR ',') AS provider_ids,
       GROUP_CONCAT(DISTINCT cpa.service_day ORDER BY FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday') SEPARATOR ', ') AS service_day,
       GROUP_CONCAT(
         CONCAT(
           cpa.provider_user_id, ':',
           COALESCE(NULLIF(TRIM(CONCAT(COALESCE(u.first_name, ''), ' ', COALESCE(u.last_name, ''))), ''), 'Provider'),
           ':',
           COALESCE(cpa.service_day, '')
         )
         ORDER BY u.last_name ASC, u.first_name ASC, FIELD(cpa.service_day,'Monday','Tuesday','Wednesday','Thursday','Friday')
         SEPARATOR '|'
       ) AS provider_day_pairs,
       MIN(cpa.created_at) AS provider_assigned_at
     FROM clients c
     JOIN client_organization_assignments coa
       ON coa.client_id = c.id
      AND coa.organization_id = ?
      AND coa.is_active = TRUE
     LEFT JOIN client_provider_assignments cpa
       ON cpa.client_id = c.id
      AND cpa.organization_id = coa.organization_id
      AND cpa.is_active = TRUE
     LEFT JOIN users u ON u.id = cpa.provider_user_id
     WHERE c.id IN (${placeholders})
     GROUP BY c.id`,
    [schoolId, ...ids]
  );

  const byId = new Map((rows || []).map((r) => [parseInt(r.id, 10), r]));
  return (clients || []).map((row) => {
    const fresh = byId.get(parseInt(row.id, 10));
    if (!fresh) return row;
    return {
      ...row,
      provider_name: fresh.provider_name || row.provider_name || null,
      provider_ids: fresh.provider_ids || row.provider_ids || null,
      service_day: fresh.service_day || row.service_day || null,
      provider_day_pairs: fresh.provider_day_pairs || row.provider_day_pairs || null,
      provider_assigned_at: fresh.provider_assigned_at || row.provider_assigned_at || null
    };
  });
}
