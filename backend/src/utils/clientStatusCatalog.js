import pool from '../config/database.js';

export async function getClientStatusIdByKey({ agencyId, statusKey }) {
  const aId = parseInt(agencyId, 10);
  if (!aId || !statusKey) return null;
  const [rows] = await pool.execute(
    `SELECT id
     FROM client_statuses
     WHERE agency_id = ? AND LOWER(status_key) = ? AND is_active = TRUE
     LIMIT 1`,
    [aId, String(statusKey).toLowerCase()]
  );
  return rows?.[0]?.id || null;
}
