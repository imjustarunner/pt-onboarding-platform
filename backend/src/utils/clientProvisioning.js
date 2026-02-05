import pool from '../config/database.js';

async function hasTable(tableName) {
  const dbName = process.env.DB_NAME || 'onboarding_stage';
  const [rows] = await pool.execute(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [dbName, tableName]
  );
  return (rows || []).length > 0;
}

export async function resolvePaperworkStatusId({ agencyId, preferredKeys = ['all_needed', 'emailed_packet'] }) {
  const parsedAgencyId = parseInt(String(agencyId || ''), 10);
  if (!parsedAgencyId) return null;
  for (const key of preferredKeys) {
    const normalized = String(key || '').toLowerCase();
    if (!normalized) continue;
    const [rows] = await pool.execute(
      `SELECT id FROM paperwork_statuses WHERE agency_id = ? AND LOWER(status_key) = ? LIMIT 1`,
      [parsedAgencyId, normalized]
    );
    if (rows?.[0]?.id) return rows[0].id;
  }
  return null;
}

export async function seedClientAffiliations({ clientId, agencyId, organizationId }) {
  const parsedClientId = parseInt(String(clientId || ''), 10);
  const parsedAgencyId = parseInt(String(agencyId || ''), 10);
  const parsedOrgId = parseInt(String(organizationId || ''), 10);
  if (!parsedClientId) return;

  try {
    if (parsedAgencyId && (await hasTable('client_agency_assignments'))) {
      await pool.execute(
        `INSERT INTO client_agency_assignments (client_id, agency_id, is_primary, is_active)
         VALUES (?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE is_primary = TRUE, is_active = TRUE`,
        [parsedClientId, parsedAgencyId]
      );
    }
  } catch {
    // best-effort only
  }

  try {
    if (parsedOrgId && (await hasTable('client_organization_assignments'))) {
      await pool.execute(
        `INSERT INTO client_organization_assignments (client_id, organization_id, is_primary, is_active)
         VALUES (?, ?, TRUE, TRUE)
         ON DUPLICATE KEY UPDATE is_primary = TRUE, is_active = TRUE`,
        [parsedClientId, parsedOrgId]
      );
    }
  } catch {
    // best-effort only
  }
}

export async function seedClientPaperworkItems({ clientId, agencyId }) {
  const parsedClientId = parseInt(String(clientId || ''), 10);
  const parsedAgencyId = parseInt(String(agencyId || ''), 10);
  if (!parsedClientId || !parsedAgencyId) return;

  try {
    if (!(await hasTable('client_paperwork_items'))) return;
    const [statusRows] = await pool.execute(
      `SELECT id, status_key
       FROM paperwork_statuses
       WHERE agency_id = ?
       ORDER BY label ASC`,
      [parsedAgencyId]
    );
    const toSeed = (statusRows || []).filter((s) => String(s.status_key || '').toLowerCase() !== 'completed');
    for (const s of toSeed) {
      try {
        await pool.execute(
          `INSERT INTO client_paperwork_items (client_id, paperwork_status_id, is_needed, received_at, received_by_user_id)
           VALUES (?, ?, 1, NULL, NULL)
           ON DUPLICATE KEY UPDATE client_id = client_id`,
          [parsedClientId, s.id]
        );
      } catch {
        // ignore individual failures
      }
    }
  } catch {
    // best-effort only
  }
}
