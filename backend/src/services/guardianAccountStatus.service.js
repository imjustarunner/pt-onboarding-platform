import pool from '../config/database.js';

/** Invitation status is child-specific; an enabled link is not a signed enrollment. */
export async function guardianAccountStatuses({ clientId, guardians = [], db = pool }) {
  if (!guardians.length) return [];
  const [rows] = await db.execute(`SELECT cg.guardian_user_id,
      i.id AS invitation_id, i.status AS enrollment_status, i.expires_at AS invitation_expires_at
    FROM client_guardians cg
    JOIN clients c ON c.id = cg.client_id
    JOIN users u ON u.id = cg.guardian_user_id
    LEFT JOIN co_guardian_invites i ON i.id = (
      SELECT MAX(ci.id) FROM co_guardian_invites ci
      JOIN co_guardian_invite_clients ic ON ic.invite_id = ci.id
      WHERE ic.client_id = cg.client_id AND ci.agency_id = c.agency_id
        AND (ci.accepted_user_id = u.id OR LOWER(TRIM(ci.invited_email)) COLLATE utf8mb4_unicode_ci = LOWER(TRIM(u.email)) COLLATE utf8mb4_unicode_ci))
    WHERE cg.client_id = ?`, [Number(clientId)]);
  const statuses = new Map(rows.map(row => [Number(row.guardian_user_id), row]));
  return guardians.map(guardian => {
    const row = statuses.get(Number(guardian.guardian_user_id));
    const expired = row?.enrollment_status === 'pending' && new Date(row.invitation_expires_at).getTime() <= Date.now();
    return { ...guardian, enrollment_status: expired ? 'expired' : row?.enrollment_status || null, invitation_id: row?.invitation_id || null };
  });
}
