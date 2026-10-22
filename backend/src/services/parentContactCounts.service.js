import pool from '../config/database.js';

// Call only for clients the caller has already authorized. No message bodies,
// participants, or sibling details are returned to school views.
export async function attachParentContactCounts(clients, db = pool) {
  const ids = [...new Set(clients.map(c => Number(c.id)).filter(id => Number.isSafeInteger(id) && id > 0))];
  if (!ids.length) return;
  const [rows] = await db.execute(`SELECT client_id,COUNT(*) AS attempts
    FROM client_parent_contact_attempts WHERE client_id IN (${ids.map(() => '?').join(',')}) GROUP BY client_id`, ids);
  const counts = new Map(rows.map(r => [Number(r.client_id), Number(r.attempts)]));
  for (const client of clients) client.parent_contact_attempt_count = counts.get(Number(client.id)) || 0;
}
