import pool from '../config/database.js';

async function hasTable(tableName) {
  const dbName = process.env.DB_NAME || 'onboarding_stage';
  const [rows] = await pool.execute(
    "SELECT TABLE_NAME FROM information_schema.tables WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? LIMIT 1",
    [dbName, tableName]
  );
  return (rows || []).length > 0;
}

/**
 * Best-effort "are this client's documents/compliance items complete" check.
 * Used by the assign-day write-path to decide whether a client should promote to `current`
 * or stay `pending` (with a doc-status message) for the new school year.
 *
 * Prefers the granular per-client paperwork checklist (`client_paperwork_items`) when available;
 * falls back to the single `clients.paperwork_status_id` summary field otherwise.
 *
 * @returns {Promise<{ ok: boolean, missing: string[] }>}
 */
export async function evaluateClientDocCompliance({ clientId, agencyId }) {
  const cid = parseInt(clientId, 10);
  const aid = parseInt(agencyId, 10);
  if (!cid) return { ok: false, missing: ['Client not found'] };

  if (aid && (await hasTable('client_paperwork_items'))) {
    try {
      const [rows] = await pool.execute(
        `SELECT ps.label, cpi.is_needed
         FROM client_paperwork_items cpi
         INNER JOIN paperwork_statuses ps ON ps.id = cpi.paperwork_status_id
         WHERE cpi.client_id = ? AND ps.agency_id = ? AND LOWER(ps.status_key) <> 'completed'`,
        [cid, aid]
      );
      if ((rows || []).length > 0) {
        const missing = rows.filter((r) => r.is_needed).map((r) => r.label);
        return { ok: missing.length === 0, missing };
      }
    } catch {
      // Fall through to the simpler check below (checklist table missing/misconfigured).
    }
  }

  const [clientRows] = await pool.execute(
    `SELECT ps.status_key, ps.label
     FROM clients c
     LEFT JOIN paperwork_statuses ps ON ps.id = c.paperwork_status_id
     WHERE c.id = ?
     LIMIT 1`,
    [cid]
  );
  const key = String(clientRows?.[0]?.status_key || '').toLowerCase();
  if (!key) return { ok: false, missing: ['Documents needed'] };
  if (key === 'completed') return { ok: true, missing: [] };
  return { ok: false, missing: [clientRows?.[0]?.label || 'Documents needed'] };
}
